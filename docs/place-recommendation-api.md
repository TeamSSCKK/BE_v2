# 장소 추천 API

## 요청

```http
POST /functions/v1/recommend-places
Content-Type: application/json
```

```json
{
  "inviteCode": "초대 링크에 저장된 코드",
  "limit": 5
}
```

프론트엔드는 초대 코드만 전달할 수 있다. 내부 관리·테스트 요청에서는 선택적으로 `meetingId`를 함께 전달하여 두 값의 일치 여부를 검증할 수 있다.

현재 모임 상태가 `RECRUITING` 또는 `PLACE_RECOMMENDING`이고, 위치를 입력한 참가자가 한 명 이상이어야 합니다.

## 추천 점수

후보별 참가자 이동시간을 이용해 아래 값을 계산합니다.

```text
공정성 비용 = 평균 이동시간 × 0.50
            + 최대 이동시간 × 0.25
            + 이동시간 표준편차 × 0.25
```

공정성 비용이 낮은 장소부터 추천합니다. 참가자 중심점과 가까운 서울 지하철역 30개를 선택하고 거리 기반 점수로 8개를 1차 선별한 뒤, ODsay 대중교통 길찾기로 실제 이동시간을 조회합니다. ODsay 호출 실패·경로 없음·시간 초과가 발생한 구간만 거리 기반 예상값으로 대체합니다. 모든 구간이 ODsay로 계산되면 응답의 `calculationMethod`는 `ODSAY`, fallback이 포함되면 `DISTANCE_FALLBACK`입니다.

## 성공 응답

```json
{
  "calculationMethod": "ODSAY",
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
| 400 | `INVITE_CODE_REQUIRED` | 초대 코드 누락 |
| 404 | `MEETING_NOT_FOUND` | 모임 또는 초대 코드가 일치하지 않음 |
| 409 | `INVALID_MEETING_STATUS` | 추천을 생성할 수 없는 모임 상태 |
| 409 | `NO_PARTICIPANT_LOCATIONS` | 위치 입력 참가자가 없음 |
