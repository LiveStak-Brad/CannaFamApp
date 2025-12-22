-- =====================================================
-- MODERATION SYSTEM MIGRATION
-- Roles (owner/admin/moderator) + Flag Review + Content Removal + Audit Log
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1) Ensure cfm_admins has role column with proper constraints
alter table public.cfm_admins add column if not exists role text not null default 'admin';
alter table public.cfm_admins add column if not exists created_at timestamptz not null default now();
alter table public.cfm_admins add column if not exists created_by uuid;

-- Update existing rows without role to 'admin'
update public.cfm_admins set role = 'admin' where role is null or role = '';

-- Drop and recreate constraint for role values
alter table public.cfm_admins drop constraint if exists cfm_admins_role_check;
alter table public.cfm_admins add constraint cfm_admins_role_check
  check (role in ('owner', 'admin', 'moderator'));

-- 2) Helper function to get user's role
create or replace function public.cfm_get_role(uid uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.role from public.cfm_admins a where a.user_id = coalesce(uid, auth.uid()) limit 1),
    'user'
  );
$$;

grant execute on function public.cfm_get_role(uuid) to authenticated;

-- 3) Permission helper functions
create or replace function public.cfm_is_owner(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cfm_admins a
    where a.user_id = coalesce(uid, auth.uid())
      and a.role = 'owner'
  );
$$;

grant execute on function public.cfm_is_owner(uuid) to authenticated;

-- Update cfm_is_admin to check for owner OR admin
create or replace function public.cfm_is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cfm_admins a
    where a.user_id = coalesce(uid, auth.uid())
      and a.role in ('owner', 'admin')
  );
$$;

-- Update cfm_is_mod to check for owner OR admin OR moderator
create or replace function public.cfm_is_mod(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cfm_admins a
    where a.user_id = coalesce(uid, auth.uid())
      and a.role in ('owner', 'admin', 'moderator')
  );
$$;

-- 4) Soft delete fields on posts
alter table public.cfm_feed_posts add column if not exists is_removed boolean not null default false;
alter table public.cfm_feed_posts add column if not exists removed_by uuid;
alter table public.cfm_feed_posts add column if not exists removed_at timestamptz;
alter table public.cfm_feed_posts add column if not exists removed_reason text;

-- Soft delete fields on comments
alter table public.cfm_feed_comments add column if not exists is_removed boolean not null default false;
alter table public.cfm_feed_comments add column if not exists removed_by uuid;
alter table public.cfm_feed_comments add column if not exists removed_at timestamptz;
alter table public.cfm_feed_comments add column if not exists removed_reason text;

-- 5) Moderation actions audit log
create table if not exists public.cfm_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  content_type text not null,
  content_id uuid,
  target_user_id uuid,
  note text,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.cfm_moderation_actions drop constraint if exists cfm_moderation_actions_action_type_check;
alter table public.cfm_moderation_actions add constraint cfm_moderation_actions_action_type_check
  check (action_type in ('remove_post', 'remove_comment', 'restore_post', 'restore_comment', 'review_flag', 'dismiss_flag', 'set_role', 'remove_role', 'ban_user', 'unban_user', 'timeout_user'));

alter table public.cfm_moderation_actions drop constraint if exists cfm_moderation_actions_content_type_check;
alter table public.cfm_moderation_actions add constraint cfm_moderation_actions_content_type_check
  check (content_type in ('post', 'comment', 'flag', 'role', 'user'));

create index if not exists cfm_moderation_actions_created_at_idx
  on public.cfm_moderation_actions (created_at desc);

create index if not exists cfm_moderation_actions_actor_idx
  on public.cfm_moderation_actions (actor_id);

alter table public.cfm_moderation_actions enable row level security;

drop policy if exists "mod_actions_select_mod" on public.cfm_moderation_actions;
create policy "mod_actions_select_mod"
on public.cfm_moderation_actions
for select
to authenticated
using (public.cfm_is_mod());

drop policy if exists "mod_actions_insert_mod" on public.cfm_moderation_actions;
create policy "mod_actions_insert_mod"
on public.cfm_moderation_actions
for insert
to authenticated
with check (public.cfm_is_mod());

-- 6) Update reports table RLS to allow mods to view
drop policy if exists "reports_select_admin_only" on public.cfm_reports;
create policy "reports_select_mod"
on public.cfm_reports
for select
to authenticated
using (public.cfm_is_mod() or reporter_user_id = auth.uid());

drop policy if exists "reports_update_admin_only" on public.cfm_reports;
create policy "reports_update_mod"
on public.cfm_reports
for update
to authenticated
using (public.cfm_is_mod())
with check (public.cfm_is_mod());

