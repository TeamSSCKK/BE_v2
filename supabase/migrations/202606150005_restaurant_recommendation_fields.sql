alter table public.restaurant_candidate
  add column if not exists source_url text,
  add column if not exists search_rank integer,
  add column if not exists recommendation_rank integer;

alter table public.restaurant_candidate
  drop constraint if exists restaurant_candidate_search_rank_check,
  add constraint restaurant_candidate_search_rank_check
    check (search_rank is null or search_rank > 0),
  drop constraint if exists restaurant_candidate_recommendation_rank_check,
  add constraint restaurant_candidate_recommendation_rank_check
    check (recommendation_rank is null or recommendation_rank > 0);

