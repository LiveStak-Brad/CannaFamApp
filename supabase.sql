-- CannaFam (CFM) schema + RLS

create extension if not exists pgcrypto;

-- Admin helper
create or replace function public.cfm_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'wcba.mo@gmail.com';
$$;

-- Approved member helper
create or replace function public.cfm_is_approved_member()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.cfm_members m
    where m.user_id = auth.uid()
  );
$$;

-- Applications
create table if not exists public.cfm_applications (
  id uuid primary key default gen_random_uuid(),
  favorited_username text not null,
  email text,
  photo_url text,
  bio text,
  wants_banner boolean default false,
  status text default 'pending',
  created_at timestamp default now()
);

-- Members
create table if not exists public.cfm_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  favorited_username text not null,
  photo_url text,
  bio text,
  points int default 0,
  created_at timestamp default now()
);

-- Public roster view (prevents exposing user_id/points via anon)
create or replace view public.cfm_public_members as
  select
    id,
    favorited_username,
    photo_url,
    bio,
    created_at
  from public.cfm_members;

-- Daily check-ins
create table if not exists public.cfm_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  checkin_date date,
  unique (user_id, checkin_date)
);

-- Share logs
create table if not exists public.cfm_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  platform text,
  share_date date,
  unique (user_id, platform, share_date)
);

-- Feed posts
create table if not exists public.cfm_feed_posts (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text,
  post_type text,
  created_at timestamp default now()
);

-- Feed likes
create table if not exists public.cfm_feed_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.cfm_feed_posts(id) on delete cascade,
  user_id uuid,
  unique (post_id, user_id)
);

-- Awards
create table if not exists public.cfm_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  award_type text,
  week_start date,
  week_end date,
  notes text,
  created_at timestamp default now()
);

-- Enable RLS
alter table public.cfm_applications enable row level security;
alter table public.cfm_members enable row level security;
alter table public.cfm_checkins enable row level security;
alter table public.cfm_shares enable row level security;
alter table public.cfm_feed_posts enable row level security;
alter table public.cfm_feed_likes enable row level security;
alter table public.cfm_awards enable row level security;

-- cfm_applications
create policy "applications_insert_anyone"
on public.cfm_applications
for insert
to anon, authenticated
with check (true);

create policy "applications_select_admin_only"
on public.cfm_applications
for select
to authenticated
using (public.cfm_is_admin());

create policy "applications_update_admin_only"
on public.cfm_applications
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

-- cfm_members
create policy "members_select_admin"
on public.cfm_members
for select
to authenticated
using (public.cfm_is_admin());

create policy "members_select_own"
on public.cfm_members
for select
to authenticated
using (user_id = auth.uid());

grant select on public.cfm_public_members to anon, authenticated;

create policy "members_insert_admin_only"
on public.cfm_members
for insert
to authenticated
with check (public.cfm_is_admin());

create policy "members_update_admin_only"
on public.cfm_members
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

create policy "members_update_own"
on public.cfm_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "members_delete_admin_only"
on public.cfm_members
for delete
to authenticated
using (public.cfm_is_admin());

-- cfm_checkins
create policy "checkins_select_own"
on public.cfm_checkins
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "checkins_insert_member_only"
on public.cfm_checkins
for insert
to authenticated
with check (public.cfm_is_admin() or (public.cfm_is_approved_member() and user_id = auth.uid()));

-- cfm_shares
create policy "shares_select_own"
on public.cfm_shares
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "shares_insert_member_only"
on public.cfm_shares
for insert
to authenticated
with check (public.cfm_is_admin() or (public.cfm_is_approved_member() and user_id = auth.uid()));

-- cfm_feed_posts
create policy "feed_posts_select_anyone"
on public.cfm_feed_posts
for select
to anon, authenticated
using (true);

create policy "feed_posts_insert_admin_only"
on public.cfm_feed_posts
for insert
to authenticated
with check (public.cfm_is_admin());

create policy "feed_posts_update_admin_only"
on public.cfm_feed_posts
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

create policy "feed_posts_delete_admin_only"
on public.cfm_feed_posts
for delete
to authenticated
using (public.cfm_is_admin());

-- cfm_feed_likes
create policy "feed_likes_select_anyone"
on public.cfm_feed_likes
for select
to anon, authenticated
using (true);

create policy "feed_likes_insert_member_only"
on public.cfm_feed_likes
for insert
to authenticated
with check (public.cfm_is_admin() or (public.cfm_is_approved_member() and user_id = auth.uid()));

