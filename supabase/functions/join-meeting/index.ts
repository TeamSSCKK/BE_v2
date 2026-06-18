import { errorResponse, HttpError, jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface JoinMeetingRequest {
  inviteCode?: string;
  participantName?: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") {
    return errorResponse(
      request,
      new HttpError(405, "POST 요청만 지원합니다.", "METHOD_NOT_ALLOWED")
    );
  }

  try {
    const body = (await request.json()) as JoinMeetingRequest;
    if (!body.inviteCode || !body.participantName) {
      throw new HttpError(400, "inviteCode와 participantName이 필요합니다.", "BAD_REQUEST");
    }

    const supabase = createAdminClient();

    const { data: meeting, error: meetingError } = await supabase
      .from("meeting")
      .select("meeting_id, status")
      .eq("invite_link", body.inviteCode)
      .maybeSingle();

    if (meetingError) throw meetingError;
    if (!meeting) {
      throw new HttpError(404, "모임을 찾을 수 없습니다.", "MEETING_NOT_FOUND");
    }
    if (meeting.status !== "RECRUITING") {
      throw new HttpError(409, "현재 참여할 수 없는 모임입니다.", "INVALID_MEETING_STATUS");
    }

    const accessToken = crypto.randomUUID();

    const { data: participant, error: insertError } = await supabase
      .from("participant")
      .insert([{
        meeting_id: meeting.meeting_id,
        participant_name: body.participantName,
        role: "MEMBER",
        access_token: accessToken
      }])
      .select("participant_id, access_token")
      .single();

    if (insertError) throw insertError;

    return jsonResponse(request, {
      participantId: participant.participant_id,
      accessToken: participant.access_token,
      meetingId: meeting.meeting_id
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});