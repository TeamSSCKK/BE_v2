create extension if not exists pgcrypto;

create table if not exists public.meeting (
  meeting_id bigint generated always as identity primary key,
  meeting_name text not null check (char_length(trim(meeting_name)) between 1 and 100),
  description text,
  invite_link text not null default gen_random_uuid()::text unique,
  meeting_datetime timestamptz,
  expired_at timestamptz,
  status varchar(30) not null default 'RECRUITING'
    check (status in (
      'RECRUITING',
      'PLACE_RECOMMENDING',
      'PLACE_VOTING',
      'RESTAURANT_RECOMMENDING',
      'RESTAURANT_VOTING',
      'CLOSED',
      'CANCELED'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expired_at is null or expired_at > created_at)
);

create table if not exists public.participant (
  participant_id bigint generated always as identity primary key,
  meeting_id bigint not null references public.meeting(meeting_id) on delete cascade,
  participant_name text not null check (char_length(trim(participant_name)) between 1 and 30),
  role varchar(20) not null default 'MEMBER' check (role in ('HOST', 'MEMBER')),
  access_token uuid not null default gen_random_uuid() unique,
  input_location_yn boolean not null default false,
  input_preference_yn boolean not null default false,
  place_vote_yn boolean not null default false,
  restaurant_vote_yn boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (meeting_id, participant_name)
);

create unique index if not exists participant_one_host_per_meeting
  on public.participant(meeting_id)
  where role = 'HOST';

create table if not exists public.participant_location (
  location_id bigint generated always as identity primary key,
  participant_id bigint not null unique references public.participant(participant_id) on delete cascade,
  place_name text,
  address text,
  latitude double precision not null check (latitude between 37.413 and 37.715),
  longitude double precision not null check (longitude between 126.734 and 127.270),
  return_address text,
  return_latitude double precision,
  return_longitude double precision,
  preferred_transport varchar(20) not null default 'PUBLIC'
    check (preferred_transport in ('PUBLIC', 'CAR')),
  updated_at timestamptz not null default now(),
  check (
    (return_latitude is null and return_longitude is null)
    or (
      return_latitude between 37.413 and 37.715
      and return_longitude between 126.734 and 127.270
    )
  )
);

create table if not exists public.participant_preference (
  preference_id bigint generated always as identity primary key,
  participant_id bigint not null references public.participant(participant_id) on delete cascade,
  preference_type text not null check (preference_type in ('LIKE', 'DISLIKE', 'RESTRICTION', 'PRICE_RANGE')),
  preference_value text not null check (char_length(trim(preference_value)) between 1 and 100),
  updated_at timestamptz not null default now(),
  unique (participant_id, preference_type, preference_value)
);

create table if not exists public.place_candidate (
  place_candidate_id bigint generated always as identity primary key,
  meeting_id bigint not null references public.meeting(meeting_id) on delete cascade,
  place_name text not null,
  category text,
  address text,
  latitude double precision not null check (latitude between 37.413 and 37.715),
  longitude double precision not null check (longitude between 126.734 and 127.270),
  avg_car_travel_time integer check (avg_car_travel_time is null or avg_car_travel_time >= 0),
  avg_pub_travel_time integer check (avg_pub_travel_time is null or avg_pub_travel_time >= 0),
  max_travel_time integer check (max_travel_time is null or max_travel_time >= 0),
  travel_time_stddev numeric(8, 2) check (travel_time_stddev is null or travel_time_stddev >= 0),
  fairness_score numeric(10, 4) check (fairness_score is null or fairness_score >= 0),
  recommendation_rank integer check (recommendation_rank is null or recommendation_rank > 0),
  calculation_method varchar(30) not null default 'DISTANCE_FALLBACK'
    check (calculation_method in ('DISTANCE_FALLBACK', 'ODSAY')),
  selected_for_vote_yn boolean not null default false,
  created_at timestamptz not null default now(),
  unique (meeting_id, place_name, latitude, longitude)
);

create table if not exists public.place_candidate_travel (
  place_candidate_id bigint not null references public.place_candidate(place_candidate_id) on delete cascade,
  participant_id bigint not null references public.participant(participant_id) on delete cascade,
  travel_minutes integer not null check (travel_minutes >= 0),
  transport_type varchar(20) not null check (transport_type in ('PUBLIC', 'CAR')),
  calculation_method varchar(30) not null check (calculation_method in ('DISTANCE_FALLBACK', 'ODSAY')),
  primary key (place_candidate_id, participant_id)
);

create table if not exists public.restaurant_candidate (
  restaurant_candidate_id bigint generated always as identity primary key,
  place_candidate_id bigint not null references public.place_candidate(place_candidate_id) on delete cascade,
  restaurant_name text not null,
  food_type text,
  category text,
  address text,
  latitude double precision not null check (latitude between 37.413 and 37.715),
  longitude double precision not null check (longitude between 126.734 and 127.270),
  preference_score numeric(10, 4),
  distance_meters integer check (distance_meters is null or distance_meters >= 0),
  reservation_available_yn boolean not null default false,
  reservation_url text,
  created_at timestamptz not null default now(),
  unique (place_candidate_id, restaurant_name, address)
);

create table if not exists public.vote (
  vote_id bigint generated always as identity primary key,
  participant_id bigint not null references public.participant(participant_id) on delete cascade,
  vote_type varchar(20) not null check (vote_type in ('PLACE', 'RESTAURANT')),
  place_candidate_id bigint references public.place_candidate(place_candidate_id) on delete cascade,
  restaurant_candidate_id bigint references public.restaurant_candidate(restaurant_candidate_id) on delete cascade,
  voted_at timestamptz not null default now(),
  check (
    (vote_type = 'PLACE' and place_candidate_id is not null and restaurant_candidate_id is null)
    or
    (vote_type = 'RESTAURANT' and place_candidate_id is null and restaurant_candidate_id is not null)
  )
);

create unique index if not exists vote_one_place_per_participant
  on public.vote(participant_id)
  where vote_type = 'PLACE';

create unique index if not exists vote_one_restaurant_per_participant
  on public.vote(participant_id)
  where vote_type = 'RESTAURANT';

create table if not exists public.final_decision (
  decision_id bigint generated always as identity primary key,
  meeting_id bigint not null unique references public.meeting(meeting_id) on delete cascade,
  final_place_candidate_id bigint references public.place_candidate(place_candidate_id) on delete set null,
  final_restaurant_candidate_id bigint references public.restaurant_candidate(restaurant_candidate_id) on delete set null,
  decided_at timestamptz not null default now(),
  changed_yn boolean not null default false
);

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

comment on table public.place_candidate_travel is
  '장소 후보별 참가자 이동시간. ODsay 연동 전에는 거리 기반 추정값을 저장한다.';
