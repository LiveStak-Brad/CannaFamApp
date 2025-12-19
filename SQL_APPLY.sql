-- Gifter levels: lifetime gifted totals

-- 1) Add lifetime gifted total column
alter table public.cfm_members
  add column if not exists lifetime_gifted_total_usd numeric not null default 0;

-- 2) Expose lifetime gifted total in public views
create or replace view public.cfm_public_members as
  select
    favorited_username,
    photo_url,
    bio,
    public_link,
    instagram_link,
    x_link,
    tiktok_link,
    youtube_link,
    lifetime_gifted_total_usd,
    created_at
  from public.cfm_members;

create or replace view public.cfm_public_member_ids as
  select
    user_id,
    favorited_username,
    photo_url,
    bio,
    public_link,
    instagram_link,
    x_link,
    tiktok_link,
    youtube_link,
    lifetime_gifted_total_usd
  from public.cfm_members
  where user_id is not null;

-- 3) Expose lifetime gifted total in member profile RPC
create or replace function public.cfm_get_member_profile(uname text)
returns table (
  favorited_username text,
  photo_url text,
  bio text,
  public_link text,
  instagram_link text,
  x_link text,
  tiktok_link text,
  youtube_link text,
  lifetime_gifted_total_usd numeric,
  created_at timestamp
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    m.favorited_username,
    m.photo_url,
    m.bio,
    m.public_link,
    m.instagram_link,
    m.x_link,
    m.tiktok_link,
    m.youtube_link,
    m.lifetime_gifted_total_usd,
    m.created_at
  from public.cfm_members m
  where btrim(m.favorited_username) = uname
  limit 1;
end;
$$;

create or replace function public.cfm_get_member_profile_ci(uname text)
returns table (
  favorited_username text,
  photo_url text,
  bio text,
  public_link text,
  instagram_link text,
  x_link text,
  tiktok_link text,
  youtube_link text,
  lifetime_gifted_total_usd numeric,
  created_at timestamp
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    m.favorited_username,
    m.photo_url,
    m.bio,
    m.public_link,
    m.instagram_link,
    m.x_link,
    m.tiktok_link,
    m.youtube_link,
    m.lifetime_gifted_total_usd,
    m.created_at
  from public.cfm_members m
  where btrim(m.favorited_username) ilike uname
  limit 1;
end;
$$;

-- 4) Trigger/function: increment lifetime gifted total on paid gifts
create or replace function public.cfm_apply_paid_gift_to_lifetime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'paid')
     or (tg_op = 'UPDATE' and old.status is distinct from 'paid' and new.status = 'paid') then
    if new.gifter_user_id is not null then
      update public.cfm_members m
      set lifetime_gifted_total_usd = coalesce(m.lifetime_gifted_total_usd, 0) + (new.amount_cents::numeric / 100)
      where m.user_id = new.gifter_user_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cfm_post_gifts_apply_paid_to_lifetime on public.cfm_post_gifts;
create trigger cfm_post_gifts_apply_paid_to_lifetime
after insert or update of status on public.cfm_post_gifts
for each row
execute function public.cfm_apply_paid_gift_to_lifetime();

-- 5) Backfill historical paid gifts
update public.cfm_members m
set lifetime_gifted_total_usd = coalesce(t.total_usd, 0)
from (
  select g.gifter_user_id, (sum(g.amount_cents)::numeric / 100) as total_usd
  from public.cfm_post_gifts g
  where g.status = 'paid'
    and g.gifter_user_id is not null
  group by g.gifter_user_id
) t
where m.user_id = t.gifter_user_id;


-- Apply order:
-- 1) ALTER TABLE cfm_members ADD COLUMN lifetime_gifted_total_usd
-- 2) CREATE OR REPLACE views: cfm_public_members, cfm_public_member_ids
-- 3) CREATE OR REPLACE functions: cfm_get_member_profile, cfm_get_member_profile_ci
-- 4) CREATE OR REPLACE function: cfm_apply_paid_gift_to_lifetime
-- 5) DROP+CREATE trigger: cfm_post_gifts_apply_paid_to_lifetime
-- 6) Run backfill UPDATE

-- Verify queries:
-- select lifetime_gifted_total_usd from public.cfm_members order by lifetime_gifted_total_usd desc limit 20;
-- select * from public.cfm_public_member_ids order by lifetime_gifted_total_usd desc nulls last limit 20;
-- select * from public.cfm_get_member_profile_ci('some_username');
-- -- trigger verification (run in a transaction and rollback):
-- -- update public.cfm_post_gifts set status='paid' where id='<gift_id>' and status<>'paid';
