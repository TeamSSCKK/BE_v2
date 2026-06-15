-- 실제 DB의 기존 max_travel_time 컬럼이 time with time zone 타입이므로
-- 분 단위 추천 지표는 충돌하지 않는 명확한 컬럼명으로 저장한다.

alter table public.place_candidate
  add column if not exists max_travel_minutes integer,
  add column if not exists travel_time_stddev_minutes numeric(8, 2),
  add column if not exists recommendation_score numeric(10, 4);

alter table public.place_candidate
  drop constraint if exists place_candidate_max_travel_minutes_check,
  add constraint place_candidate_max_travel_minutes_check
    check (max_travel_minutes is null or max_travel_minutes >= 0),
  drop constraint if exists place_candidate_travel_time_stddev_minutes_check,
  add constraint place_candidate_travel_time_stddev_minutes_check
    check (travel_time_stddev_minutes is null or travel_time_stddev_minutes >= 0),
  drop constraint if exists place_candidate_recommendation_score_check,
  add constraint place_candidate_recommendation_score_check
    check (recommendation_score is null or recommendation_score >= 0);

