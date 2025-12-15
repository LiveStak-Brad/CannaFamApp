-- CannaFam (CFM) schema + RLS

create extension if not exists pgcrypto;

-- Admin helper
create or replace function public.cfm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cfm_admins a
    where a.user_id = auth.uid()
  );
$$;

-- Approved member helper
create or replace function public.cfm_is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.cfm_is_admin()
    or exists (
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
  public_link text,
  instagram_link text,
  x_link text,
  tiktok_link text,
  youtube_link text,
  points int default 0,
  created_at timestamp default now()
);

alter table public.cfm_members add column if not exists public_link text;
alter table public.cfm_members add column if not exists instagram_link text;
alter table public.cfm_members add column if not exists x_link text;
alter table public.cfm_members add column if not exists tiktok_link text;
alter table public.cfm_members add column if not exists youtube_link text;

-- Public roster view (prevents exposing user_id/points via anon)
create or replace view public.cfm_public_members as
  select
    id,
    favorited_username,
    photo_url,
    bio,
    public_link,
    instagram_link,
    x_link,
    tiktok_link,
    youtube_link,
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
    youtube_link
  from public.cfm_members
  where user_id is not null;

grant select on public.cfm_public_member_ids to anon, authenticated;

create or replace function public.cfm_get_member_profile(username text)
returns table (
  id uuid,
  user_id uuid,
  favorited_username text,
  photo_url text,
  bio text,
  public_link text,
  instagram_link text,
  x_link text,
  tiktok_link text,
  youtube_link text,
  created_at timestamp
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  uname text;
begin
  if not (public.cfm_is_admin() or public.cfm_is_approved_member()) then
    raise exception 'not authorized';
  end if;

  uname := btrim(coalesce(username, ''));
  if uname = '' then
    return;
  end if;

  return query
  select
    m.id,
    m.user_id,
    m.favorited_username,
    m.photo_url,
    m.bio,
    m.public_link,
    m.instagram_link,
    m.x_link,
    m.tiktok_link,
    m.youtube_link,
    m.created_at
  from public.cfm_members m
  where btrim(m.favorited_username) = uname
  order by m.created_at desc
  limit 1;

  if found then
    return;
  end if;

  return query
  select
    m.id,
    m.user_id,
    m.favorited_username,
    m.photo_url,
    m.bio,
    m.public_link,
    m.instagram_link,
    m.x_link,
    m.tiktok_link,
    m.youtube_link,
    m.created_at
  from public.cfm_members m
  where btrim(m.favorited_username) ilike uname
  order by m.created_at desc
  limit 1;
end;
$$;

grant execute on function public.cfm_get_member_profile(text) to authenticated;

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

create table if not exists public.cfm_noties (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  actor_user_id uuid,
  type text not null,
  post_id uuid,
  comment_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.cfm_monetization_settings (
  id uuid primary key default gen_random_uuid(),
  enable_post_gifts boolean not null default false,
  allow_custom_amount boolean not null default true,
  min_gift_cents int not null default 100,
  max_gift_cents int not null default 20000,
  currency text not null default 'usd',
  created_at timestamptz not null default now()
);

create table if not exists public.cfm_gift_presets (
  id uuid primary key default gen_random_uuid(),
  amount_cents int not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cfm_post_gifts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.cfm_feed_posts(id) on delete cascade,
  gifter_user_id uuid,
  recipient_user_id uuid,
  amount_cents int not null,
  currency text not null default 'usd',
  provider text not null default 'stripe',
  status text not null default 'pending',
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_event_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cfm_post_gifts alter column post_id drop not null;
alter table public.cfm_post_gifts alter column gifter_user_id drop not null;

create or replace function public.cfm_anonymous_gift_total_cents()
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(g.amount_cents), 0)::bigint
  from public.cfm_post_gifts g
  where g.status = 'paid'
    and g.gifter_user_id is null;
$$;

grant execute on function public.cfm_anonymous_gift_total_cents() to anon, authenticated;

-- Enable RLS
alter table public.cfm_applications enable row level security;
alter table public.cfm_members enable row level security;
alter table public.cfm_checkins enable row level security;
alter table public.cfm_shares enable row level security;
alter table public.cfm_feed_posts enable row level security;
alter table public.cfm_feed_likes enable row level security;
alter table public.cfm_awards enable row level security;
alter table public.cfm_noties enable row level security;
alter table public.cfm_monetization_settings enable row level security;
alter table public.cfm_gift_presets enable row level security;
alter table public.cfm_post_gifts enable row level security;

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

create policy "members_select_approved"
on public.cfm_members
for select
to authenticated
using (public.cfm_is_admin() or public.cfm_is_approved_member());

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

create policy "noties_select_own_or_admin"
on public.cfm_noties
for select
to authenticated
using (public.cfm_is_admin() or member_id = auth.uid());

create policy "noties_update_own"
on public.cfm_noties
for update
to authenticated
using (public.cfm_is_admin() or member_id = auth.uid())
with check (public.cfm_is_admin() or member_id = auth.uid());

create policy "monetization_settings_select_anyone"
on public.cfm_monetization_settings
for select
to anon, authenticated
using (true);

create policy "monetization_settings_insert_admin_only"
on public.cfm_monetization_settings
for insert
to authenticated
with check (public.cfm_is_admin());

create policy "monetization_settings_update_admin_only"
on public.cfm_monetization_settings
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

create policy "gift_presets_select_anyone"
on public.cfm_gift_presets
for select
to anon, authenticated
using (true);

create policy "gift_presets_insert_admin_only"
on public.cfm_gift_presets
for insert
to authenticated
with check (public.cfm_is_admin());

create policy "gift_presets_update_admin_only"
on public.cfm_gift_presets
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

create policy "post_gifts_select_authenticated"
on public.cfm_post_gifts
for select
to authenticated
using (true);

create policy "post_gifts_insert_member_only"
on public.cfm_post_gifts
for insert
to authenticated
with check (
  public.cfm_is_admin()
  or (public.cfm_is_approved_member() and gifter_user_id = auth.uid())
  or (gifter_user_id is null)
);

create policy "post_gifts_insert_anonymous"
on public.cfm_post_gifts
for insert
to anon
with check (
  gifter_user_id is null
  and status = 'pending'
);

create policy "post_gifts_update_admin_only"
on public.cfm_post_gifts
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

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
  comment_points int,
  comment_upvote_points int,
  checkin_points int,
  gift_bonus_points int,
  spin_points int,
  link_visit_points int,
  gift_dollar_points int,
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
    coalesce(co.comment_points, 0)::int as comment_points,
    coalesce(cu.comment_upvote_points, 0)::int as comment_upvote_points,
    coalesce(ci.checkin_points, 0)::int as checkin_points,
    (coalesce(gb.gift_bonus_days, 0) * 5)::int as gift_bonus_points,
    coalesce(sp.spin_points, 0)::int as spin_points,
    coalesce(lv.link_visit_points, 0)::int as link_visit_points,
    coalesce(gp.gift_points, 0)::int as gift_dollar_points,
    (
      coalesce(st.streak_points, 0)
      + coalesce(sh.share_points, 0)
      + coalesce(li.like_points, 0)
      + coalesce(co.comment_points, 0)
      + coalesce(cu.comment_upvote_points, 0)
      + coalesce(ci.checkin_points, 0)
      + (coalesce(gb.gift_bonus_days, 0) * 5)
      + coalesce(sp.spin_points, 0)
      + coalesce(lv.link_visit_points, 0)
      + coalesce(gp.gift_points, 0)
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
    select count(*)::int as comment_points
    from public.cfm_feed_comments c
    where c.user_id = m.user_id
  ) co on true
  left join lateral (
    select count(*)::int as comment_upvote_points
    from public.cfm_feed_comment_upvotes u
    join public.cfm_feed_comments c on c.id = u.comment_id
    where c.user_id = m.user_id
  ) cu on true
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
  left join lateral (
    select count(*)::int as link_visit_points
    from public.cfm_link_visits v
    where v.user_id = m.user_id
  ) lv on true
  left join lateral (
    select (coalesce(sum(pg.amount_cents), 0) / 100)::int as gift_points
    from public.cfm_post_gifts pg
    where pg.gifter_user_id = m.user_id
      and pg.status = 'paid'
  ) gp on true
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
