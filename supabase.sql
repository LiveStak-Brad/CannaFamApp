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
  lifetime_gifted_total_usd numeric not null default 0,
  lifetime_gifted_total_coins bigint not null default 0,
  vip_tier text,
  is_verified boolean not null default false,
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

alter table public.cfm_members add column if not exists username text;

alter table public.cfm_members add column if not exists favorited_handle text;

update public.cfm_members
set username = btrim(favorited_username)
where (username is null or btrim(username) = '')
  and favorited_username is not null;

create unique index if not exists cfm_members_username_unique_2
  on public.cfm_members (lower(btrim(username)))
  where username is not null;

create unique index if not exists cfm_members_user_id_unique
  on public.cfm_members (user_id)
  where user_id is not null;

alter table public.cfm_members add column if not exists public_link text;
alter table public.cfm_members add column if not exists instagram_link text;
alter table public.cfm_members add column if not exists x_link text;
alter table public.cfm_members add column if not exists tiktok_link text;
alter table public.cfm_members add column if not exists youtube_link text;
alter table public.cfm_members add column if not exists lifetime_gifted_total_usd numeric not null default 0;

-- Public roster view (prevents exposing user_id/points via anon)
create or replace view public.cfm_public_members as
  select
    id,
    username,
    favorited_username,
    photo_url,
    bio,
    public_link,
    instagram_link,
    x_link,
    tiktok_link,
    youtube_link,
    lifetime_gifted_total_usd,
    vip_tier,
    created_at
  from public.cfm_members;

create or replace view public.cfm_public_member_ids as
  select
    user_id,
    username,
    favorited_username,
    favorited_handle,
    photo_url,
    bio,
    public_link,
    instagram_link,
    x_link,
    tiktok_link,
    youtube_link,
    lifetime_gifted_total_usd,
    vip_tier
  from public.cfm_members
  where user_id is not null;

create or replace function public.cfm_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'favorited_username',
    ''
  );

  uname := btrim(regexp_replace(coalesce(uname, ''), '^@+', ''));
  if uname = '' then
    return new;
  end if;

  insert into public.cfm_members (user_id, username, favorited_username, points)
  values (new.id, uname, uname, 0)
  on conflict (user_id)
  do update set
    username = excluded.username,
    favorited_username = excluded.favorited_username;

  return new;
end;
$$;

drop trigger if exists cfm_handle_new_user on auth.users;
create trigger cfm_handle_new_user
after insert on auth.users
for each row
execute function public.cfm_handle_new_user();

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
  lifetime_gifted_total_usd numeric,
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
    m.lifetime_gifted_total_usd,
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
    m.lifetime_gifted_total_usd,
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

create table if not exists public.cfm_live_kicks (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references public.cfm_live_state(id) on delete cascade,
  kicked_user_id uuid not null,
  kicked_by uuid,
  reason text,
  created_at timestamptz not null default now(),
  unique (live_id, kicked_user_id)
);

create table if not exists public.cfm_live_bans (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null,
  banned_user_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (banned_user_id)
);

 do $$
 begin
   begin
     if not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'cfm_live_bans'
     ) then
       alter publication supabase_realtime add table public.cfm_live_bans;
     end if;
   exception
     when undefined_table then null;
     when undefined_object then null;
   end;
 end
 $$;

create index if not exists cfm_live_bans_banned_user_idx
  on public.cfm_live_bans (banned_user_id)
  where revoked_at is null;

alter table public.cfm_live_bans enable row level security;

create policy "live_bans_select_host_or_banned_or_admin"
on public.cfm_live_bans
for select
to authenticated
using (
  public.cfm_is_admin()
  or public.cfm_is_mod()
  or host_user_id = auth.uid()
  or banned_user_id = auth.uid()
  or exists (
    select 1
    from public.cfm_live_state ls
    where ls.is_live = true
      and ls.host_user_id = auth.uid()
  )
);

create policy "live_bans_insert_host_or_admin"
on public.cfm_live_bans
for insert
to authenticated
with check (
  public.cfm_is_admin() or public.cfm_is_mod() or host_user_id = auth.uid()
);

create policy "live_bans_update_host_or_admin"
on public.cfm_live_bans
for update
to authenticated
using (
  public.cfm_is_admin() or public.cfm_is_mod() or host_user_id = auth.uid()
);

create index if not exists cfm_live_kicks_live_user_idx
  on public.cfm_live_kicks (live_id, kicked_user_id);

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

  -- Clear chat history when stream ends (for fresh chat each live)
  if not next_is_live then
    delete from public.cfm_live_chat where live_id = ls.id;
    delete from public.cfm_live_viewers where live_id = ls.id;
    delete from public.cfm_live_kicks where live_id = ls.id;
  end if;

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
      g.amount_cents::bigint as coins,
      coalesce(g.paid_at, g.created_at) as ts
    from public.cfm_post_gifts g
    where g.status = 'paid'
      and g.gifter_user_id is not null
      and coalesce(g.provider, '') != 'coins'

    union all

    select
      lc.sender_user_id as user_id,
      case
        when (lc.metadata->>'coins') ~ '^[0-9]+$'
          then (lc.metadata->>'coins')::bigint
        when (lc.metadata->>'amount_cents') ~ '^[0-9]+$'
          then (lc.metadata->>'amount_cents')::bigint
        else null
      end as coins,
      lc.created_at as ts
    from public.cfm_live_chat lc
    where lc.type = 'tip'
      and lc.is_deleted = false
      and lc.sender_user_id is not null
      and (lc.metadata ? 'coins' or lc.metadata ? 'amount_cents')

    union all

    select
      ct.user_id,
      ct.amount::bigint as coins,
      ct.created_at as ts
    from public.coin_transactions ct
    where ct.type = 'gift_spend'
      and ct.direction = 'debit'
  ),
  filtered as (
    select e.user_id, e.coins
    from events e
    cross join bounds b
    where e.user_id is not null
      and e.coins is not null
      and e.coins > 0
      and (
        b.start_local is null
        or (e.ts at time zone 'America/Chicago') >= b.start_local
      )
  ),
  totals as (
    select
      f.user_id,
      sum(f.coins)::bigint as total_coins
    from filtered f
    group by f.user_id
  )
  select
    t.user_id as profile_id,
    coalesce(pm.favorited_username, 'Member') as display_name,
    pm.photo_url as avatar_url,
    (t.total_coins)::numeric as total_amount,
    rank() over (order by t.total_coins desc, coalesce(pm.favorited_username, 'Member') asc)::int as rank
  from totals t
  left join public.cfm_public_member_ids pm
    on pm.user_id = t.user_id
  where t.user_id != '4deba91a-9a75-4e50-b348-13eda39d7cfb'::uuid
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

alter table public.cfm_feed_comments
  add column if not exists is_gift boolean default false;

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

alter table public.cfm_monetization_settings add column if not exists vip_bronze_coins bigint not null default 25000;
alter table public.cfm_monetization_settings add column if not exists vip_silver_coins bigint not null default 50000;
alter table public.cfm_monetization_settings add column if not exists vip_gold_coins bigint not null default 100000;
alter table public.cfm_monetization_settings add column if not exists vip_diamond_coins bigint not null default 200000;

