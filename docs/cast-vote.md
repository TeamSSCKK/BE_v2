# 투표 등록 API

## 요청

```http
POST /functions/v1/cast-vote
Content-Type: application/json
```

```json
{
  "meetingId": "모임 ID",
  "participantId": "참가자 ID",
  "candidateId": "후보 ID (장소 또는 식당)",
  "voteType": "PLACE | RESTAURANT"
}
```

`meetingId`, `participantId`, `candidateId`, `voteType` 네 가지 필드는 모두 필수입니다.

`voteType`이 `PLACE`이면 장소 투표, `RESTAURANT`이면 식당 투표로 처리됩니다. 투표가 성공하면 해당 참가자의 투표 완료 여부(`place_vote_yn` 또는 `restaurant_vote_yn`)가 자동으로 `true`로 갱신됩니다.

## 처리 흐름

현재 모임 상태가 `voteType`과 일치해야 합니다.

| voteType | 허용 모임 상태 |
|---|---|
| `PLACE` | `PLACE_VOTING` |
| `RESTAURANT` | `RESTAURANT_VOTING` |

상태가 일치하지 않으면 투표는 거부됩니다.

## 성공 응답

```json
{
  "message": "투표가 성공적으로 기록되었습니다."
}
```

## 오류 코드

| HTTP | 설명 |
|---|---|
| 400 | `meetingId`, `participantId`, `candidateId`, `voteType` 중 하나 이상 누락 |
| 500 | 모임 정보를 찾을 수 없음 |
| 500 | 투표 기간이 아님 (모임 상태 불일치) |
| 500 | 투표 데이터 저장 실패 |