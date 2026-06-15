import { errorResponse, HttpError, jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { searchRestaurants } from "./naver-search-adapter.ts";
import type { RestaurantPreference } from "./model.ts";
import { rankRestaurants } from "./scoring.ts";

interface RecommendationRequest {
  meetingId?: number;
  inviteCode?: string;
  placeCandidateId?: number;
  limit?: number;
}

interface PlaceCandidateRow {
  place_candidate_id: number;
  meeting_id: number;
  place_name: string;
  latitude: number;
  longitude: number;
}

interface PreferenceRow {
  preference_type: RestaurantPreference["type"];
  preference_value: string;
}

function buildQueries(placeName: string, preferences: RestaurantPreference[]): string[] {
  const preferredFoods = [...new Set(
    preferences
      .filter((preference) => preference.type === "LIKE")
      .map((preference) => preference.value.trim())
      .filter(Boolean),
  )].slice(0, 4);

  return [
    `${placeName} 맛집`,
    ...preferredFoods.map((food) => `${placeName} ${food} 맛집`),
  ];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") {
    return errorResponse(
      request,
      new HttpError(405, "POST 요청만 지원합니다.", "METHOD_NOT_ALLOWED"),
    );
  }

  try {
    const body = (await request.json()) as RecommendationRequest;
    if (!Number.isInteger(body.meetingId) || Number(body.meetingId) <= 0) {
      throw new HttpError(400, "유효한 meetingId가 필요합니다.", "INVALID_MEETING_ID");
    }
    if (!body.inviteCode) {
      throw new HttpError(400, "inviteCode가 필요합니다.", "INVITE_CODE_REQUIRED");
    }
    if (!Number.isInteger(body.placeCandidateId) || Number(body.placeCandidateId) <= 0) {
      throw new HttpError(
        400,
        "유효한 placeCandidateId가 필요합니다.",
        "INVALID_PLACE_CANDIDATE_ID",
      );
    }

    const meetingId = Number(body.meetingId);
    const placeCandidateId = Number(body.placeCandidateId);
    const limit = Math.max(1, Math.min(body.limit ?? 5, 5));
    const supabase = createAdminClient();

    const { data: meeting, error: meetingError } = await supabase
      .from("meeting")
      .select("meeting_id,status")
      .eq("meeting_id", meetingId)
      .eq("invite_link", body.inviteCode)
      .maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting) {
      throw new HttpError(404, "모임을 찾을 수 없습니다.", "MEETING_NOT_FOUND");
    }
    if (!["PLACE_VOTING", "RESTAURANT_RECOMMENDING", "RESTAURANT_VOTING"].includes(meeting.status)) {
      throw new HttpError(
        409,
        "현재 모임 상태에서는 식당 추천을 생성할 수 없습니다.",
        "INVALID_MEETING_STATUS",
      );
    }

    const { data: place, error: placeError } = await supabase
      .from("place_candidate")
      .select("place_candidate_id,meeting_id,place_name,latitude,longitude")
      .eq("place_candidate_id", placeCandidateId)
      .eq("meeting_id", meetingId)
      .maybeSingle();
    if (placeError) throw placeError;
    if (!place) {
      throw new HttpError(404, "장소 후보를 찾을 수 없습니다.", "PLACE_CANDIDATE_NOT_FOUND");
    }
    const selectedPlace = place as PlaceCandidateRow;

    const { data: preferenceRows, error: preferenceError } = await supabase
      .from("participant_preference")
      .select("preference_type,preference_value,participant!inner(meeting_id)")
      .eq("participant.meeting_id", meetingId);
    if (preferenceError) throw preferenceError;

    const preferences = ((preferenceRows ?? []) as PreferenceRow[]).map((row) => ({
      type: row.preference_type,
      value: row.preference_value,
    }));
    const queries = buildQueries(selectedPlace.place_name, preferences);

    const { error: statusError } = await supabase
      .from("meeting")
      .update({ status: "RESTAURANT_RECOMMENDING" })
      .eq("meeting_id", meetingId);
    if (statusError) throw statusError;

    const searchResults = await searchRestaurants(queries);
    const rankedRestaurants = rankRestaurants(
      {
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
      },
      searchResults,
      preferences,
      limit,
    );

    if (rankedRestaurants.length === 0) {
      await supabase
        .from("meeting")
        .update({ status: "PLACE_VOTING" })
        .eq("meeting_id", meetingId);
      throw new HttpError(
        404,
        "조건에 맞는 주변 식당을 찾지 못했습니다.",
        "NO_RESTAURANTS_FOUND",
      );
    }

    const { error: deleteError } = await supabase
      .from("restaurant_candidate")
      .delete()
      .eq("place_candidate_id", placeCandidateId);
    if (deleteError) throw deleteError;

    const { data: savedRestaurants, error: insertError } = await supabase
      .from("restaurant_candidate")
      .insert(
        rankedRestaurants.map((restaurant) => ({
          place_candidate_id: placeCandidateId,
          restaurant_name: restaurant.name,
          food_type: restaurant.category.split(">").at(-1) ?? restaurant.category,
          category: restaurant.category,
          address: restaurant.roadAddress || restaurant.address,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          preference_score: restaurant.preferenceScore,
          distance_meters: restaurant.distanceMeters,
          source_url: restaurant.sourceUrl || null,
          search_rank: restaurant.searchRank,
          recommendation_rank: restaurant.recommendationRank,
          reservation_available_yn: false,
        })),
      )
      .select("restaurant_candidate_id,recommendation_rank");
    if (insertError) throw insertError;

    const idByRank = new Map(
      (savedRestaurants ?? []).map((restaurant) => [
        restaurant.recommendation_rank,
        restaurant.restaurant_candidate_id,
      ]),
    );

    const { error: readyError } = await supabase
      .from("meeting")
      .update({ status: "RESTAURANT_VOTING" })
      .eq("meeting_id", meetingId);
    if (readyError) throw readyError;

    return jsonResponse(request, {
      place: {
        id: String(selectedPlace.place_candidate_id),
        name: selectedPlace.place_name,
        lat: selectedPlace.latitude,
        lng: selectedPlace.longitude,
      },
      restaurants: rankedRestaurants.map((restaurant) => ({
        id: String(idByRank.get(restaurant.recommendationRank)),
        name: restaurant.name,
        category: restaurant.category,
        address: restaurant.roadAddress || restaurant.address,
        lat: restaurant.latitude,
        lng: restaurant.longitude,
        distanceMeters: restaurant.distanceMeters,
        preferenceScore: restaurant.preferenceScore,
        rank: restaurant.recommendationRank,
        matchedLikes: restaurant.matchedLikes,
        matchedDislikes: restaurant.matchedDislikes,
        sourceUrl: restaurant.sourceUrl,
        reservationAvailable: false,
      })),
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});

