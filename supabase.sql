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

create or replace function public.cfm_is_mod()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  out boolean;
begin
  if public.cfm_is_admin() then
    return true;
  end if;

  if to_regclass('public.cfm_live_mods') is null then
    return false;
  end if;

  execute 'select exists (select 1 from public.cfm_live_mods lm where lm.moderator_user_id = auth.uid())'
    into out;
  return coalesce(out, false);
end;
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

update public.cfm_members
set favorited_username = btrim(favorited_username)
where favorited_username is not null
  and favorited_username <> btrim(favorited_username);

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'cfm_members'
      and c.conname = 'cfm_members_username_not_blank'
  ) then
    alter table public.cfm_members
      add constraint cfm_members_username_not_blank
      check (btrim(favorited_username) <> '');
  end if;
end
$$;

create unique index if not exists cfm_members_username_unique
  on public.cfm_members (lower(btrim(favorited_username)));

create unique index if not exists cfm_members_user_id_unique
  on public.cfm_members (user_id)
  where user_id is not null;

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

create or replace function public.cfm_create_mention_noties(
  p_text text,
  p_post_id uuid,
  p_comment_id uuid default null
)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  uname text;
  mentioned_user_id uuid;
begin
  if not (public.cfm_is_admin() or public.cfm_is_approved_member()) then
    raise exception 'not authorized';
  end if;

  for uname in
    select distinct lower(btrim(m[1]))
    from regexp_matches(coalesce(p_text, ''), '@([A-Za-z0-9_]{2,30})', 'g') as m
    limit 10
  loop
    mentioned_user_id := null;

    select user_id
    into mentioned_user_id
    from public.cfm_public_member_ids
    where lower(btrim(favorited_username)) = uname
    limit 1;

    if mentioned_user_id is null then
      select user_id
      into mentioned_user_id
      from public.cfm_public_member_ids
      where lower(btrim(favorited_username)) ilike uname
      limit 1;
    end if;

    if mentioned_user_id is not null and mentioned_user_id <> auth.uid() then
      insert into public.cfm_noties (
        member_id,
        user_id,
        actor_user_id,
        type,
        entity_type,
        entity_id,
        post_id,
        comment_id,
        message,
        is_read
      ) values (
        mentioned_user_id,
        mentioned_user_id,
        auth.uid(),
        'mention',
        case when p_comment_id is null then 'post' else 'comment' end,
        coalesce(p_comment_id, p_post_id),
        p_post_id,
        p_comment_id,
        'mentioned you',
        false
      );
    end if;
  end loop;
end;
$$;

grant execute on function public.cfm_create_mention_noties(text, uuid, uuid) to authenticated;

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

-- Link visit logs
create table if not exists public.cfm_link_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  link_type text,
  visit_date date,
  created_at timestamptz not null default now(),
  unique (user_id, link_type, visit_date)
);

-- Feed posts
create table if not exists public.cfm_feed_posts (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text,
  post_type text,
  created_at timestamp default now()
);

alter table public.cfm_feed_posts add column if not exists author_user_id uuid;
alter table public.cfm_feed_posts add column if not exists post_date date;
alter table public.cfm_feed_posts add column if not exists media_url text;
alter table public.cfm_feed_posts add column if not exists media_type text;

create unique index if not exists cfm_feed_posts_one_per_user_per_day
  on public.cfm_feed_posts (author_user_id, post_date)
  where post_type = 'member' and author_user_id is not null and post_date is not null;

-- Feed likes
create table if not exists public.cfm_feed_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.cfm_feed_posts(id) on delete cascade,
  user_id uuid,
  unique (post_id, user_id)
);

-- Feed comments
create table if not exists public.cfm_feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.cfm_feed_posts(id) on delete cascade,
  user_id uuid not null,
  content text not null,
  parent_comment_id uuid references public.cfm_feed_comments(id) on delete cascade,
  is_hidden boolean,
  created_at timestamptz not null default now()
);

