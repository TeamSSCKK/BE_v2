import { errorResponse, HttpError, jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface CreateMeetingRequest {
  meetingName?: string;
  meetingDatetime?: string;
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
    const body = (await request.json()) as CreateMeetingRequest;
    if (!body.meetingName || !body.meetingDatetime) {
      throw new HttpError(400, "meetingName과 meetingDatetime이 필요합니다.", "BAD_REQUEST");
    }

    // 8자리 무작위 초대 코드 생성
    const inviteCode = crypto.randomUUID().split("-")[0].toUpperCase();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("meeting")
      .insert([{
        meeting_name: body.meetingName,
        meeting_datetime: body.meetingDatetime,
        invite_link: inviteCode,
        status: "RECRUITING"
      }])
      .select("meeting_id, invite_link, status")
      .single();

    if (error) throw error;

    return jsonResponse(request, {
      meetingId: data.meeting_id,
      inviteCode: data.invite_link,
      status: data.status
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});