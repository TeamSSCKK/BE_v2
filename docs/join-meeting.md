# `join-meeting` Edge Function 코드 설명

## 개요

Supabase Edge Function으로 작성된 **모임 참여 API**입니다.  
참여자가 초대 코드로 모임을 조회하고, 유효한 모임이라면 참여자를 등록한 뒤 개인 액세스 토큰을 발급합니다.  
시퀀스 다이어그램 **seq3 (모임 참여하기)** 의 흐름을 서버 측에서 구현합니다.

---

## 전체 흐름

```
클라이언트 POST 요청
    └─ 메서드 검증 (OPTIONS / POST 외 차단)
        └─ 요청 바디 파싱 (inviteCode, participantName)
            └─ 필수값 검증
                └─ 초대 코드로 모임 조회
                    ├─ 모임 없음 → 404
                    ├─ 상태가 RECRUITING 아님 → 409
                    └─ 액세스 토큰 생성
                        └─ participant 테이블에 insert
                            └─ 응답 반환 (participantId, accessToken, meetingId)
```

---

## 타입 정의

```typescript
interface JoinMeetingRequest {
  inviteCode?: string;
  participantName?: string;
}
```

| 필드 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `inviteCode` | string | ✅ 필수 | 모임 초대 코드 (create-meeting에서 발급한 8자리) |
| `participantName` | string | ✅ 필수 | 참여자 이름 또는 닉네임 |

두 필드 모두 `?`(optional)로 선언되어 있지만, 함수 내부에서 실제 필수값 검증을 수행합니다.

---

## 메서드 분기 처리

```typescript
if (request.method === "OPTIONS") return optionsResponse(request);
if (request.method !== "POST") {
  return errorResponse(
    request,
    new HttpError(405, "POST 요청만 지원합니다.", "METHOD_NOT_ALLOWED")
  );
}
```

| 메서드 | 처리 |
|---|---|
| `OPTIONS` | CORS preflight 응답 반환 |
| `POST` | 정상 처리 진행 |
| 그 외 | 405 Method Not Allowed 오류 반환 |

---

## 필수값 검증

```typescript
const body = (await request.json()) as JoinMeetingRequest;
if (!body.inviteCode || !body.participantName) {
  throw new HttpError(400, "inviteCode와 participantName이 필요합니다.", "BAD_REQUEST");
}
```

- 요청 바디를 JSON으로 파싱합니다.
- 두 필드 중 하나라도 비어있으면 `400 Bad Request`를 던집니다.
- `!body.inviteCode`는 `null`, `undefined`, 빈 문자열 `""` 모두 걸러냅니다.

---

## 모임 조회 및 유효성 검증

```typescript
const { data: meeting, error: meetingError } = await supabase
  .from("meeting")
  .select("meeting_id, status")
  .eq("invite_link", body.inviteCode)
  .maybeSingle();
```

- `meeting` 테이블에서 `invite_link`가 요청한 `inviteCode`와 일치하는 행을 조회합니다.
- `.maybeSingle()`: 결과가 0개이면 `null`을 반환합니다 (`.single()`은 0개일 때 오류 발생).

```typescript
if (meetingError) throw meetingError;
if (!meeting) {
  throw new HttpError(404, "모임을 찾을 수 없습니다.", "MEETING_NOT_FOUND");
}
if (meeting.status !== "RECRUITING") {
  throw new HttpError(409, "현재 참여할 수 없는 모임입니다.", "INVALID_MEETING_STATUS");
}
```

조회 후 세 가지 오류를 순서대로 검증합니다.

| 조건 | HTTP 상태 | 에러 코드 | 설명 |
|---|---|---|---|
| DB 오류 | 500 | - | Supabase 자체 오류 |
| 모임 없음 | 404 | `MEETING_NOT_FOUND` | 잘못된 초대 코드 |
| 상태 비정상 | 409 | `INVALID_MEETING_STATUS` | 모집 완료·확정된 모임 |

> **왜 status를 검증하는가?**  
> 클래스 다이어그램의 `Status` 열거형에서 `RECRUITING` 상태일 때만 참여가 허용됩니다.  
> `VOTING` 또는 `CLOSED` 상태의 모임에는 새 참여자가 들어올 수 없어야 하며,  
> seq3 대안 흐름에서 "유효하지 않은 링크인 경우 참여를 중단한다"는 명세를 반영합니다.

