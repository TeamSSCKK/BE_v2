# 투표 종료 API

## 요청

```http
POST /functions/v1/close-vote
Content-Type: application/json
```

```json
{
  "meetingId": "모임 ID",
  "finalCandidateId": "최종 결정된 후보 ID",
  "voteType": "PLACE | RESTAURANT"
}
```

`meetingId`, `finalCandidateId`, `voteType` 세 가지 필드는 모두 필수입니다.

`voteType`에 따라 `final_decision` 테이블에 최종 후보가 기록되고 모임 상태가 갱신됩니다. `final_decision` 레코드가 이미 존재하면 업데이트, 없으면 새로 삽입합니다(Upsert).

## 상태 전이

| voteType | 저장 컬럼 | 다음 모임 상태 |
|---|---|---|
| `PLACE` | `final_place_candidate_id` | `LOCATION_DECIDED` |
| `RESTAURANT` | `final_restaurant_candidate_id` | `RESTAURANT_DECIDED` |

## 성공 응답

```json
{
  "message": "성공",
  "status": "LOCATION_DECIDED | RESTAURANT_DECIDED"
}
```

`status` 필드는 투표 종료 후 전이된 모임 상태를 반환합니다.

## 오류 코드

| HTTP | 설명 |
|---|---|
| 400 | `meetingId`, `finalCandidateId`, `voteType` 중 하나 이상 누락 |
| 500 | 유효하지 않은 `voteType` |
| 500 | `final_decision` 조회·삽입·업데이트 실패 |
| 500 | 모임 상태 업데이트 실패 |
| 500 | 환경 변수 미설정 (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) |