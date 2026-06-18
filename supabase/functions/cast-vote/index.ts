import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { meetingId, participantId, candidateId, voteType } = await req.json();

    if (!meetingId || !participantId || !candidateId || !voteType) {
      return new Response(
        JSON.stringify({ error: "meetingId, participantId, candidateId, voteType가 모두 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. 모임 상태 검증
    const { data: meetingData, error: meetingError } = await supabase
      .from("meeting")
      .select("status") 
      .eq("meeting_id", meetingId)
      .single();

    if (meetingError || !meetingData) throw new Error("모임 정보를 찾을 수 없습니다.");
    const currentStatus = meetingData.status;

    // 2. 비즈니스 로직 가드 조건 검사
    if (voteType === "PLACE" && currentStatus !== "PLACE_VOTING") {
      throw new Error(`장소 투표 기간이 아닙니다. (현재 상태: ${currentStatus})`);
    }
    if (voteType === "RESTAURANT" && currentStatus !== "RESTAURANT_VOTING") {
      throw new Error(`식당 투표 기간이 아닙니다. (현재 상태: ${currentStatus})`);
    }

    // 3. vote 테이블 삽입용 데이터 조립 (ERD에 맞게 분기 처리)
    // ERD를 보면 vote 테이블에는 meeting_id가 없습니다. participant_id와 식별id만 들어갑니다!
    const voteData: any = {
      participant_id: participantId,
      vote_type: voteType,
    };

    if (voteType === "PLACE") {
      voteData.place_candidate_id = candidateId; 
    } else if (voteType === "RESTAURANT") {
      voteData.restaurant_candidate_id = candidateId; 
    }

    // 4. 투표 데이터 저장
    const { error: voteError } = await supabase
      .from("vote")
      .insert([voteData]);

    if (voteError) throw new Error(`투표 저장 실패: ${voteError.message}`);

    // 5. participant 테이블의 투표 완료 여부 상태(yn) 업데이트
    const updateColumn = voteType === "PLACE" ? "place_vote_yn" : "restaurant_vote_yn";
    const { error: updateError } = await supabase
      .from("participant")
      .update({ [updateColumn]: true })
      .eq("participant_id", participantId);

    if (updateError) throw new Error(`참가자 상태 업데이트 실패: ${updateError.message}`);

    return new Response(
      JSON.stringify({ message: "투표가 성공적으로 기록되었습니다." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});