create policy "feed_likes_delete_own_or_admin"
on public.cfm_feed_likes
for delete
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

-- cfm_awards
create policy "awards_select_anyone"
on public.cfm_awards
for select
to anon, authenticated
using (true);

create policy "awards_insert_admin_only"
on public.cfm_awards
for insert
to authenticated
with check (public.cfm_is_admin());

create policy "awards_update_admin_only"
on public.cfm_awards
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

create policy "awards_delete_admin_only"
on public.cfm_awards
for delete
to authenticated
using (public.cfm_is_admin());

-- Daily 1k+ gift bonus (admin-granted, once per user per day)
create table if not exists public.cfm_daily_gift_bonus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  gift_date date,
  unique (user_id, gift_date)
);

alter table public.cfm_daily_gift_bonus enable row level security;

create policy "gift_bonus_select_own_or_admin"
on public.cfm_daily_gift_bonus
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "gift_bonus_insert_admin_only"
on public.cfm_daily_gift_bonus
for insert
to authenticated
with check (public.cfm_is_admin());

-- Leaderboard RPC: member-only, returns points + breakdown counters.
create or replace function public.cfm_leaderboard(limit_n int default 100)
returns table (
  favorited_username text,
  user_id uuid,
  streak_points int,
  share_points int,
  like_points int,
  checkin_points int,
  gift_bonus_points int,
  spin_points int,
  total_points int
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (public.cfm_is_admin() or public.cfm_is_approved_member()) then
    raise exception 'not authorized';
  end if;

  return query
  select
    m.favorited_username,
    m.user_id,
    coalesce(st.streak_points, 0)::int as streak_points,
    coalesce(sh.share_points, 0)::int as share_points,
    coalesce(li.like_points, 0)::int as like_points,
    coalesce(ci.checkin_points, 0)::int as checkin_points,
    (coalesce(gb.gift_bonus_days, 0) * 5)::int as gift_bonus_points,
    coalesce(sp.spin_points, 0)::int as spin_points,
    (
      coalesce(st.streak_points, 0)
      + coalesce(sh.share_points, 0)
      + coalesce(li.like_points, 0)
      + coalesce(ci.checkin_points, 0)
      + (coalesce(gb.gift_bonus_days, 0) * 5)
      + coalesce(sp.spin_points, 0)
    )::int as total_points
  from public.cfm_members m
  left join lateral (
    -- Current streak length computed from check-in dates (display + points source per rules)
    with dates as (
      select distinct c.checkin_date::date as d
      from public.cfm_checkins c
      where c.user_id = m.user_id
    ), anchor as (
      select max(d) as a from dates
    ), ranked as (
      select d,
             row_number() over (order by d desc) as rn,
             (select a from anchor) as a
      from dates
    )
    select count(*)::int as streak_points
    from ranked
    where a is not null
      and d = (a - ((rn - 1)::int));
  ) st on true
  left join lateral (
    select count(*)::int as checkin_points
    from public.cfm_checkins c
    where c.user_id = m.user_id
  ) ci on true
  left join lateral (
    select count(*)::int as share_points
    from public.cfm_shares s
    where s.user_id = m.user_id
  ) sh on true
  left join lateral (
    select count(*)::int as like_points
    from public.cfm_feed_likes l
    where l.user_id = m.user_id
  ) li on true
  left join lateral (
    select count(distinct g.bonus_date)::int as gift_bonus_days
    from public.cfm_daily_gift_bonus g
    where g.user_id = m.user_id
  ) gb on true
  left join lateral (
    select coalesce(sum(ds.points_awarded), 0)::int as spin_points
    from public.cfm_daily_spins ds
    where ds.user_id = m.user_id
  ) sp on true
  where m.user_id is not null
  order by total_points desc, m.created_at asc
  limit greatest(1, limit_n);
end;
$$;

-- Daily Spin (1 per user per day)
create table if not exists public.cfm_daily_spins (
  id bigserial primary key,
  user_id uuid not null,
  spin_date date not null default current_date,
  points_awarded int not null,
  created_at timestamptz not null default now(),
  unique (user_id, spin_date),
  constraint cfm_daily_spins_points_awarded_check check (points_awarded between 1 and 5)
);

alter table public.cfm_daily_spins enable row level security;

create policy "spins_select_own_or_admin"
on public.cfm_daily_spins
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "spins_insert_member_only"
on public.cfm_daily_spins
for insert
to authenticated
with check (public.cfm_is_admin() or (public.cfm_is_approved_member() and user_id = auth.uid()));