create table if not exists public.cfm_live_state (
  id uuid primary key default gen_random_uuid(),
  is_live boolean not null default false,
  channel_name text not null default 'cannafam-live',
  host_user_id uuid,
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cfm_live_state_singleton_idx
  on public.cfm_live_state ((true));

create table if not exists public.cfm_live_mods (
  id uuid primary key default gen_random_uuid(),
  moderator_user_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (moderator_user_id)
);

create table if not exists public.cfm_live_mutes (
  id uuid primary key default gen_random_uuid(),
  muted_user_id uuid not null,
  until timestamptz not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists cfm_live_mutes_user_until_idx
  on public.cfm_live_mutes (muted_user_id, until desc);

create table if not exists public.cfm_live_chat (
  id uuid primary key default gen_random_uuid(),
  live_id uuid references public.cfm_live_state(id) on delete cascade,
  sender_user_id uuid,
  message text,
  type text not null default 'chat',
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cfm_live_chat drop constraint if exists cfm_live_chat_type_check;
alter table public.cfm_live_chat
add constraint cfm_live_chat_type_check
check (type in ('chat','emote','system','tip'));

create index if not exists cfm_live_chat_live_id_created_at_idx
  on public.cfm_live_chat (live_id, created_at desc);

 do $$
 begin
   begin
     if not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'cfm_live_chat'
     ) then
       alter publication supabase_realtime add table public.cfm_live_chat;
     end if;
   exception
     when undefined_table then null;
     when undefined_object then null;
   end;
 end
 $$;

do $$
begin
  if not exists (select 1 from public.cfm_live_state) then
    insert into public.cfm_live_state (is_live, channel_name, host_user_id)
    values (false, 'cannafam-live', '4deba91a-9a75-4e50-b348-13eda39d7cfb');
  end if;
end
$$;

create or replace function public.cfm_get_live_state()
returns table (
  id uuid,
  is_live boolean,
  channel_name text,
  host_user_id uuid,
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ls.id,
    ls.is_live,
    ls.channel_name,
    ls.host_user_id,
    ls.title,
    ls.started_at,
    ls.ended_at,
    ls.updated_at
  from public.cfm_live_state ls
  limit 1;
$$;

grant execute on function public.cfm_get_live_state() to anon, authenticated;

create or replace function public.cfm_set_live(
  next_is_live boolean,
  next_title text default null
)
returns table (
  id uuid,
  is_live boolean,
  channel_name text,
  host_user_id uuid,
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  ls public.cfm_live_state%rowtype;
  now_ts timestamptz := now();
begin
  select * into ls
  from public.cfm_live_state
  limit 1
  for update;

  if ls.id is null then
    raise exception 'Live state not initialized';
  end if;

  if not (public.cfm_is_admin() or ls.host_user_id = auth.uid()) then
    raise exception 'Not authorized to update live state';
  end if;

  update public.cfm_live_state as s
  set
    is_live = next_is_live,
    title = coalesce(next_title, s.title),
    started_at = case
      when next_is_live and (s.started_at is null or s.ended_at is not null) then now_ts
      else s.started_at
    end,
    ended_at = case
      when next_is_live then null
      else now_ts
    end,
    updated_at = now_ts
  where s.id = ls.id
  returning s.*
  into ls;

  return query
  select
    ls.id,
    ls.is_live,
    ls.channel_name,
    ls.host_user_id,
    ls.title,
    ls.started_at,
    ls.ended_at,
    ls.updated_at;
end
$$;

grant execute on function public.cfm_set_live(boolean, text) to authenticated;

create or replace function public.cfm_get_mod_list()
returns table (
  moderator_user_id uuid,
  favorited_username text,
  photo_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    lm.moderator_user_id,
    coalesce(pm.favorited_username, 'Member') as favorited_username,
    pm.photo_url
  from public.cfm_live_mods lm
  left join public.cfm_public_member_ids pm
    on pm.user_id = lm.moderator_user_id
  order by favorited_username asc;
$$;

grant execute on function public.cfm_get_mod_list() to authenticated;

create or replace function public.cfm_top_gifters(period text)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  total_amount numeric,
  rank int
)
language sql
security definer
stable
set search_path = public
as $$
  with bounds as (
    select
      case
        when lower(coalesce(period, 'all_time')) = 'today'
          then date_trunc('day', (now() at time zone 'America/Chicago'))
        when lower(coalesce(period, 'all_time')) = 'weekly'
          then date_trunc('week', (now() at time zone 'America/Chicago'))
        else null
      end as start_local
  ),
  events as (
    select
      g.gifter_user_id as user_id,
      g.amount_cents::bigint as amount_cents,
      coalesce(g.paid_at, g.created_at) as ts
    from public.cfm_post_gifts g
    where g.status = 'paid'
      and g.gifter_user_id is not null

    union all

    select
      lc.sender_user_id as user_id,
      case
        when (lc.metadata->>'amount_cents') ~ '^[0-9]+$'
          then (lc.metadata->>'amount_cents')::bigint
        else null
      end as amount_cents,
      lc.created_at as ts
    from public.cfm_live_chat lc
    where lc.type = 'tip'
      and lc.is_deleted = false
      and lc.sender_user_id is not null
      and lc.metadata ? 'amount_cents'
  ),
  filtered as (
    select e.user_id, e.amount_cents
    from events e
    cross join bounds b
    where e.user_id is not null
      and e.amount_cents is not null
      and e.amount_cents > 0
      and (
        b.start_local is null
        or (e.ts at time zone 'America/Chicago') >= b.start_local
      )
  ),
  totals as (
    select
      f.user_id,
      sum(f.amount_cents)::bigint as total_cents
    from filtered f
    group by f.user_id
  )
  select
    t.user_id as profile_id,
    coalesce(pm.favorited_username, 'Member') as display_name,
    pm.photo_url as avatar_url,
    (t.total_cents / 100.0)::numeric as total_amount,
    rank() over (order by t.total_cents desc, coalesce(pm.favorited_username, 'Member') asc)::int as rank
  from totals t
  left join public.cfm_public_member_ids pm
    on pm.user_id = t.user_id
  order by rank asc;
$$;

grant execute on function public.cfm_top_gifters(text) to anon, authenticated;

create index if not exists cfm_post_gifts_paid_gifter_paid_at_idx
  on public.cfm_post_gifts (gifter_user_id, paid_at desc)
  where status = 'paid' and gifter_user_id is not null;

create index if not exists cfm_live_chat_tip_created_at_idx
  on public.cfm_live_chat (created_at desc)
  where type = 'tip' and is_deleted = false;

alter table public.cfm_feed_comments
  add column if not exists parent_comment_id uuid;

create index if not exists cfm_feed_comments_post_id_idx
  on public.cfm_feed_comments (post_id);

create index if not exists cfm_feed_comments_parent_id_idx
  on public.cfm_feed_comments (parent_comment_id);

create index if not exists cfm_feed_comments_created_at_idx
  on public.cfm_feed_comments (created_at desc);

-- Feed comment upvotes
create table if not exists public.cfm_feed_comment_upvotes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid references public.cfm_feed_comments(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists cfm_feed_comment_upvotes_comment_id_idx
  on public.cfm_feed_comment_upvotes (comment_id);

-- Follows
create table if not exists public.cfm_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null,
  followed_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (follower_user_id, followed_user_id)
);

create index if not exists cfm_follows_follower_idx
  on public.cfm_follows (follower_user_id);

create index if not exists cfm_follows_followed_idx
  on public.cfm_follows (followed_user_id);

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

alter table public.cfm_noties add column if not exists user_id uuid;
alter table public.cfm_noties add column if not exists entity_type text;
alter table public.cfm_noties add column if not exists entity_id uuid;
alter table public.cfm_noties add column if not exists message text;

alter table public.cfm_noties drop constraint if exists cfm_noties_type_check;
alter table public.cfm_noties
add constraint cfm_noties_type_check
check (
  type in (
    'follow',
    'like',
    'comment',
    'mention',
    'award',
    'follow_post',
    'follow_comment',
    'follow_award',
    'announcement',
    'system',
    'comment_upvote'
  )
);

update public.cfm_noties
set user_id = member_id
where user_id is null;

create index if not exists cfm_noties_user_id_idx on public.cfm_noties (user_id);
create index if not exists cfm_noties_created_at_idx on public.cfm_noties (created_at desc);
create index if not exists cfm_noties_is_read_idx on public.cfm_noties (user_id, is_read);

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
alter table public.cfm_link_visits enable row level security;
alter table public.cfm_feed_posts enable row level security;
alter table public.cfm_feed_likes enable row level security;
alter table public.cfm_feed_comments enable row level security;
alter table public.cfm_feed_comment_upvotes enable row level security;
alter table public.cfm_follows enable row level security;
alter table public.cfm_awards enable row level security;
alter table public.cfm_noties enable row level security;
alter table public.cfm_monetization_settings enable row level security;
alter table public.cfm_gift_presets enable row level security;
alter table public.cfm_post_gifts enable row level security;
alter table public.cfm_live_state enable row level security;
alter table public.cfm_live_chat enable row level security;
alter table public.cfm_live_mods enable row level security;
alter table public.cfm_live_mutes enable row level security;

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

drop policy if exists "members_insert_admin_only" on public.cfm_members;
drop policy if exists "members_insert_self_or_admin" on public.cfm_members;
create policy "members_insert_self_or_admin"
on public.cfm_members
for insert
to authenticated
with check (
  public.cfm_is_admin()
  or (user_id = auth.uid())
);

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

-- cfm_follows
drop policy if exists "follows_select_authenticated" on public.cfm_follows;
drop policy if exists "follows_insert_self_or_admin" on public.cfm_follows;
drop policy if exists "follows_delete_self_or_admin" on public.cfm_follows;

create policy "follows_select_authenticated"
on public.cfm_follows
for select
to authenticated
using (true);

create policy "follows_insert_self_or_admin"
on public.cfm_follows
for insert
to authenticated
with check (public.cfm_is_admin() or follower_user_id = auth.uid());

create policy "follows_delete_self_or_admin"
on public.cfm_follows
for delete
to authenticated
using (public.cfm_is_admin() or follower_user_id = auth.uid());

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

-- cfm_link_visits
create policy "link_visits_select_own"
on public.cfm_link_visits
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "link_visits_insert_member_only"
on public.cfm_link_visits
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

drop policy if exists "feed_posts_insert_member_daily" on public.cfm_feed_posts;
create policy "feed_posts_insert_member_daily"
on public.cfm_feed_posts
for insert
to authenticated
with check (
  public.cfm_is_admin()
  or (
    public.cfm_is_approved_member()
    and post_type = 'member'
    and author_user_id = auth.uid()
    and post_date = timezone('America/Chicago', now())::date
  )
);

drop policy if exists "feed_posts_update_member_own_today" on public.cfm_feed_posts;
create policy "feed_posts_update_member_own_today"
on public.cfm_feed_posts
for update
to authenticated
using (
  public.cfm_is_admin()
  or (
    public.cfm_is_approved_member()
    and post_type = 'member'
    and author_user_id = auth.uid()
    and post_date = timezone('America/Chicago', now())::date
  )
)
with check (
  public.cfm_is_admin()
  or (
    public.cfm_is_approved_member()
    and post_type = 'member'
    and author_user_id = auth.uid()
    and post_date = timezone('America/Chicago', now())::date
  )
);

drop policy if exists "feed_posts_delete_member_own_today" on public.cfm_feed_posts;
create policy "feed_posts_delete_member_own_today"
on public.cfm_feed_posts
for delete
to authenticated
using (
  public.cfm_is_admin()
  or (
    public.cfm_is_approved_member()
    and post_type = 'member'
    and author_user_id = auth.uid()
    and post_date = timezone('America/Chicago', now())::date
  )
);

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

-- cfm_feed_comments
drop policy if exists "feed_comments_select_anyone" on public.cfm_feed_comments;
drop policy if exists "feed_comments_insert_member_only" on public.cfm_feed_comments;
drop policy if exists "feed_comments_update_admin_only" on public.cfm_feed_comments;
drop policy if exists "feed_comments_update_own" on public.cfm_feed_comments;
drop policy if exists "feed_comments_delete_own_or_admin" on public.cfm_feed_comments;

create policy "feed_comments_select_anyone"
on public.cfm_feed_comments
for select
to anon, authenticated
using (true);

create policy "feed_comments_insert_member_only"
on public.cfm_feed_comments
for insert
to authenticated
with check (public.cfm_is_admin() or (public.cfm_is_approved_member() and user_id = auth.uid()));

create policy "feed_comments_update_admin_only"
on public.cfm_feed_comments
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

create policy "feed_comments_update_own"
on public.cfm_feed_comments
for update
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid())
with check (public.cfm_is_admin() or user_id = auth.uid());

create policy "feed_comments_delete_own_or_admin"
on public.cfm_feed_comments
for delete
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

-- cfm_feed_comment_upvotes
drop policy if exists "comment_upvotes_select_anyone" on public.cfm_feed_comment_upvotes;
drop policy if exists "comment_upvotes_insert_member_only" on public.cfm_feed_comment_upvotes;
drop policy if exists "comment_upvotes_delete_own_or_admin" on public.cfm_feed_comment_upvotes;

create policy "comment_upvotes_select_anyone"
on public.cfm_feed_comment_upvotes
for select
to anon, authenticated
using (true);

create policy "comment_upvotes_insert_member_only"
on public.cfm_feed_comment_upvotes
for insert
to authenticated
with check (public.cfm_is_admin() or (public.cfm_is_approved_member() and user_id = auth.uid()));

create policy "comment_upvotes_delete_own_or_admin"
on public.cfm_feed_comment_upvotes
for delete
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

drop policy if exists "noties_select_own_or_admin" on public.cfm_noties;
drop policy if exists "noties_update_own" on public.cfm_noties;

create policy "noties_select_own_or_admin"
on public.cfm_noties
for select
to authenticated
using (public.cfm_is_admin() or coalesce(user_id, member_id) = auth.uid());

create policy "noties_update_own"
on public.cfm_noties
for update
to authenticated
using (public.cfm_is_admin() or coalesce(user_id, member_id) = auth.uid())
with check (public.cfm_is_admin() or coalesce(user_id, member_id) = auth.uid());

revoke update on public.cfm_noties from authenticated;
grant update (is_read) on public.cfm_noties to authenticated;

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

create policy "live_state_select_anyone"
on public.cfm_live_state
for select
to anon, authenticated
using (true);

create policy "live_state_insert_admin_only"
on public.cfm_live_state
for insert
to authenticated
with check (public.cfm_is_admin());

create policy "live_state_update_host_or_admin"
on public.cfm_live_state
for update
to authenticated
using (public.cfm_is_admin() or host_user_id = auth.uid())
with check (public.cfm_is_admin() or host_user_id = auth.uid());

create policy "live_mods_select_mod_or_admin"
on public.cfm_live_mods
for select
to authenticated
using (public.cfm_is_admin() or public.cfm_is_mod());

create policy "live_mods_insert_admin_only"
on public.cfm_live_mods
for insert
to authenticated
with check (public.cfm_is_admin());

create policy "live_mods_delete_admin_only"
on public.cfm_live_mods
for delete
to authenticated
using (public.cfm_is_admin());

create policy "live_mutes_select_self_mod_or_admin"
on public.cfm_live_mutes
for select
to authenticated
using (public.cfm_is_admin() or public.cfm_is_mod() or muted_user_id = auth.uid());

create policy "live_mutes_insert_mod_or_admin"
on public.cfm_live_mutes
for insert
to authenticated
with check (public.cfm_is_admin() or public.cfm_is_mod());

create policy "live_mutes_update_mod_or_admin"
on public.cfm_live_mutes
for update
to authenticated
using (public.cfm_is_admin() or public.cfm_is_mod())
with check (public.cfm_is_admin() or public.cfm_is_mod());

create policy "live_mutes_delete_mod_or_admin"
on public.cfm_live_mutes
for delete
to authenticated
using (public.cfm_is_admin() or public.cfm_is_mod());

create policy "live_chat_select_anyone"
on public.cfm_live_chat
for select
to anon, authenticated
using (true);

create policy "live_chat_insert_member_only"
on public.cfm_live_chat
for insert
to authenticated
with check (
  public.cfm_is_admin()
  or public.cfm_is_mod()
  or (
    public.cfm_is_approved_member()
    and sender_user_id = auth.uid()
    and type in ('chat','emote')
    and not exists (
      select 1
      from public.cfm_live_mutes m
      where m.muted_user_id = auth.uid()
        and m.until > now()
    )
  )
);

create policy "live_chat_update_mod_or_admin"
on public.cfm_live_chat
for update
to authenticated
using (public.cfm_is_admin() or public.cfm_is_mod())
with check (public.cfm_is_admin() or public.cfm_is_mod());

create policy "live_chat_delete_mod_or_admin"
on public.cfm_live_chat
for delete
to authenticated
using (public.cfm_is_admin() or public.cfm_is_mod());

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
  follow_points int,
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
    (coalesce(fo.following_points, 0) + coalesce(fi.follower_points, 0))::int as follow_points,
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
      + coalesce(fo.following_points, 0)
      + coalesce(fi.follower_points, 0)
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
      and d = (a - ((rn - 1)::int))
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
  left join lateral (
    select count(*)::int as following_points
    from public.cfm_follows f
    where f.follower_user_id = m.user_id
  ) fo on true
  left join lateral (
    select count(*)::int as follower_points
    from public.cfm_follows f
    where f.followed_user_id = m.user_id
  ) fi on true
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
