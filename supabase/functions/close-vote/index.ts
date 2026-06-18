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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("환경 변수가 설정되지 않았습니다.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { meetingId, finalCandidateId, voteType } = await req.json();

    if (!meetingId || !finalCandidateId || !voteType) {
      return new Response(
        JSON.stringify({ error: "필수 요청 데이터가 누락되었습니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const decisionData: any = {};
    let nextStatus = "";

    if (voteType === "PLACE") {
      decisionData.final_place_candidate_id = finalCandidateId;
      nextStatus = "LOCATION_DECIDED";
    } else if (voteType === "RESTAURANT") {
      decisionData.final_restaurant_candidate_id = finalCandidateId;
      nextStatus = "RESTAURANT_DECIDED";
    } else {
      throw new Error("유효하지 않은 voteType 입니다.");
    }

    // 1. final_decision 처리 (Upsert)
    const { error: upsertError } = await supabase
      .from("final_decision")
      .upsert(
        { meeting_id: meetingId, ...decisionData },
        { onConflict: "meeting_id" }
      );

    if (upsertError) throw new Error(upsertError.message);

    // 2. meeting 상태 업데이트
    const { error: statusUpdateError } = await supabase
      .from("meeting")
      .update({ status: nextStatus })
      .eq("meeting_id", meetingId);

    if (statusUpdateError) throw new Error(statusUpdateError.message);

    return new Response(
      JSON.stringify({ message: "성공", status: nextStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});