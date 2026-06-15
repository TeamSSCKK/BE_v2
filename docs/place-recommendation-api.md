# 장소 추천 API

## 요청

```http
POST /functions/v1/recommend-places
Content-Type: application/json
```

```json
{
  "meetingId": 1,
  "inviteCode": "초대 링크에 저장된 코드",
  "limit": 5
}
```

현재 모임 상태가 `RECRUITING` 또는 `PLACE_RECOMMENDING`이고, 위치를 입력한 참가자가 한 명 이상이어야 합니다.

## 추천 점수

후보별 참가자 이동시간을 이용해 아래 값을 계산합니다.

```text
공정성 비용 = 평균 이동시간 × 0.50
            + 최대 이동시간 × 0.25
            + 이동시간 표준편차 × 0.25
```

공정성 비용이 낮은 장소부터 추천합니다. 현재 MVP는 서울 대표 교통 거점과 거리 기반 예상 이동시간을 사용하며 응답의 `calculationMethod`는 `DISTANCE_FALLBACK`입니다. ODsay 실측 시간을 연결하면 같은 점수 계산식을 유지하고 계산 방식만 `ODSAY`로 변경합니다.

## 성공 응답

```json
{
  "calculationMethod": "DISTANCE_FALLBACK",
  "places": [
    {
      "id": "1",
      "name": "공덕역",
      "category": "공항철도·지하철역",
      "address": "서울특별시 마포구 마포대로 100",
      "lat": 37.544,
      "lng": 126.9516,
      "rank": 1,
      "averageMinutes": 31,
      "maxMinutes": 42,
      "standardDeviation": 7.5,
      "fairnessScore": 27.875,
      "memberTravels": [
        {
          "memberId": "1",
          "memberName": "참가자",
          "minutes": 24
        }
      ]
    }
  ],
  "origins": [
    {
      "memberId": "1",
      "memberName": "참가자",
      "lat": 37.5665,
      "lng": 126.978
    }
  ]
}
```

## 오류 코드

| HTTP | 코드 | 설명 |
|---|---|---|
| 400 | `INVALID_MEETING_ID` | `meetingId`가 올바르지 않음 |
| 400 | `INVITE_CODE_REQUIRED` | 초대 코드 누락 |
| 404 | `MEETING_NOT_FOUND` | 모임 또는 초대 코드가 일치하지 않음 |
| 409 | `INVALID_MEETING_STATUS` | 추천을 생성할 수 없는 모임 상태 |
| 409 | `NO_PARTICIPANT_LOCATIONS` | 위치 입력 참가자가 없음 |