alter table public.cfm_monetization_settings alter column vip_bronze_coins set default 25000;
alter table public.cfm_monetization_settings alter column vip_silver_coins set default 50000;
alter table public.cfm_monetization_settings alter column vip_gold_coins set default 100000;
alter table public.cfm_monetization_settings alter column vip_diamond_coins set default 200000;

update public.cfm_monetization_settings
set vip_bronze_coins = 25000,
    vip_silver_coins = 50000,
    vip_gold_coins = 100000,
    vip_diamond_coins = 200000
where vip_bronze_coins is not null;

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

create table if not exists public.coin_wallets (
  user_id uuid primary key,
  balance bigint not null default 0,
  lifetime_purchased bigint not null default 0,
  lifetime_spent bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  direction text not null,
  amount bigint not null,
  source text not null,
  related_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

alter table public.coin_transactions drop constraint if exists coin_transactions_type_check;
alter table public.coin_transactions
add constraint coin_transactions_type_check
check (type in ('purchase','gift_spend','admin_adjust','refund'));

alter table public.coin_transactions drop constraint if exists coin_transactions_direction_check;
alter table public.coin_transactions
add constraint coin_transactions_direction_check
check (direction in ('credit','debit'));

revoke update, delete on public.coin_transactions from anon, authenticated, service_role;

create or replace function public.cfm_block_coin_transactions_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;

  raise exception 'coin_transactions is insert-only';
end;
$$;

drop trigger if exists coin_transactions_block_update on public.coin_transactions;
create trigger coin_transactions_block_update
before update on public.coin_transactions
for each row
execute function public.cfm_block_coin_transactions_mutation();

drop trigger if exists coin_transactions_block_delete on public.coin_transactions;
create trigger coin_transactions_block_delete
before delete on public.coin_transactions
for each row
execute function public.cfm_block_coin_transactions_mutation();

create table if not exists public.coin_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  provider_order_id text not null,
  status text not null default 'pending',
  amount_usd_cents int not null,
  coins_awarded bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_order_id)
);

alter table public.coin_purchase_orders drop constraint if exists coin_purchase_orders_provider_order_id_key;
create unique index if not exists coin_purchase_orders_provider_order_id_unique_idx
  on public.coin_purchase_orders (provider_order_id);

create index if not exists coin_purchase_orders_user_created_at_idx
  on public.coin_purchase_orders (user_id, created_at desc);

create index if not exists coin_transactions_user_created_at_idx
  on public.coin_transactions (user_id, created_at desc);

do $$
begin
  if to_regclass('public.gifts') is not null then
    execute 'create index if not exists gifts_to_user_created_at_idx on public.gifts (to_user_id, created_at desc)';
    execute 'create index if not exists gifts_from_user_created_at_idx on public.gifts (from_user_id, created_at desc)';
  end if;
end;
$$;

create table if not exists public.coin_packages (
  platform text not null,
  sku text not null,
  price_usd_cents int not null,
  coins bigint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (platform, sku)
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null,
  to_user_id uuid not null,
  stream_id uuid,
  gift_type text,
  coins bigint not null,
  created_at timestamptz not null default now()
);

drop table if exists public.coin_conversions;
drop function if exists public.cfm_convert_earned_coins(bigint, text);

create table if not exists public.vip_monthly_status (
  user_id uuid not null,
  month_start date not null,
  tier text,
  monthly_spent_coins bigint not null default 0,
  computed_at timestamptz not null default now(),
  primary key (user_id, month_start)
);

create table if not exists public.verification_subscriptions (
  user_id uuid primary key,
  platform text not null,
  is_active boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

revoke insert, update, delete on public.vip_monthly_status from anon, authenticated;
revoke insert, update, delete on public.verification_subscriptions from anon, authenticated;

create or replace function public.cfm_block_service_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;

  if public.cfm_is_admin() then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;

  raise exception 'mutation requires service_role';
end;
$$;

drop trigger if exists vip_monthly_status_block_update on public.vip_monthly_status;
create trigger vip_monthly_status_block_update
before update on public.vip_monthly_status
for each row
execute function public.cfm_block_service_only_mutation();

drop trigger if exists vip_monthly_status_block_delete on public.vip_monthly_status;
create trigger vip_monthly_status_block_delete
before delete on public.vip_monthly_status
for each row
execute function public.cfm_block_service_only_mutation();

drop trigger if exists verification_subscriptions_block_update on public.verification_subscriptions;
create trigger verification_subscriptions_block_update
before update on public.verification_subscriptions
for each row
execute function public.cfm_block_service_only_mutation();

drop trigger if exists verification_subscriptions_block_delete on public.verification_subscriptions;
create trigger verification_subscriptions_block_delete
before delete on public.verification_subscriptions
for each row
execute function public.cfm_block_service_only_mutation();

insert into public.coin_packages (platform, sku, price_usd_cents, coins, is_active)
values
  ('ios', 'coins_0_99', 99, 60, true),
  ('ios', 'coins_4_99', 499, 300, true),
  ('ios', 'coins_9_99', 999, 600, true),
  ('ios', 'coins_19_99', 1999, 1200, true),
  ('ios', 'coins_49_99', 4999, 3000, true),
  ('ios', 'coins_99_99', 9999, 6000, true),
  ('android', 'coins_0_99', 99, 60, true),
  ('android', 'coins_4_99', 499, 300, true),
  ('android', 'coins_9_99', 999, 600, true),
  ('android', 'coins_19_99', 1999, 1200, true),
  ('android', 'coins_49_99', 4999, 3000, true),
  ('android', 'coins_99_99', 9999, 6000, true),
  ('web', 'coins_0_99', 99, 90, true),
  ('web', 'coins_4_99', 499, 450, true),
  ('web', 'coins_9_99', 999, 900, true),
  ('web', 'coins_19_99', 1999, 1800, true),
  ('web', 'coins_49_99', 4999, 4500, true),
  ('web', 'coins_99_99', 9999, 9000, true),
  ('web', 'coins_249_99', 24999, 22500, true),
  ('web', 'coins_499_99', 49999, 45000, true),
  ('web', 'coins_999_99', 99999, 90000, true),
  ('web', 'coins_2499_99', 249999, 225000, true),
  ('web', 'coins_4999_99', 499999, 450000, true),
  ('web', 'coins_9999_99', 999999, 900000, true),
  ('web', 'coins_24999_99', 2499999, 2500000, true)
on conflict (platform, sku) do update set
  price_usd_cents = excluded.price_usd_cents,
  coins = excluded.coins,
  is_active = excluded.is_active;

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

create or replace function public.cfm_apply_paid_gift_to_lifetime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'paid') or (tg_op = 'UPDATE' and old.status is distinct from 'paid' and new.status = 'paid') then
    if new.gifter_user_id is not null then
      update public.cfm_members m
      set lifetime_gifted_total_usd = coalesce(m.lifetime_gifted_total_usd, 0) + (new.amount_cents::numeric / 100)
        , lifetime_gifted_total_coins = coalesce(m.lifetime_gifted_total_coins, 0) + (new.amount_cents::bigint)
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

update public.cfm_members m
set lifetime_gifted_total_usd = coalesce(t.total_usd, 0)
  , lifetime_gifted_total_coins = coalesce(t.total_coins, 0)
