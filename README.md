# SSCKK 백엔드 (`BE_v2`)

TeamSSCKK의 모임 중간 장소 및 식당 추천 서비스 백엔드입니다. Supabase PostgreSQL과 Edge Functions를 사용합니다.

## 프로젝트 정보

- Supabase 프로젝트 ID: `oufchidafmrxgympbcqo`
- 프로젝트 URL: `https://oufchidafmrxgympbcqo.supabase.co`
- REST API 기본 URL: `https://oufchidafmrxgympbcqo.supabase.co/rest/v1`
- Edge Functions 기본 URL: `https://oufchidafmrxgympbcqo.supabase.co/functions/v1`

Supabase 클라이언트를 초기화할 때는 `/rest/v1/`이 없는 프로젝트 URL을 사용합니다.

## 로컬 환경변수

`.env.local` 파일에 한 줄당 하나의 값을 입력합니다.

```env
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
NAVER_SEARCH_CLIENT_ID=네이버_검색_Client_ID
NAVER_SEARCH_CLIENT_SECRET=네이버_검색_Client_Secret
ODSAY_API_KEY=ODsay_API_Key
```

환경변수 작성 규칙:

1. `=` 앞뒤에 공백을 넣지 않습니다.
2. 특별히 필요한 경우가 아니라면 값에 따옴표를 붙이지 않습니다.
3. Supabase JWT 앞에 마침표를 붙이지 않습니다. 정상적인 키는 `eyJ...`로 시작합니다.
4. `.env.local`은 절대 Git에 커밋하지 않습니다.
5. `SUPABASE_SERVICE_ROLE_KEY`와 네이버 Client Secret은 프론트엔드에 노출하지 않습니다.

네이버 지도 JavaScript API의 Client ID는 프론트엔드 환경변수에 설정합니다.

```env
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=네이버_지도_Client_ID
NEXT_PUBLIC_SUPABASE_URL=https://oufchidafmrxgympbcqo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## Supabase Secrets 등록

`.env.local`은 로컬 개발용입니다. Edge Function을 배포하기 전 서버 전용 키를 Supabase Secrets에 등록합니다.

```powershell
supabase secrets set --env-file .env.local
```

배포된 Edge Function에는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`가 자동으로 제공됩니다. 네이버 검색 API, ODsay API, 허용 Origin 등 프로젝트 전용 값은 별도로 Secrets에 등록합니다.

## ODsay API 키

URI 플랫폼 키를 사용하는 경우 요청을 보내는 프론트엔드 주소가 ODsay에 등록되어 있어야 합니다.

```text
http://localhost:3000
http://127.0.0.1:3000
```

URI 키는 브라우저 요청에 사용하며 허용 URI를 제한해야 합니다. 서버에서 ODsay를 호출하려면 서버 플랫폼 키와 호출 서버의 공인 IP 설정이 필요합니다.

## 상태 확인 함수

기본 상태 확인 함수는 `supabase/functions/health/index.ts`에 있습니다.

```powershell
supabase functions serve health --env-file .env.local
```

배포 후 호출 주소:

```text
https://oufchidafmrxgympbcqo.supabase.co/functions/v1/health
```

정상 응답 예시:

```json
{
  "ok": true,
  "service": "ssckk-backend",
  "timestamp": "2026-06-15T00:00:00.000Z"
}
```

## DB 마이그레이션

- `202606150001_initial_schema.sql`: 새 프로젝트용 전체 스키마
- `202606150002_upgrade_existing_schema.sql`: 기존 `DB SQL.txt` 구조를 추천 API에 맞게 확장
- `202606150003_fix_recommendation_metric_columns.sql`: 기존 컬럼과 충돌하지 않는 분 단위 추천 지표 추가
- `202606150004_seoul_transit_hubs.sql`: 서울 전체 지하철역 후보 테이블과 초기 seed 추가

Supabase CLI 연결 후 적용합니다.

```powershell
supabase link --project-ref oufchidafmrxgympbcqo
supabase db push
```

## 장소 추천 API

장소 추천 함수는 `supabase/functions/recommend-places`에 있습니다.

```powershell
supabase functions serve recommend-places --env-file .env.local
```

요청·응답과 추천 점수 계산식은 [`docs/place-recommendation-api.md`](docs/place-recommendation-api.md)를 참고합니다.

## 서울 지하철역 동기화

서울 열린데이터광장의 `subwayStationMaster` API에서 서울 범위 역 좌표를 가져옵니다. `.env.local`과 Supabase Secrets에 아래 값을 등록해야 합니다.

```env
SEOUL_OPEN_DATA_API_KEY=서울_열린데이터광장_인증키
SEOUL_DATA_SYNC_TOKEN=임의의_긴_관리자_토큰
```

동기화 함수 호출 시 `x-sync-token` 헤더에 동일한 관리자 토큰을 전달합니다.