-- 7) Update cfm_list_reports to allow mods
create or replace function public.cfm_list_reports(
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
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
  created_at timestamptz,
  content_preview text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.cfm_is_mod() then
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
    r.created_at,
    case
      when r.target_type = 'post' then (
        select left(coalesce(p.content, p.title, ''), 100)
        from public.cfm_feed_posts p
        where p.id::text = r.target_id
        limit 1
      )
      when r.target_type = 'comment' then (
        select left(c.content, 100)
        from public.cfm_feed_comments c
        where c.id::text = r.target_id
        limit 1
      )
      else null
    end as content_preview
  from public.cfm_reports r
  left join public.cfm_public_member_ids pm1 on pm1.user_id = r.reporter_user_id
  left join public.cfm_public_member_ids pm2 on pm2.user_id = r.target_user_id
  where (p_status is null or r.status = p_status)
  order by r.created_at desc
  limit greatest(1, p_limit)
  offset greatest(0, p_offset);
end;
$$;

grant execute on function public.cfm_list_reports(text, int, int) to authenticated;

-- 8) Update cfm_update_report_status to allow mods and log action
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
  if not public.cfm_is_mod() then
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

  -- Log the action
  insert into public.cfm_moderation_actions (action_type, content_type, content_id, note, actor_id)
  values (
    case when p_status = 'dismissed' then 'dismiss_flag' else 'review_flag' end,
    'flag',
    p_report_id,
    p_admin_notes,
    v_user_id
  );

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to update report');
end;
$$;

grant execute on function public.cfm_update_report_status(uuid, text, text) to authenticated;

-- 9) Remove post function (mod+)
create or replace function public.cfm_mod_remove_post(
  p_post_id uuid,
  p_reason text default null,
  p_report_id uuid default null
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
  if not public.cfm_is_mod() then
    return json_build_object('error', 'Not authorized');
  end if;

  update public.cfm_feed_posts
  set is_removed = true,
      removed_by = v_user_id,
      removed_at = now(),
      removed_reason = p_reason
  where id = p_post_id;

  -- If report provided, mark it actioned
  if p_report_id is not null then
    update public.cfm_reports
    set status = 'actioned',
        reviewed_by = v_user_id,
        reviewed_at = now()
    where id = p_report_id;
  end if;

  -- Log the action
  insert into public.cfm_moderation_actions (action_type, content_type, content_id, note, actor_id)
  values ('remove_post', 'post', p_post_id, p_reason, v_user_id);

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to remove post');
end;
$$;

grant execute on function public.cfm_mod_remove_post(uuid, text, uuid) to authenticated;

-- 10) Remove comment function (mod+)
create or replace function public.cfm_mod_remove_comment(
  p_comment_id uuid,
  p_reason text default null,
  p_report_id uuid default null
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
  if not public.cfm_is_mod() then
    return json_build_object('error', 'Not authorized');
  end if;

  update public.cfm_feed_comments
  set is_removed = true,
      removed_by = v_user_id,
      removed_at = now(),
      removed_reason = p_reason
  where id = p_comment_id;

  -- If report provided, mark it actioned
  if p_report_id is not null then
    update public.cfm_reports
    set status = 'actioned',
        reviewed_by = v_user_id,
        reviewed_at = now()
    where id = p_report_id;
  end if;

  -- Log the action
  insert into public.cfm_moderation_actions (action_type, content_type, content_id, note, actor_id)
  values ('remove_comment', 'comment', p_comment_id, p_reason, v_user_id);

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to remove comment');
end;
$$;

grant execute on function public.cfm_mod_remove_comment(uuid, text, uuid) to authenticated;

-- 11) Restore post function (mod+)
create or replace function public.cfm_mod_restore_post(p_post_id uuid)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.cfm_is_mod() then
    return json_build_object('error', 'Not authorized');
  end if;

  update public.cfm_feed_posts
  set is_removed = false,
      removed_by = null,
      removed_at = null,
      removed_reason = null
  where id = p_post_id;

  insert into public.cfm_moderation_actions (action_type, content_type, content_id, actor_id)
  values ('restore_post', 'post', p_post_id, v_user_id);

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to restore post');
end;
$$;

grant execute on function public.cfm_mod_restore_post(uuid) to authenticated;

-- 12) Restore comment function (mod+)
create or replace function public.cfm_mod_restore_comment(p_comment_id uuid)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.cfm_is_mod() then
    return json_build_object('error', 'Not authorized');
  end if;

  update public.cfm_feed_comments
  set is_removed = false,
      removed_by = null,
      removed_at = null,
      removed_reason = null
  where id = p_comment_id;

  insert into public.cfm_moderation_actions (action_type, content_type, content_id, actor_id)
  values ('restore_comment', 'comment', p_comment_id, v_user_id);

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to restore comment');
end;
$$;

grant execute on function public.cfm_mod_restore_comment(uuid) to authenticated;

