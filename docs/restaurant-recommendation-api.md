# 식당 추천 API

## 요청

```http
POST /functions/v1/recommend-restaurants
Content-Type: application/json
```

```json
{
  "meetingId": 1,
  "inviteCode": "초대 코드",
  "placeCandidateId": 10,
  "limit": 5
}
```

`placeCandidateId`는 장소 투표 또는 주최자 결정으로 확정한 장소 후보 ID이다.

## 추천 처리

1. 확정 장소명과 참가자 선호 음식으로 네이버 지역 검색어를 생성한다.
2. 검색어별 리뷰순 상위 5개 업체를 조회한다.
3. 동일 이름과 주소를 가진 결과를 제거한다.
4. 카페·디저트·베이커리 업종을 식사 후보에서 제외한다.
5. 확정 장소 반경 2km 밖의 업체와 음식 제약 조건에 해당하는 업체를 제외한다.
6. 선호 일치, 비선호 일치, 검색 순위, 거리를 이용해 점수를 계산한다.
7. 상위 5개를 DB에 저장하고 모임 상태를 `RESTAURANT_VOTING`으로 변경한다.

```text
식당 점수 = 선호 일치 수 × 30
          - 비선호 일치 수 × 40
          + 검색 순위 점수
          + 거리 점수
```

## 성공 응답

```json
{
  "place": {
    "id": "10",
    "name": "강남역",
    "lat": 37.4979,
    "lng": 127.0276
  },
  "restaurants": [
    {
      "id": "21",
      "name": "식당명",
      "category": "한식>육류,고기요리",
      "address": "서울특별시 ...",
      "lat": 37.5,
      "lng": 127.02,
      "distanceMeters": 350,
      "preferenceScore": 42.5,
      "rank": 1,
      "matchedLikes": ["한식"],
      "matchedDislikes": [],
      "sourceUrl": "",
      "reservationAvailable": false
    }
  ]
}
```