from (
  select g.gifter_user_id, (sum(g.amount_cents)::numeric / 100) as total_usd, sum(g.amount_cents)::bigint as total_coins
  from public.cfm_post_gifts g
  where g.status = 'paid'
    and g.gifter_user_id is not null
  group by g.gifter_user_id
) t
where m.user_id = t.gifter_user_id;

update public.cfm_members m
set lifetime_gifted_total_coins = greatest(coalesce(m.lifetime_gifted_total_coins, 0), floor(coalesce(m.lifetime_gifted_total_usd, 0) * 100)::bigint)
where m.user_id is not null;

insert into public.coin_wallets (user_id, balance, lifetime_purchased, lifetime_spent)
select m.user_id, 0, 0, 0
from public.cfm_members m
where m.user_id is not null
on conflict (user_id) do nothing;

create or replace function public.cfm_get_wallet(p_user_id uuid default auth.uid())
returns table (
  user_id uuid,
  balance bigint,
  lifetime_purchased bigint,
  lifetime_spent bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select w.user_id, w.balance, w.lifetime_purchased, w.lifetime_spent, w.created_at, w.updated_at
  from public.coin_wallets w
  where w.user_id = coalesce(p_user_id, auth.uid());
$$;

grant execute on function public.cfm_get_wallet(uuid) to authenticated;

create or replace function public.cfm_create_coin_purchase_order(
  p_package_sku text,
  p_platform text
)
returns table (
  id uuid,
  user_id uuid,
  provider text,
  amount_usd_cents int,
  coins_awarded bigint,
  status text
)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_platform text := lower(btrim(coalesce(p_platform, '')));
  v_sku text := btrim(coalesce(p_package_sku, ''));
  v_provider text;
  v_price int;
  v_coins bigint;
  v_order_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if v_platform not in ('web','ios','android') then
    raise exception 'invalid platform';
  end if;

  if v_sku = '' then
    raise exception 'missing sku';
  end if;

  select cp.price_usd_cents, cp.coins
  into v_price, v_coins
  from public.coin_packages cp
  where cp.platform = v_platform
    and cp.sku = v_sku
    and cp.is_active = true;

  if v_price is null or v_coins is null then
    raise exception 'invalid package';
  end if;

  v_provider := case when v_platform = 'web' then 'stripe' when v_platform = 'ios' then 'apple' else 'google' end;

  insert into public.coin_purchase_orders (user_id, provider, provider_order_id, status, amount_usd_cents, coins_awarded, updated_at)
  values (v_user_id, v_provider, ('pending:' || gen_random_uuid()::text), 'pending', v_price, v_coins, now())
  returning coin_purchase_orders.id into v_order_id;

  return query
  select v_order_id, v_user_id, v_provider, v_price, v_coins, 'pending'::text;
end;
$$;

grant execute on function public.cfm_create_coin_purchase_order(text, text) to authenticated;

create or replace function public.cfm_finalize_coin_purchase(
  p_provider text,
  p_provider_order_id text,
  p_user_id uuid,
  p_coins bigint,
  p_amount_usd_cents int,
  p_idempotency_key text
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_provider_order_id text := btrim(coalesce(p_provider_order_id, ''));
  v_user_id uuid := p_user_id;
  v_coins bigint := coalesce(p_coins, 0);
  v_amount int := coalesce(p_amount_usd_cents, 0);
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_existing_tx uuid;
  v_month_start date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_start timestamptz := (date_trunc('month', (now() at time zone 'utc'))::date::timestamp at time zone 'utc');
  v_end timestamptz := ((date_trunc('month', (now() at time zone 'utc'))::date + interval '1 month')::timestamp at time zone 'utc');
  v_bronze bigint := 25000;
  v_silver bigint := 50000;
  v_gold bigint := 100000;
  v_diamond bigint := 200000;
  v_monthly_purchased bigint := 0;
  v_tier text := null;
begin
  if v_provider not in ('stripe','apple','google') then
    raise exception 'invalid provider';
  end if;
  if v_provider_order_id = '' then
    raise exception 'missing provider_order_id';
  end if;
  if v_user_id is null then
    raise exception 'missing user_id';
  end if;
  if v_coins <= 0 then
    raise exception 'invalid coins';
  end if;
  if v_key = '' then
    raise exception 'missing idempotency_key';
  end if;

  select ct.id into v_existing_tx
  from public.coin_transactions ct
  where ct.idempotency_key = v_key
  limit 1;

  if v_existing_tx is not null then
    return json_build_object('ok', true, 'duplicate', true, 'transaction_id', v_existing_tx);
  end if;

  insert into public.coin_purchase_orders (user_id, provider, provider_order_id, status, amount_usd_cents, coins_awarded, updated_at)
  values (v_user_id, v_provider, v_provider_order_id, 'paid', v_amount, v_coins, now())
  on conflict (provider_order_id)
  do update set
    status = 'paid',
    amount_usd_cents = excluded.amount_usd_cents,
    coins_awarded = excluded.coins_awarded,
    updated_at = now();

  insert into public.coin_wallets (user_id, balance, lifetime_purchased, lifetime_spent, updated_at)
  values (v_user_id, 0, 0, 0, now())
  on conflict (user_id) do nothing;

  perform 1 from public.coin_wallets w where w.user_id = v_user_id for update;

  update public.coin_wallets
  set balance = balance + v_coins,
      lifetime_purchased = lifetime_purchased + v_coins,
      updated_at = now()
  where user_id = v_user_id;

  insert into public.coin_transactions (user_id, type, direction, amount, source, related_id, idempotency_key)
  values (v_user_id, 'purchase', 'credit', v_coins, v_provider, null, v_key)
  returning id into v_existing_tx;

  select
    ms.vip_bronze_coins,
    ms.vip_silver_coins,
    ms.vip_gold_coins,
    ms.vip_diamond_coins
  into v_bronze, v_silver, v_gold, v_diamond
  from public.cfm_monetization_settings ms
  order by ms.created_at desc
  limit 1;

  v_bronze := coalesce(v_bronze, 25000);
  v_silver := coalesce(v_silver, 50000);
  v_gold := coalesce(v_gold, 100000);
  v_diamond := coalesce(v_diamond, 200000);

  select coalesce(sum(ct.amount), 0)::bigint
  into v_monthly_purchased
  from public.coin_transactions ct
  where ct.user_id = v_user_id
    and ct.type = 'purchase'
    and ct.direction = 'credit'
    and ct.created_at >= v_start
    and ct.created_at < v_end;

  v_tier := case
    when v_monthly_purchased >= v_diamond then 'diamond'
    when v_monthly_purchased >= v_gold then 'gold'
    when v_monthly_purchased >= v_silver then 'silver'
    when v_monthly_purchased >= v_bronze then 'bronze'
    else null
  end;

  insert into public.vip_monthly_status (user_id, month_start, tier, monthly_spent_coins, computed_at)
  values (v_user_id, v_month_start, v_tier, v_monthly_purchased, now())
  on conflict (user_id, month_start) do update set
    tier = excluded.tier,
    monthly_spent_coins = excluded.monthly_spent_coins,
    computed_at = excluded.computed_at;

  update public.cfm_members
  set vip_tier = v_tier
  where user_id = v_user_id;

  return json_build_object('ok', true, 'transaction_id', v_existing_tx);
end;
$$;

grant execute on function public.cfm_finalize_coin_purchase(text, text, uuid, bigint, int, text) to authenticated;

create or replace function public.cfm_send_gift(
  p_to_user_id uuid,
  p_stream_id uuid,
  p_gift_type text,
  p_coins bigint,
  p_idempotency_key text
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_from uuid := auth.uid();
  v_to uuid := p_to_user_id;
  v_coins bigint := coalesce(p_coins, 0);
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_existing uuid;
  v_gift_id uuid;
begin
  if v_from is null then
    raise exception 'not authenticated';
  end if;
  if v_to is null then
    raise exception 'missing recipient';
  end if;
  if v_coins <= 0 then
    raise exception 'invalid coins';
  end if;
  if v_key = '' then
    raise exception 'missing idempotency_key';
  end if;

  select ct.id into v_existing
  from public.coin_transactions ct
  where ct.idempotency_key = v_key
  limit 1;
  if v_existing is not null then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  insert into public.coin_wallets (user_id, balance, lifetime_purchased, lifetime_spent, updated_at)
  values (v_from, 0, 0, 0, now())
  on conflict (user_id) do nothing;

  perform 1 from public.coin_wallets w where w.user_id = v_from for update;

  if (select balance from public.coin_wallets where user_id = v_from) < v_coins then
    raise exception 'insufficient balance';
  end if;

  update public.coin_wallets
  set balance = balance - v_coins,
      lifetime_spent = lifetime_spent + v_coins,
      updated_at = now()
  where user_id = v_from;

  insert into public.gifts (from_user_id, to_user_id, stream_id, gift_type, coins)
  values (v_from, v_to, p_stream_id, nullif(btrim(coalesce(p_gift_type, '')), ''), v_coins)
  returning id into v_gift_id;

  insert into public.coin_transactions (user_id, type, direction, amount, source, related_id, idempotency_key)
  values (v_from, 'gift_spend', 'debit', v_coins, 'system', v_gift_id, v_key);

  -- Also write to legacy cfm_post_gifts so leaderboards pick it up
  insert into public.cfm_post_gifts (post_id, gifter_user_id, recipient_user_id, amount_cents, currency, provider, status, paid_at)
  values (null, v_from, v_to, v_coins, 'coins', 'coins', 'paid', now());

  update public.cfm_members
  set lifetime_gifted_total_coins = coalesce(lifetime_gifted_total_coins, 0) + v_coins
  where user_id = v_from;

  return json_build_object('ok', true, 'gift_id', v_gift_id);
end;
$$;

grant execute on function public.cfm_send_gift(uuid, uuid, text, bigint, text) to authenticated;

create or replace function public.cfm_get_gifter_level(p_user_id uuid default auth.uid())
returns json
language sql
security definer
stable
set search_path = public
as $$
  with u as (
    select coalesce(p_user_id, auth.uid()) as user_id
  )
  select json_build_object(
    'user_id', u.user_id,
    'total_coins', coalesce(t.total_spent_coins, 0),
    'lifetime_spent', coalesce(t.total_spent_coins, 0)
  )
  from u
  left join lateral (
    select coalesce(sum(x.coins), 0)::bigint as total_spent_coins
    from (
      select pg.amount_cents::bigint as coins
      from public.cfm_post_gifts pg
      where pg.gifter_user_id = u.user_id
        and pg.status = 'paid'

      union all

      select ct.amount::bigint as coins
      from public.coin_transactions ct
      where ct.user_id = u.user_id
        and ct.type = 'gift_spend'
        and ct.direction = 'debit'
    ) x
  ) t on true;
$$;

create or replace function public.cfm_run_vip_monthly_rollup(p_month_start date default (date_trunc('month', (now() at time zone 'utc'))::date))
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_month_start date := p_month_start;
  v_start timestamptz := (v_month_start::timestamp at time zone 'utc');
  v_end timestamptz := ((v_month_start + interval '1 month')::timestamp at time zone 'utc');
  v_bronze bigint := 25000;
  v_silver bigint := 50000;
  v_gold bigint := 100000;
  v_diamond bigint := 200000;
begin
  select
    ms.vip_bronze_coins,
    ms.vip_silver_coins,
    ms.vip_gold_coins,
    ms.vip_diamond_coins
  into v_bronze, v_silver, v_gold, v_diamond
  from public.cfm_monetization_settings ms
  order by ms.created_at desc
  limit 1;

  v_bronze := coalesce(v_bronze, 25000);
  v_silver := coalesce(v_silver, 50000);
  v_gold := coalesce(v_gold, 100000);
  v_diamond := coalesce(v_diamond, 200000);

  with purchases as (
    select
      ct.user_id,
      coalesce(sum(ct.amount), 0)::bigint as monthly_purchased_coins
    from public.coin_transactions ct
    where ct.type = 'purchase'
      and ct.direction = 'credit'
      and ct.created_at >= v_start
      and ct.created_at < v_end
    group by ct.user_id
  ), tiers as (
    select
      p.user_id,
      p.monthly_purchased_coins,
      case
        when p.monthly_purchased_coins >= v_diamond then 'diamond'
        when p.monthly_purchased_coins >= v_gold then 'gold'
        when p.monthly_purchased_coins >= v_silver then 'silver'
        when p.monthly_purchased_coins >= v_bronze then 'bronze'
        else null
      end as tier
    from purchases p
  )
  insert into public.vip_monthly_status (user_id, month_start, tier, monthly_spent_coins, computed_at)
  select t.user_id, v_month_start, t.tier, t.monthly_purchased_coins, now()
  from tiers t
  on conflict (user_id, month_start) do update set
    tier = excluded.tier,
    monthly_spent_coins = excluded.monthly_spent_coins,
    computed_at = excluded.computed_at;

  if v_month_start = date_trunc('month', (now() at time zone 'utc'))::date then
    update public.cfm_members m
    set vip_tier = v.tier
    from public.vip_monthly_status v
    where v.month_start = v_month_start
      and v.user_id = m.user_id;

    update public.cfm_members m
    set vip_tier = null
    where m.vip_tier is not null
      and not exists (
        select 1
        from public.vip_monthly_status v
        where v.user_id = m.user_id
          and v.month_start = v_month_start
          and v.tier is not null
      );
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'cfm_vip_monthly_rollup_daily') then
      perform cron.schedule(
        'cfm_vip_monthly_rollup_daily',
        '10 0 * * *',
        $$select public.cfm_run_vip_monthly_rollup();$$
      );
    end if;
  end if;
end;
$$;

grant execute on function public.cfm_get_gifter_level(uuid) to authenticated;

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
alter table public.cfm_live_kicks enable row level security;

alter table public.coin_wallets enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.coin_purchase_orders enable row level security;
alter table public.coin_packages enable row level security;
alter table public.gifts enable row level security;
alter table public.vip_monthly_status enable row level security;
alter table public.verification_subscriptions enable row level security;

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

revoke update (points, lifetime_gifted_total_usd, lifetime_gifted_total_coins, vip_tier, is_verified) on public.cfm_members from authenticated;

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

create policy "coin_wallets_select_own_or_admin"
on public.coin_wallets
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "coin_transactions_select_own_or_admin"
on public.coin_transactions
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "coin_purchase_orders_select_own_or_admin"
on public.coin_purchase_orders
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "coin_packages_select_anyone"
on public.coin_packages
for select
to anon, authenticated
using (true);

create policy "gifts_select_related_or_admin"
on public.gifts
for select
to authenticated
using (
  public.cfm_is_admin()
  or from_user_id = auth.uid()
  or to_user_id = auth.uid()
);

create policy "vip_monthly_select_own_or_admin"
on public.vip_monthly_status
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "verification_select_own_or_admin"
on public.verification_subscriptions
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

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

create policy "live_kicks_select_self_mod_or_admin"
on public.cfm_live_kicks
for select
to authenticated
using (
  public.cfm_is_admin()
  or public.cfm_is_mod()
  or exists (select 1 from public.cfm_live_state ls where ls.id = live_id and ls.host_user_id = auth.uid())
  or kicked_user_id = auth.uid()
);

create policy "live_kicks_insert_host_mod_or_admin"
on public.cfm_live_kicks
for insert
to authenticated
with check (
  public.cfm_is_admin()
  or public.cfm_is_mod()
  or exists (select 1 from public.cfm_live_state ls where ls.id = live_id and ls.host_user_id = auth.uid())
);

create policy "live_kicks_delete_host_mod_or_admin"
on public.cfm_live_kicks
for delete
to authenticated
using (
  public.cfm_is_admin()
  or public.cfm_is_mod()
  or exists (select 1 from public.cfm_live_state ls where ls.id = live_id and ls.host_user_id = auth.uid())
);

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
    sender_user_id = auth.uid()
    and type = 'system'
    and coalesce(metadata->>'event','') = 'join'
    and not exists (
      select 1
      from public.cfm_live_bans b
      where b.banned_user_id = auth.uid()
        and b.revoked_at is null
    )
  )
  or (
    public.cfm_is_approved_member()
    and sender_user_id = auth.uid()
    and type in ('chat','emote')
    and not exists (
      select 1
      from public.cfm_live_bans b
      where b.banned_user_id = auth.uid()
        and b.revoked_at is null
    )
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
    -- All gifts from cfm_post_gifts divided by 100:
    -- Legacy USD: cents/100 = dollars = points (1 point per $1)
    -- New coins: coins/100 = points (1 point per 100 coins)
    select coalesce((select sum(pg.amount_cents) / 100 from public.cfm_post_gifts pg where pg.gifter_user_id = m.user_id and pg.status = 'paid'), 0)::int as gift_points
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
    and m.user_id != '4deba91a-9a75-4e50-b348-13eda39d7cfb'::uuid
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

-- Live Viewers tracking
create table if not exists public.cfm_live_viewers (
  id uuid primary key default gen_random_uuid(),
  live_id uuid references public.cfm_live_state(id) on delete cascade,
  user_id uuid not null,
  display_name text,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  unique (live_id, user_id)
);

create index if not exists cfm_live_viewers_live_id_idx
  on public.cfm_live_viewers (live_id);

create index if not exists cfm_live_viewers_last_seen_idx
  on public.cfm_live_viewers (live_id, last_seen_at desc);

alter table public.cfm_live_viewers enable row level security;

create policy "viewers_select_all"
on public.cfm_live_viewers
for select
to authenticated
using (true);

create policy "viewers_insert_own"
on public.cfm_live_viewers
for insert
to authenticated
with check (user_id = auth.uid());

create policy "viewers_update_own"
on public.cfm_live_viewers
for update
to authenticated
using (user_id = auth.uid());

-- Function to join as viewer (upsert)
create or replace function public.cfm_join_live_viewer(p_live_id uuid)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
  v_live_exists boolean;
  v_live_is_live boolean;
  v_started_at timestamptz;
  v_is_new_join boolean := false;
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  -- Check if live_id exists in cfm_live_state
  select exists(select 1 from public.cfm_live_state where id = p_live_id) into v_live_exists;
  if not v_live_exists then
    return json_build_object('error', 'Live session not found');
  end if;

  select is_live from public.cfm_live_state where id = p_live_id into v_live_is_live;
  if not coalesce(v_live_is_live, false) then
    return json_build_object('error', 'Live is not active');
  end if;

  select started_at from public.cfm_live_state where id = p_live_id into v_started_at;

  if exists (
    select 1
    from public.cfm_live_bans b
    where b.banned_user_id = v_user_id
      and b.revoked_at is null
  ) then
    return json_build_object('error', 'You are banned');
  end if;

  if exists (
    select 1
    from public.cfm_live_kicks k
    where k.live_id = p_live_id
      and k.kicked_user_id = v_user_id
  ) then
    return json_build_object('error', 'You were removed by the host');
  end if;

  -- Get display name from cfm_public_member_ids (favorited_username)
  select favorited_username into v_display_name
  from public.cfm_public_member_ids
  where user_id = v_user_id;

  -- Prevent duplicate join system messages when join is called concurrently
  -- (e.g. token endpoint + client join at the same time)
  perform pg_advisory_xact_lock(hashtext(p_live_id::text), hashtext(v_user_id::text));

  -- Check if this is a new join (not already in viewers or left_at is set)
  select not exists(
    select 1 from public.cfm_live_viewers 
    where live_id = p_live_id
      and user_id = v_user_id
      and left_at is null
      and (v_started_at is null or joined_at >= v_started_at)
  ) into v_is_new_join;

  -- Upsert viewer record
  insert into public.cfm_live_viewers (live_id, user_id, display_name, joined_at, last_seen_at, left_at)
  values (p_live_id, v_user_id, coalesce(v_display_name, 'Viewer'), now(), now(), null)
  on conflict (live_id, user_id)
  do update set
    last_seen_at = now(),
    left_at = null,
    joined_at = case
      when excluded.joined_at is null then cfm_live_viewers.joined_at
      when v_started_at is not null and cfm_live_viewers.joined_at < v_started_at then excluded.joined_at
      when cfm_live_viewers.left_at is not null then excluded.joined_at
      else cfm_live_viewers.joined_at
    end,
    display_name = coalesce(excluded.display_name, cfm_live_viewers.display_name);

  -- Insert join message to chat if this is a new join
  if v_is_new_join then
    begin
      insert into public.cfm_live_chat (live_id, sender_user_id, message, type, metadata)
      values (p_live_id, v_user_id, coalesce(v_display_name, 'Viewer') || ' has joined', 'system', '{"event": "join"}'::jsonb);
    exception
      when others then
        null;
    end;
  end if;

  return json_build_object('success', true);
exception
  when foreign_key_violation then
    return json_build_object('error', 'Live session not found');
  when others then
    return json_build_object('error', 'Failed to join: ' || sqlerrm);
end;
$$;

grant execute on function public.cfm_join_live_viewer(uuid) to authenticated;

-- Function to leave as viewer
create or replace function public.cfm_leave_live_viewer(p_live_id uuid)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
  v_was_online boolean;
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  -- Check if user was actually online (left_at is null)
  select left_at is null into v_was_online
  from public.cfm_live_viewers
  where live_id = p_live_id and user_id = v_user_id;

  -- Get display name
  select favorited_username into v_display_name
  from public.cfm_public_member_ids
  where user_id = v_user_id;

  update public.cfm_live_viewers
  set left_at = now()
  where live_id = p_live_id and user_id = v_user_id;

  -- Insert leave message to chat if user was online
  if coalesce(v_was_online, false) then
    begin
      insert into public.cfm_live_chat (live_id, sender_user_id, message, type, metadata)
      values (p_live_id, v_user_id, coalesce(v_display_name, 'Viewer') || ' has left', 'system', '{"event": "leave"}'::jsonb);
    exception
      when others then
        null;
    end;
  end if;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.cfm_leave_live_viewer(uuid) to authenticated;

-- Function to get current viewers for a live stream
create or replace function public.cfm_get_live_viewers(p_live_id uuid)
returns table (
  user_id uuid,
  display_name text,
  joined_at timestamptz,
  last_seen_at timestamptz,
  is_online boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with ls as (
    select started_at
    from public.cfm_live_state
    where id = p_live_id
  )
  select
    v.user_id,
    v.display_name,
    v.joined_at,
    v.last_seen_at,
    (v.left_at is null and v.last_seen_at > now() - interval '2 minutes') as is_online
  from public.cfm_live_viewers v
  cross join ls
  where v.live_id = p_live_id
    and (ls.started_at is null or v.joined_at >= ls.started_at)
  order by v.joined_at asc;
$$;

grant execute on function public.cfm_get_live_viewers(uuid) to anon, authenticated;

create or replace function public.cfm_live_top_gifters(p_live_id uuid)
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
  with ls as (
    select id, started_at
    from public.cfm_live_state
    where id = p_live_id
  ),
  events as (
    -- Legacy: cfm_post_gifts
    select
      g.gifter_user_id as user_id,
      g.amount_cents::bigint as amount_cents,
      coalesce(g.paid_at, g.created_at) as ts
    from public.cfm_post_gifts g
    cross join ls
    where g.status = 'paid'
      and g.gifter_user_id is not null
      and (g.post_id is null or g.post_id::text = 'Live')
      and coalesce(g.provider, '') != 'coins'

    union all

    -- Legacy: cfm_live_chat tip messages with amount_cents metadata
    select
      lc.sender_user_id as user_id,
      case
        when (lc.metadata->>'amount_cents') ~ '^[0-9]+$'
          then (lc.metadata->>'amount_cents')::bigint
        else null
      end as amount_cents,
      lc.created_at as ts
    from public.cfm_live_chat lc
    cross join ls
    where lc.live_id = p_live_id
      and lc.type = 'tip'
      and lc.is_deleted = false
      and lc.sender_user_id is not null
      and lc.metadata ? 'amount_cents'

    union all

    -- New: gifts table (coin-based gifting)
    select
      g.from_user_id as user_id,
      g.coins as amount_cents,
      g.created_at as ts
    from public.gifts g
    where g.stream_id = p_live_id
      and g.from_user_id is not null
      and g.coins > 0
  ),
  filtered as (
    select e.user_id, e.amount_cents
    from events e
    cross join ls
    where e.user_id is not null
      and e.amount_cents is not null
      and e.amount_cents > 0
      and (ls.started_at is null or (e.ts at time zone 'America/New_York') >= (ls.started_at at time zone 'America/New_York'))
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
    (t.total_cents)::numeric as total_amount,
    rank() over (order by t.total_cents desc, coalesce(pm.favorited_username, 'Member') asc)::int as rank
  from totals t
  left join public.cfm_public_member_ids pm
    on pm.user_id = t.user_id
  order by rank asc;
$$;

grant execute on function public.cfm_live_top_gifters(uuid) to anon, authenticated;

-- Function to heartbeat (update last_seen_at)
create or replace function public.cfm_viewer_heartbeat(p_live_id uuid)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_live_is_live boolean;
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  if exists (
    select 1
    from public.cfm_live_bans b
    where b.banned_user_id = v_user_id
      and b.revoked_at is null
  ) then
    update public.cfm_live_viewers
    set left_at = now()
    where user_id = v_user_id and left_at is null;
    return json_build_object('error', 'You are banned');
  end if;

  if exists (
    select 1
    from public.cfm_live_kicks k
    where k.live_id = p_live_id
      and k.kicked_user_id = v_user_id
  ) then
    update public.cfm_live_viewers
    set left_at = now()
    where user_id = v_user_id and left_at is null;
    return json_build_object('error', 'You were removed by the host');
  end if;

  select is_live from public.cfm_live_state where id = p_live_id into v_live_is_live;
  if not coalesce(v_live_is_live, false) then
    update public.cfm_live_viewers
    set left_at = now()
    where user_id = v_user_id and left_at is null;
    return json_build_object('error', 'Live is not active');
  end if;

  update public.cfm_live_viewers
  set last_seen_at = now()
  where live_id = p_live_id and user_id = v_user_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.cfm_viewer_heartbeat(uuid) to authenticated;

create or replace function public.cfm_is_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cfm_live_bans b
    where b.banned_user_id = p_user_id
      and b.revoked_at is null
  );
$$;

grant execute on function public.cfm_is_banned(uuid) to authenticated;

create or replace function public.cfm_ban_user(
  p_banned_user_id uuid,
  p_reason text default null
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_live_id uuid;
  v_host uuid;
  v_is_live boolean;
  v_banned_name text;
begin
  if v_actor is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  select id, host_user_id, is_live
  into v_live_id, v_host, v_is_live
  from public.cfm_live_state
  order by updated_at desc
  limit 1;

  if not (public.cfm_is_admin() or public.cfm_is_mod() or (coalesce(v_is_live, false) and v_host = v_actor)) then
    return json_build_object('error', 'Not authorized');
  end if;

  if p_banned_user_id is null then
    return json_build_object('error', 'Missing user');
  end if;

  insert into public.cfm_live_bans (host_user_id, banned_user_id, reason, created_at, revoked_at)
  values (v_actor, p_banned_user_id, p_reason, now(), null)
  on conflict (banned_user_id)
  do update set
    host_user_id = excluded.host_user_id,
    reason = excluded.reason,
    created_at = now(),
    revoked_at = null;

  update public.cfm_live_viewers
  set left_at = now()
  where user_id = p_banned_user_id and left_at is null;

  select favorited_username
  into v_banned_name
  from public.cfm_public_member_ids
  where user_id = p_banned_user_id;

  if v_live_id is not null and coalesce(v_is_live, false) then
    begin
      insert into public.cfm_live_chat (live_id, sender_user_id, message, type, metadata)
      values (
        v_live_id,
        v_actor,
        coalesce(v_banned_name, 'Member') || ' was banned',
        'system',
        jsonb_build_object('event', 'ban', 'user_id', p_banned_user_id::text)
      );
    exception
      when others then
        null;
    end;
  end if;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.cfm_ban_user(uuid, text) to authenticated;

create or replace function public.cfm_unban_user(p_banned_user_id uuid)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_live_id uuid;
  v_host uuid;
  v_is_live boolean;
  v_banned_name text;
begin
  if v_actor is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  select id, host_user_id, is_live
  into v_live_id, v_host, v_is_live
  from public.cfm_live_state
  order by updated_at desc
  limit 1;

  if not (public.cfm_is_admin() or public.cfm_is_mod() or (coalesce(v_is_live, false) and v_host = v_actor)) then
    return json_build_object('error', 'Not authorized');
  end if;

  update public.cfm_live_bans
  set revoked_at = now()
  where banned_user_id = p_banned_user_id
    and revoked_at is null;

  select favorited_username
  into v_banned_name
  from public.cfm_public_member_ids
  where user_id = p_banned_user_id;

  if v_live_id is not null and coalesce(v_is_live, false) then
    begin
      insert into public.cfm_live_chat (live_id, sender_user_id, message, type, metadata)
      values (
        v_live_id,
        v_actor,
        coalesce(v_banned_name, 'Member') || ' was unbanned',
        'system',
        jsonb_build_object('event', 'unban', 'user_id', p_banned_user_id::text)
      );
    exception
      when others then
        null;
    end;
  end if;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.cfm_unban_user(uuid) to authenticated;

create or replace function public.cfm_kick_live_viewer(
  p_live_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_host uuid;
begin
  if v_actor is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  select host_user_id into v_host from public.cfm_live_state where id = p_live_id;

  if not (public.cfm_is_admin() or public.cfm_is_mod() or v_host = v_actor) then
    return json_build_object('error', 'Not authorized');
  end if;

  insert into public.cfm_live_kicks (live_id, kicked_user_id, kicked_by, reason)
  values (p_live_id, p_user_id, v_actor, p_reason)
  on conflict (live_id, kicked_user_id)
  do update set
    kicked_by = excluded.kicked_by,
    reason = excluded.reason,
    created_at = now();

  update public.cfm_live_viewers
  set left_at = now()
  where live_id = p_live_id and user_id = p_user_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.cfm_kick_live_viewer(uuid, uuid, text) to authenticated;

-- Add to realtime publication
do $$
begin
  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'cfm_live_viewers'
    ) then
      alter publication supabase_realtime add table public.cfm_live_viewers;
    end if;
  exception
    when undefined_table then null;
    when undefined_object then null;
  end;
end
$$;

do $$
begin
  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'cfm_live_kicks'
    ) then
      alter publication supabase_realtime add table public.cfm_live_kicks;
    end if;
  exception
    when undefined_table then null;
    when undefined_object then null;
  end;
end
$$;

-- Reports table for flagging content
create table if not exists public.cfm_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid,
  report_type text not null,
  target_type text not null,
  target_id text,
  target_user_id uuid,
  reason text not null,
  details text,
  status text not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now()
);

alter table public.cfm_reports
add constraint cfm_reports_report_type_check
check (report_type in ('harassment', 'hate', 'sexual', 'violence', 'spam', 'impersonation', 'child_safety', 'other'));

alter table public.cfm_reports
add constraint cfm_reports_target_type_check
check (target_type in ('post', 'comment', 'profile', 'live_chat', 'live_stream'));

alter table public.cfm_reports
add constraint cfm_reports_status_check
check (status in ('pending', 'reviewed', 'actioned', 'dismissed'));

create index if not exists cfm_reports_status_idx
  on public.cfm_reports (status);

create index if not exists cfm_reports_created_at_idx
  on public.cfm_reports (created_at desc);

create index if not exists cfm_reports_target_idx
  on public.cfm_reports (target_type, target_id);

alter table public.cfm_reports enable row level security;

-- Anyone can submit a report
create policy "reports_insert_authenticated"
on public.cfm_reports
for insert
to authenticated
with check (reporter_user_id = auth.uid());

-- Only admins can view reports
create policy "reports_select_admin_only"
on public.cfm_reports
for select
to authenticated
using (public.cfm_is_admin());

-- Only admins can update reports
create policy "reports_update_admin_only"
on public.cfm_reports
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

-- Function to submit a report
create or replace function public.cfm_submit_report(
  p_report_type text,
  p_target_type text,
  p_target_id text default null,
  p_target_user_id uuid default null,
  p_reason text default 'other',
  p_details text default null
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  if not public.cfm_is_approved_member() then
    return json_build_object('error', 'Only members can submit reports');
  end if;

  -- Validate report_type
  if p_report_type not in ('harassment', 'hate', 'sexual', 'violence', 'spam', 'impersonation', 'child_safety', 'other') then
    return json_build_object('error', 'Invalid report type');
  end if;

  -- Validate target_type
  if p_target_type not in ('post', 'comment', 'profile', 'live_chat', 'live_stream') then
    return json_build_object('error', 'Invalid target type');
  end if;

  -- Insert the report
  insert into public.cfm_reports (
    reporter_user_id,
    report_type,
    target_type,
    target_id,
    target_user_id,
    reason,
    details,
    status
  ) values (
    v_user_id,
    p_report_type,
    p_target_type,
    p_target_id,
    p_target_user_id,
    coalesce(p_reason, 'other'),
    p_details,
    'pending'
  )
  returning id into v_report_id;

  return json_build_object('success', true, 'report_id', v_report_id);
exception
  when others then
    return json_build_object('error', 'Failed to submit report');
end;
$$;

grant execute on function public.cfm_submit_report(text, text, text, uuid, text, text) to authenticated;

-- Function to list reports (admin only)
create or replace function public.cfm_list_reports(
  p_status text default null,
  p_limit int default 50
)
returns table (
  id uuid,
  reporter_user_id uuid,
  reporter_username text,
  report_type text,
  target_type text,
  target_id text,
  target_user_id uuid,
  target_username text,
  reason text,
  details text,
  status text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.cfm_is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    r.id,
    r.reporter_user_id,
    coalesce(pm1.favorited_username, 'Unknown') as reporter_username,
    r.report_type,
    r.target_type,
    r.target_id,
    r.target_user_id,
    coalesce(pm2.favorited_username, 'Unknown') as target_username,
    r.reason,
    r.details,
    r.status,
    r.reviewed_by,
    r.reviewed_at,
    r.admin_notes,
    r.created_at
  from public.cfm_reports r
  left join public.cfm_public_member_ids pm1 on pm1.user_id = r.reporter_user_id
  left join public.cfm_public_member_ids pm2 on pm2.user_id = r.target_user_id
  where (p_status is null or r.status = p_status)
  order by r.created_at desc
  limit greatest(1, p_limit);
end;
$$;

grant execute on function public.cfm_list_reports(text, int) to authenticated;

-- Function to update report status (admin only)
create or replace function public.cfm_update_report_status(
  p_report_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.cfm_is_admin() then
    return json_build_object('error', 'Not authorized');
  end if;

  if p_status not in ('pending', 'reviewed', 'actioned', 'dismissed') then
    return json_build_object('error', 'Invalid status');
  end if;

  update public.cfm_reports
  set
    status = p_status,
    reviewed_by = v_user_id,
    reviewed_at = now(),
    admin_notes = coalesce(p_admin_notes, admin_notes)
  where id = p_report_id;

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to update report');
end;
$$;

grant execute on function public.cfm_update_report_status(uuid, text, text) to authenticated;

-- User bans/timeouts table
create table if not exists public.cfm_user_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  ban_type text not null default 'timeout',
  reason text,
  banned_by uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cfm_user_bans
add constraint cfm_user_bans_type_check
check (ban_type in ('timeout', 'ban'));

create index if not exists cfm_user_bans_user_id_idx
  on public.cfm_user_bans (user_id);

create index if not exists cfm_user_bans_expires_at_idx
  on public.cfm_user_bans (expires_at);

alter table public.cfm_user_bans enable row level security;

create policy "bans_select_admin_only"
on public.cfm_user_bans
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "bans_insert_admin_only"
on public.cfm_user_bans
for insert
to authenticated
with check (public.cfm_is_admin());

create policy "bans_update_admin_only"
on public.cfm_user_bans
for update
to authenticated
using (public.cfm_is_admin())
with check (public.cfm_is_admin());

create policy "bans_delete_admin_only"
on public.cfm_user_bans
for delete
to authenticated
using (public.cfm_is_admin());

-- Function to check if a user is banned or timed out
create or replace function public.cfm_is_user_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cfm_user_bans b
    where b.user_id = p_user_id
      and (b.expires_at is null or b.expires_at > now())
  );
$$;

grant execute on function public.cfm_is_user_banned(uuid) to authenticated;

-- Function to timeout a user (admin only)
create or replace function public.cfm_timeout_user(
  p_user_id uuid,
  p_duration_minutes int default 60,
  p_reason text default null
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_ban_id uuid;
begin
  if not public.cfm_is_admin() then
    return json_build_object('error', 'Not authorized');
  end if;

  insert into public.cfm_user_bans (user_id, ban_type, reason, banned_by, expires_at)
  values (p_user_id, 'timeout', p_reason, v_admin_id, now() + (p_duration_minutes || ' minutes')::interval)
  returning id into v_ban_id;

  return json_build_object('success', true, 'ban_id', v_ban_id);
exception
  when others then
    return json_build_object('error', 'Failed to timeout user');
end;
$$;

grant execute on function public.cfm_timeout_user(uuid, int, text) to authenticated;

-- Function to ban a user permanently (admin only)
create or replace function public.cfm_admin_ban_user(
  p_user_id uuid,
  p_reason text default null
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_ban_id uuid;
begin
  if not public.cfm_is_admin() then
    return json_build_object('error', 'Not authorized');
  end if;

  insert into public.cfm_user_bans (user_id, ban_type, reason, banned_by, expires_at)
  values (p_user_id, 'ban', p_reason, v_admin_id, null)
  returning id into v_ban_id;

  return json_build_object('success', true, 'ban_id', v_ban_id);
exception
  when others then
    return json_build_object('error', 'Failed to ban user');
end;
$$;

grant execute on function public.cfm_admin_ban_user(uuid, text) to authenticated;

-- Function to unban a user (admin only)
create or replace function public.cfm_admin_unban_user(p_user_id uuid)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if not public.cfm_is_admin() then
    return json_build_object('error', 'Not authorized');
  end if;

  delete from public.cfm_user_bans
  where user_id = p_user_id;

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to unban user');
end;
$$;

grant execute on function public.cfm_admin_unban_user(uuid) to authenticated;

-- Function to list banned users (admin only)
create or replace function public.cfm_list_bans(p_limit int default 100)
returns table (
  id uuid,
  user_id uuid,
  username text,
  ban_type text,
  reason text,
  banned_by uuid,
  banned_by_username text,
  expires_at timestamptz,
  created_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.cfm_is_admin() then
    return;
  end if;

  return query
  select
    b.id,
    b.user_id,
    coalesce(pm1.favorited_username, 'Unknown') as username,
    b.ban_type,
    b.reason,
    b.banned_by,
    coalesce(pm2.favorited_username, 'Admin') as banned_by_username,
    b.expires_at,
    b.created_at,
    (b.expires_at is null or b.expires_at > now()) as is_active
  from public.cfm_user_bans b
  left join public.cfm_public_member_ids pm1 on pm1.user_id = b.user_id
  left join public.cfm_public_member_ids pm2 on pm2.user_id = b.banned_by
  order by b.created_at desc
  limit greatest(1, p_limit);
end;
$$;

grant execute on function public.cfm_list_bans(int) to authenticated;

-- Function to remove content (hide post or comment) - admin only
create or replace function public.cfm_remove_content(
  p_content_type text,
  p_content_id uuid,
  p_reason text default null
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if not public.cfm_is_admin() then
    return json_build_object('error', 'Not authorized');
  end if;

  if p_content_type = 'post' then
    update public.cfm_feed_posts
    set is_hidden = true
    where id = p_content_id;
  elsif p_content_type = 'comment' then
    update public.cfm_feed_comments
    set is_hidden = true
    where id = p_content_id;
  else
    return json_build_object('error', 'Invalid content type');
  end if;

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to remove content');
end;
$$;

grant execute on function public.cfm_remove_content(text, uuid, text) to authenticated;

-- Add is_disabled column to members table if not exists
alter table public.cfm_members 
add column if not exists is_disabled boolean default false,
add column if not exists disabled_at timestamptz;

-- Function for users to disable their own account
create or replace function public.cfm_disable_my_account()
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  -- Mark the member as disabled
  update public.cfm_members
  set is_disabled = true,
      disabled_at = now()
  where user_id = v_user_id;

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to disable account');
end;
$$;

grant execute on function public.cfm_disable_my_account() to authenticated;

create table if not exists public.cfm_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  token text not null,
  platform text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (token),
  constraint cfm_push_tokens_platform_check check (platform in ('ios','android','web'))
);

create index if not exists cfm_push_tokens_user_id_idx
  on public.cfm_push_tokens (user_id);

alter table public.cfm_push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.cfm_push_tokens;
drop policy if exists "push_tokens_insert_own" on public.cfm_push_tokens;
drop policy if exists "push_tokens_update_own" on public.cfm_push_tokens;
drop policy if exists "push_tokens_delete_own" on public.cfm_push_tokens;

create policy "push_tokens_select_own"
on public.cfm_push_tokens
for select
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create policy "push_tokens_insert_own"
on public.cfm_push_tokens
for insert
to authenticated
with check (public.cfm_is_admin() or user_id = auth.uid());

create policy "push_tokens_update_own"
on public.cfm_push_tokens
for update
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid())
with check (public.cfm_is_admin() or user_id = auth.uid());

create policy "push_tokens_delete_own"
on public.cfm_push_tokens
for delete
to authenticated
using (public.cfm_is_admin() or user_id = auth.uid());

create or replace function public.cfm_register_push_token(
  p_token text,
  p_platform text
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
  v_platform text := lower(btrim(coalesce(p_platform, '')));
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  if v_token = '' then
    return json_build_object('error', 'Missing token');
  end if;

  if v_platform not in ('ios', 'android', 'web') then
    return json_build_object('error', 'Invalid platform');
  end if;

  insert into public.cfm_push_tokens (user_id, token, platform, enabled, updated_at)
  values (v_user_id, v_token, v_platform, true, now())
  on conflict (token)
  do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    enabled = true,
    updated_at = now();

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', sqlerrm);
end;
$$;

grant execute on function public.cfm_register_push_token(text, text) to authenticated;

create or replace function public.cfm_disable_push_token(
  p_token text
)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
begin
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  if v_token = '' then
    return json_build_object('error', 'Missing token');
  end if;

  update public.cfm_push_tokens
  set enabled = false,
      updated_at = now()
  where token = v_token
    and (public.cfm_is_admin() or user_id = v_user_id);

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', sqlerrm);
end;
$$;

grant execute on function public.cfm_disable_push_token(text) to authenticated;