-- 13) Owner-only: Set role
create or replace function public.cfm_set_role(
  p_target_user_id uuid,
  p_role text
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
  if not public.cfm_is_owner() then
    return json_build_object('error', 'Only owner can assign roles');
  end if;

  if p_role not in ('admin', 'moderator') then
    return json_build_object('error', 'Invalid role. Use admin or moderator.');
  end if;

  insert into public.cfm_admins (user_id, role, created_at, created_by)
  values (p_target_user_id, p_role, now(), v_user_id)
  on conflict (user_id)
  do update set role = p_role, created_by = v_user_id;

  insert into public.cfm_moderation_actions (action_type, content_type, target_user_id, note, actor_id)
  values ('set_role', 'role', p_target_user_id, 'Set role to ' || p_role, v_user_id);

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to set role');
end;
$$;

grant execute on function public.cfm_set_role(uuid, text) to authenticated;

-- 14) Owner-only: Remove role
create or replace function public.cfm_remove_role(p_target_user_id uuid)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_role text;
begin
  if not public.cfm_is_owner() then
    return json_build_object('error', 'Only owner can remove roles');
  end if;

  select role into v_target_role from public.cfm_admins where user_id = p_target_user_id;

  if v_target_role = 'owner' then
    return json_build_object('error', 'Cannot remove owner role');
  end if;

  delete from public.cfm_admins where user_id = p_target_user_id;

  insert into public.cfm_moderation_actions (action_type, content_type, target_user_id, note, actor_id)
  values ('remove_role', 'role', p_target_user_id, 'Removed role', v_user_id);

  return json_build_object('success', true);
exception
  when others then
    return json_build_object('error', 'Failed to remove role');
end;
$$;

grant execute on function public.cfm_remove_role(uuid) to authenticated;

-- 15) Get moderation audit log (mod+)
create or replace function public.cfm_get_audit_log(p_limit int default 100)
returns table (
  id uuid,
  action_type text,
  content_type text,
  content_id uuid,
  target_user_id uuid,
  target_username text,
  note text,
  actor_id uuid,
  actor_username text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.cfm_is_mod() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    a.id,
    a.action_type,
    a.content_type,
    a.content_id,
    a.target_user_id,
    coalesce(pm1.favorited_username, 'Unknown') as target_username,
    a.note,
    a.actor_id,
    coalesce(pm2.favorited_username, 'Unknown') as actor_username,
    a.created_at
  from public.cfm_moderation_actions a
  left join public.cfm_public_member_ids pm1 on pm1.user_id = a.target_user_id
  left join public.cfm_public_member_ids pm2 on pm2.user_id = a.actor_id
  order by a.created_at desc
  limit greatest(1, p_limit);
end;
$$;

grant execute on function public.cfm_get_audit_log(int) to authenticated;

-- 16) Count pending reports (for notification dot)
create or replace function public.cfm_count_pending_reports()
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.cfm_reports
  where status = 'pending';
$$;

grant execute on function public.cfm_count_pending_reports() to authenticated;

-- 17) Count pending member applications (for notification dot)
create or replace function public.cfm_count_pending_applications()
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.cfm_applications
  where status = 'pending';
$$;

grant execute on function public.cfm_count_pending_applications() to authenticated;

-- 18) Get all members with roles for admin page
create or replace function public.cfm_get_members_with_roles(p_limit int default 200)
returns table (
  user_id uuid,
  favorited_username text,
  photo_url text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.cfm_is_mod() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    m.user_id,
    m.favorited_username,
    m.photo_url,
    coalesce(a.role, 'user') as role,
    m.created_at
  from public.cfm_members m
  left join public.cfm_admins a on a.user_id = m.user_id
  where m.user_id is not null
  order by
    case coalesce(a.role, 'user')
      when 'owner' then 1
      when 'admin' then 2
      when 'moderator' then 3
      else 4
    end,
    m.favorited_username asc
  limit greatest(1, p_limit);
end;
$$;

grant execute on function public.cfm_get_members_with_roles(int) to authenticated;

-- 19) RLS for cfm_admins - readable by mods, writable only via RPC
alter table public.cfm_admins enable row level security;

drop policy if exists "admins_select_mod" on public.cfm_admins;
create policy "admins_select_mod"
on public.cfm_admins
for select
to authenticated
using (public.cfm_is_mod() or user_id = auth.uid());

-- Deny direct writes - must use RPCs
drop policy if exists "admins_insert_deny" on public.cfm_admins;
drop policy if exists "admins_update_deny" on public.cfm_admins;
drop policy if exists "admins_delete_deny" on public.cfm_admins;

-- =====================================================
-- HOW TO SEED FIRST OWNER:
-- Run this manually in Supabase SQL Editor with your user_id:
-- 
-- INSERT INTO public.cfm_admins (user_id, role, created_at)
-- VALUES ('YOUR-USER-UUID-HERE', 'owner', now())
-- ON CONFLICT (user_id) DO UPDATE SET role = 'owner';
-- =====================================================
