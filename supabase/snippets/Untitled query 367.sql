-- 1. 기존의 제약 조건을 삭제합니다.
ALTER TABLE public.meeting DROP CONSTRAINT meeting_status_check;

-- 2. 기존 상태값들에 새로운 상태값 2개를 추가하여 다시 생성합니다.
ALTER TABLE public.meeting 
ADD CONSTRAINT meeting_status_check 
CHECK (
  (status)::text = ANY (
    ARRAY[
      'RECRUITING'::text,
      'PLACE_RECOMMENDING'::text,
      'PLACE_VOTING'::text,
      'RESTAURANT_RECOMMENDING'::text,
      'RESTAURANT_VOTING'::text,
      'LOCATION_DECIDED'::text,
      'RESTAURANT_DECIDED'::text,
      'CLOSED'::text,
      'CANCELED'::text
    ]
  )
);