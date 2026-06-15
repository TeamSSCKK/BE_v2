import { errorResponse, HttpError, jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import type { ParticipantOrigin, SeoulHub, TransportType } from "./model.ts";
import { rankPlaces, selectNearbyHubs } from "./scoring.ts";
import { SEOUL_HUBS } from "./seoul-hubs.ts";

interface RecommendationRequest {
  meetingId?: number;
  inviteCode?: string;
  limit?: number;
}

interface ParticipantRow {
  participant_id: number;
  participant_name: string;
  participant_location: Array<{
    latitude: number;
    longitude: number;
    preferred_transport: TransportType;
  }> | {
    latitude: number;
    longitude: number;
    preferred_transport: TransportType;
  } | null;
}

interface TransitHubRow {
  station_name: string;
  line_name: string;
  latitude: number;
  longitude: number;
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

    const meetingId = Number(body.meetingId);
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
    if (!["RECRUITING", "PLACE_RECOMMENDING"].includes(meeting.status)) {
      throw new HttpError(
        409,
        "현재 모임 상태에서는 장소 추천을 다시 생성할 수 없습니다.",
        "INVALID_MEETING_STATUS",
      );
    }

    const { data: participants, error: participantsError } = await supabase
      .from("participant")
      .select(
        "participant_id,participant_name,participant_location(latitude,longitude,preferred_transport)",
      )
      .eq("meeting_id", meetingId);

    if (participantsError) throw participantsError;

    const origins = ((participants ?? []) as ParticipantRow[]).flatMap<ParticipantOrigin>(
      (participant) => {
        const relation = participant.participant_location;
        const location = Array.isArray(relation) ? relation[0] : relation;
        if (!location) return [];
        return [{
          participantId: participant.participant_id,
          participantName: participant.participant_name,
          latitude: location.latitude,
          longitude: location.longitude,
          transportType: location.preferred_transport ?? "PUBLIC",
        }];
      },
    );

    if (origins.length === 0) {
      throw new HttpError(
        409,
        "출발 위치를 입력한 참가자가 없습니다.",
        "NO_PARTICIPANT_LOCATIONS",
      );
    }

    const { data: transitHubRows, error: transitHubError } = await supabase
      .from("seoul_transit_hub")
      .select("station_name,line_name,latitude,longitude")
      .eq("active_yn", true)
      .limit(1000);
    if (transitHubError) throw transitHubError;

    const databaseHubs: SeoulHub[] = ((transitHubRows ?? []) as TransitHubRow[])
      .map((hub) => ({
        name: hub.station_name.endsWith("역") ? hub.station_name : `${hub.station_name}역`,
        category: hub.line_name,
        address: "서울특별시",
        latitude: hub.latitude,
        longitude: hub.longitude,
      }));
    const availableHubs = databaseHubs.length > 0 ? databaseHubs : SEOUL_HUBS;
    const nearbyHubs = selectNearbyHubs(origins, availableHubs, 30);
    const rankedPlaces = rankPlaces(origins, nearbyHubs, limit);

    const { error: statusError } = await supabase
      .from("meeting")
      .update({ status: "PLACE_RECOMMENDING" })
      .eq("meeting_id", meetingId);
    if (statusError) throw statusError;

    const { error: deleteError } = await supabase
      .from("place_candidate")
      .delete()
      .eq("meeting_id", meetingId);
    if (deleteError) throw deleteError;

    const { data: savedPlaces, error: insertError } = await supabase
      .from("place_candidate")
      .insert(
        rankedPlaces.map((place) => ({
          meeting_id: meetingId,
          place_name: place.name,
          category: place.category,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
          avg_pub_travel_time: place.averageMinutes,
          max_travel_minutes: place.maxMinutes,
          travel_time_stddev_minutes: place.standardDeviation,
          recommendation_score: place.fairnessScore,
          recommendation_rank: place.rank,
          calculation_method: "DISTANCE_FALLBACK",
          selected_for_vote_yn: true,
        })),
      )
      .select("place_candidate_id,recommendation_rank");

    if (insertError) throw insertError;

    const savedIdByRank = new Map(
      (savedPlaces ?? []).map((place) => [
        place.recommendation_rank,
        place.place_candidate_id,
      ]),
    );

    const travelRows = rankedPlaces.flatMap((place) => {
      const candidateId = savedIdByRank.get(place.rank);
      if (!candidateId) return [];
      return place.memberTravels.map((travel) => ({
        place_candidate_id: candidateId,
        participant_id: travel.participantId,
        travel_minutes: travel.minutes,
        transport_type: travel.transportType,
        calculation_method: "DISTANCE_FALLBACK",
      }));
    });

    if (travelRows.length > 0) {
      const { error: travelError } = await supabase
        .from("place_candidate_travel")
        .insert(travelRows);
      if (travelError) throw travelError;
    }

    const { error: readyError } = await supabase
      .from("meeting")
      .update({ status: "PLACE_VOTING" })
      .eq("meeting_id", meetingId);
    if (readyError) throw readyError;

    return jsonResponse(request, {
      calculationMethod: "DISTANCE_FALLBACK",
      places: rankedPlaces.map((place) => ({
        id: String(savedIdByRank.get(place.rank)),
        name: place.name,
        category: place.category,
        address: place.address,
        lat: place.latitude,
        lng: place.longitude,
        rank: place.rank,
        averageMinutes: place.averageMinutes,
        maxMinutes: place.maxMinutes,
        standardDeviation: place.standardDeviation,
        fairnessScore: place.fairnessScore,
        memberTravels: place.memberTravels.map((travel) => ({
          memberId: String(travel.participantId),
          memberName: travel.participantName,
          minutes: travel.minutes,
        })),
      })),
      origins: origins.map((origin) => ({
        memberId: String(origin.participantId),
        memberName: origin.participantName,
        lat: origin.latitude,
        lng: origin.longitude,
      })),
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
