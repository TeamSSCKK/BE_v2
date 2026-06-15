create table if not exists public.seoul_transit_hub (
  transit_hub_id bigint generated always as identity primary key,
  source_station_id text not null,
  station_name text not null,
  line_name text not null,
  latitude double precision not null check (latitude between 37.413 and 37.715),
  longitude double precision not null check (longitude between 126.734 and 127.270),
  source varchar(30) not null default 'SEOUL_OPEN_DATA',
  active_yn boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (source_station_id, line_name)
);

create index if not exists seoul_transit_hub_coordinates_idx
  on public.seoul_transit_hub(latitude, longitude)
  where active_yn = true;

alter table public.seoul_transit_hub enable row level security;

drop trigger if exists seoul_transit_hub_set_updated_at on public.seoul_transit_hub;
create trigger seoul_transit_hub_set_updated_at
before update on public.seoul_transit_hub
for each row execute function public.set_updated_at();

insert into public.seoul_transit_hub
  (source_station_id, station_name, line_name, latitude, longitude, source)
values
  ('0150', '서울역', '1호선', 37.556228, 126.972135, 'INITIAL_SEED'),
  ('0151', '시청', '1호선', 37.565715, 126.977088, 'INITIAL_SEED'),
  ('0153', '종로3가', '1호선', 37.570406, 126.991847, 'INITIAL_SEED'),
  ('0208', '왕십리', '2호선', 37.561533, 127.037732, 'INITIAL_SEED'),
  ('0212', '건대입구', '2호선', 37.540373, 127.069191, 'INITIAL_SEED'),
  ('0216', '잠실', '2호선', 37.513262, 127.100159, 'INITIAL_SEED'),
  ('0222', '강남', '2호선', 37.497990, 127.027912, 'INITIAL_SEED'),
  ('0223', '교대', '2호선', 37.493415, 127.014080, 'INITIAL_SEED'),
  ('0226', '사당', '2호선', 37.476538, 126.981544, 'INITIAL_SEED'),
  ('0329', '고속터미널', '3호선', 37.504810, 127.004943, 'INITIAL_SEED'),
  ('0526', '여의도', '5호선', 37.521747, 126.924357, 'INITIAL_SEED'),
  ('1005', '영등포', '1호선', 37.515504, 126.907628, 'INITIAL_SEED'),
  ('1007', '신도림', '1호선', 37.508725, 126.891295, 'INITIAL_SEED'),
  ('0239', '홍대입구', '2호선', 37.557192, 126.925381, 'INITIAL_SEED'),
  ('0529', '공덕', '5호선', 37.544018, 126.951592, 'INITIAL_SEED')
on conflict (source_station_id, line_name) do update set
  station_name = excluded.station_name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  active_yn = true,
  updated_at = now();