---

## 액세스 토큰 생성

```typescript
const accessToken = crypto.randomUUID();
```

- UUID v4 전체(36자리)를 액세스 토큰으로 사용합니다.
- 초대 코드(8자리)와 달리 사용자가 직접 입력하는 값이 아니므로 전체 UUID를 그대로 사용합니다.
- 이 토큰은 이후 해당 참여자임을 인증하는 수단이 됩니다.

> **왜 별도 토큰이 필요한가?**  
> 본 서비스는 로그인 없는 링크 기반 참여 구조입니다.  
> 참여자가 자신의 위치·취향을 이후에 수정하거나 투표할 때,  
> 이 토큰을 요청 헤더에 포함시켜 "나는 이 모임의 참여자다"를 증명합니다.

---

## 참여자 DB 저장

```typescript
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
```

| 컬럼 | 값 | 설명 |
|---|---|---|
| `meeting_id` | 조회된 `meeting.meeting_id` | 어느 모임에 속하는지 |
| `participant_name` | 요청 바디의 `participantName` | 참여자 이름 |
| `role` | `"MEMBER"` | 일반 참여자 (주최자는 `"HOST"`) |
| `access_token` | 생성된 UUID | 이후 인증에 사용할 개인 토큰 |

- `.select(...).single()`: insert 후 생성된 행을 즉시 조회합니다.
- 클래스 다이어그램 `Participant` 엔티티의 `role: Role` 필드(`MEMBER` 값)에 대응합니다.

---

## 응답

```typescript
return jsonResponse(request, {
  participantId: participant.participant_id,
  accessToken: participant.access_token,
  meetingId: meeting.meeting_id
});
```

성공 시 아래 형태로 응답합니다.

```json
{
  "participantId": 7,
  "accessToken": "550e8400-e29b-41d4-a716-446655440000",
  "meetingId": 42
}
```

| 필드 | 설명 |
|---|---|
| `participantId` | DB에서 자동 생성된 참여자 고유 ID |
| `accessToken` | 이후 위치·취향 입력 및 투표 시 인증에 사용하는 토큰 |
| `meetingId` | 참여한 모임의 고유 ID |

> **accessToken을 클라이언트에 반환하는 이유**  
> 클라이언트는 이 토큰을 로컬에 저장해두고, 이후 위치 입력·투표 등의 요청 시  
> `Authorization` 헤더 또는 요청 바디에 포함하여 본인 확인에 사용합니다.

---

## 오류 처리

```typescript
if (insertError) throw insertError;
```

```typescript
} catch (error) {
  return errorResponse(request, error);
}
```

- DB insert 오류 시 즉시 `throw`하여 `catch` 블록으로 전달합니다.
- `errorResponse()`가 `HttpError` 여부에 따라 적절한 상태 코드를 결정합니다.
- 위에서 명시적으로 던진 `HttpError`(400·404·409)와 예상치 못한 오류(500)가 하나의 `catch`에서 통합 처리됩니다.

---

## seq3 시퀀스와의 대응

| 시퀀스 단계 | 코드 위치 |
|---|---|
| 1. 초대 링크 접속 | `inviteCode` 수신 |
| 2. 시스템이 모임 기본 정보를 보여줌 | `meeting` 조회 후 `meeting_id`, `status` 확인 |
| 3. 참여자가 이름을 입력 | `participantName` 수신 |
| 4. 참여 가능 여부·중복 여부 확인 | `status !== "RECRUITING"` 검증 |
| 5. 참여자를 모임에 등록 | `participant` 테이블 insert |
| 대안 1a — 유효하지 않은 링크 | `!meeting` → 404 반환 |

---

## create-meeting과의 차이점 요약

| 항목 | create-meeting | join-meeting |
|---|---|---|
| 대상 테이블 | `meeting` | `participant` |
| 조회 방식 | insert 후 select | 먼저 select 후 insert |
| 생성 토큰 | 8자리 초대 코드 (사용자 공유용) | UUID 전체 (개인 인증용) |
| 상태 검증 | 없음 (신규 생성) | `RECRUITING` 여부 확인 |
| 주요 오류 | 400 (필수값 누락) | 400 / 404 / 409 (링크·상태) |