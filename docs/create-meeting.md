# `create-meeting` Edge Function 코드 설명

## 개요

Supabase Edge Function으로 작성된 **모임 생성 API**입니다.  
클라이언트로부터 모임 이름과 날짜/시간을 받아 DB에 저장하고, 고유한 초대 코드를 생성하여 반환합니다.  
시퀀스 다이어그램 **seq1 (모임 생성)** 의 4~7번 메시지 흐름을 서버 측에서 구현합니다.

---

## 전체 흐름

```
클라이언트 POST 요청
    └─ 메서드 검증 (OPTIONS / POST 외 차단)
        └─ 요청 바디 파싱 (meetingName, meetingDatetime)
            └─ 필수값 검증
                └─ 초대 코드 생성 (UUID 기반 8자리)
                    └─ Supabase DB insert
                        └─ 응답 반환 (meetingId, inviteCode, status)
```

---

## 타입 정의

```typescript
interface CreateMeetingRequest {
  meetingName?: string;
  meetingDatetime?: string;
}
```

| 필드 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `meetingName` | string | ✅ 필수 | 모임 이름 |
| `meetingDatetime` | string | ✅ 필수 | 모임 날짜·시간 (ISO 8601 형식 권장) |

두 필드 모두 `?`(optional)로 선언되어 있지만, 함수 내부에서 실제 필수값 검증을 별도로 수행합니다.

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
| `OPTIONS` | CORS preflight 응답 반환 (브라우저가 실제 요청 전 허용 여부 확인용) |
| `POST` | 정상 처리 진행 |
| 그 외 | 405 Method Not Allowed 오류 반환 |

> **왜 OPTIONS를 먼저 처리하는가?**  
> 브라우저는 cross-origin 요청 전에 OPTIONS 메서드로 서버에 허용 여부를 먼저 묻습니다(Preflight).  
> 이를 가장 먼저 처리하지 않으면 실제 요청이 CORS 오류로 차단됩니다.

---

## 필수값 검증

```typescript
const body = (await request.json()) as CreateMeetingRequest;
if (!body.meetingName || !body.meetingDatetime) {
  throw new HttpError(400, "meetingName과 meetingDatetime이 필요합니다.", "BAD_REQUEST");
}
```

- 요청 바디를 JSON으로 파싱합니다.
- 두 필드 중 하나라도 비어있으면 `400 Bad Request`를 던집니다.
- `!body.meetingName`은 `null`, `undefined`, 빈 문자열 `""` 모두 걸러냅니다.

---

## 초대 코드 생성

```typescript
const inviteCode = crypto.randomUUID().split("-")[0].toUpperCase();
```

| 단계 | 값 예시 |
|---|---|
| `crypto.randomUUID()` 호출 | `"550e8400-e29b-41d4-a716-446655440000"` |
| `.split("-")[0]` | `"550e8400"` |
| `.toUpperCase()` | `"550E8400"` |

- UUID v4에서 첫 번째 세그먼트(8자리)만 추출합니다.
- 대문자로 변환하여 사용자가 읽기 쉬운 형태로 만듭니다.
- 클래스 다이어그램의 `Moim.createInviteLink()` 메서드에 대응합니다.

> **UUID 전체를 사용하지 않는 이유**  
> 36자리 전체를 초대 코드로 쓰면 사용자가 직접 입력하기 어렵습니다.  
> 8자리로 줄이면 입력 편의성과 고유성의 균형을 맞출 수 있습니다.

---

## DB 저장 (Supabase insert)

```typescript
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
```

| 컬럼 | 값 | 설명 |
|---|---|---|
| `meeting_name` | 요청 바디의 `meetingName` | 모임 이름 |
| `meeting_datetime` | 요청 바디의 `meetingDatetime` | 모임 날짜·시간 |
| `invite_link` | 생성된 8자리 초대 코드 | 참여자가 모임에 접근하는 링크 |
| `status` | `"RECRUITING"` | 초기 상태 — 참여자 모집 중 |

- `createAdminClient()`: Supabase Service Role 키로 생성한 클라이언트입니다. RLS(Row Level Security)를 우회하여 서버에서 직접 쓰기 작업을 수행합니다.
- `.select(...).single()`: insert 후 저장된 행을 즉시 조회합니다. 별도의 SELECT 쿼리 없이 한 번의 왕복으로 처리합니다.
- `status: "RECRUITING"`: 클래스 다이어그램 `Status` 열거형의 `RECRUITING`에 대응하며, 모임이 생성되면 항상 이 상태로 시작합니다.

---

## 응답

```typescript
return jsonResponse(request, {
  meetingId: data.meeting_id,
  inviteCode: data.invite_link,
  status: data.status
});
```

성공 시 아래 형태로 응답합니다.

```json
{
  "meetingId": 42,
  "inviteCode": "550E8400",
  "status": "RECRUITING"
}
```

| 필드 | 설명 |
|---|---|
| `meetingId` | DB에서 자동 생성된 모임 고유 ID |
| `inviteCode` | 참여자에게 공유할 8자리 초대 코드 |
| `status` | 현재 모임 상태 (`RECRUITING`) |

---

## 오류 처리

```typescript
if (error) throw error;
```

```typescript
} catch (error) {
  return errorResponse(request, error);
}
```

- Supabase 오류(`error`)가 발생하면 바로 `throw`하여 `catch` 블록으로 전달합니다.
- `errorResponse()`가 `HttpError` 여부에 따라 적절한 HTTP 상태 코드와 메시지를 반환합니다.
- 모든 예외가 하나의 `catch`로 통합되어 처리 누락이 없습니다.

---

## seq1 시퀀스와의 대응

| 시퀀스 단계 | 코드 위치 |
|---|---|
| 3. 기본 정보 입력(title, when, deadline) | `body.meetingName`, `body.meetingDatetime` 파싱 |
| 4. 시스템이 유효성 확인 | `!body.meetingName \|\| !body.meetingDatetime` 검증 |
| 5. 시스템이 모임을 생성 | `supabase.from("meeting").insert(...)` |
| 6. 시스템이 초대 링크를 발급 | `crypto.randomUUID().split("-")[0].toUpperCase()` |
| 7. 생성 완료 결과와 초대 링크를 반환 | `jsonResponse(...)` 응답 |