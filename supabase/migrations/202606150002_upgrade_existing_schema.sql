-- 기존 DB SQL로 생성된 테이블을 추천 API가 사용하는 구조로 확장한다.

update public.meeting
set status = 'RECRUITING'
where status = 'OPEN';

alter table public.meeting
  alter column status set default 'RECRUITING';

alter table public.participant
  add column if not exists access_token uuid not null default gen_random_uuid(),
  add column if not exists place_vote_yn boolean not null default false,
  add column if not exists restaurant_vote_yn boolean not null default false;

create unique index if not exists participant_access_token_key
  on public.participant(access_token);

update public.participant
set role = 'MEMBER'
where role = 'GUEST';

alter table public.participant
  alter column role set default 'MEMBER';

alter table public.place_candidate
  add column if not exists category text,
  add column if not exists max_travel_minutes integer,
  add column if not exists travel_time_stddev_minutes numeric(8, 2),
  add column if not exists recommendation_score numeric(10, 4),
  add column if not exists recommendation_rank integer,
  add column if not exists calculation_method varchar(30) not null default 'DISTANCE_FALLBACK',
  add column if not exists created_at timestamptz not null default now();

alter table public.restaurant_candidate
  add column if not exists category text,
  add column if not exists preference_score numeric(10, 4),
  add column if not exists distance_meters integer,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.place_candidate_travel (
  place_candidate_id bigint not null references public.place_candidate(place_candidate_id) on delete cascade,
  participant_id bigint not null references public.participant(participant_id) on delete cascade,
  travel_minutes integer not null check (travel_minutes >= 0),
  transport_type varchar(20) not null check (transport_type in ('PUBLIC', 'CAR')),
  calculation_method varchar(30) not null check (calculation_method in ('DISTANCE_FALLBACK', 'ODSAY')),
  primary key (place_candidate_id, participant_id)
);

create unique index if not exists vote_one_place_per_participant
  on public.vote(participant_id)
  where vote_type = 'PLACE';

create unique index if not exists vote_one_restaurant_per_participant
  on public.vote(participant_id)
  where vote_type = 'RESTAURANT';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists meeting_set_updated_at on public.meeting;
create trigger meeting_set_updated_at
before update on public.meeting
for each row execute function public.set_updated_at();

drop trigger if exists participant_location_set_updated_at on public.participant_location;
create trigger participant_location_set_updated_at
before update on public.participant_location
for each row execute function public.set_updated_at();

drop trigger if exists participant_preference_set_updated_at on public.participant_preference;
create trigger participant_preference_set_updated_at
before update on public.participant_preference
for each row execute function public.set_updated_at();

alter table public.meeting enable row level security;
alter table public.participant enable row level security;
alter table public.participant_location enable row level security;
alter table public.participant_preference enable row level security;
alter table public.place_candidate enable row level security;
alter table public.place_candidate_travel enable row level security;
alter table public.restaurant_candidate enable row level security;
alter table public.vote enable row level security;
alter table public.final_decision enable row level security;
