# CannaFam Moderation System

## Overview

This document describes the moderation system for CannaFam, including roles, permissions, content flagging, and moderation actions.

---

## Role Model

| Role | Level | Permissions |
|------|-------|-------------|
| **Owner** | Highest | All admin + mod permissions, plus: assign/remove roles |
| **Admin** | High | All mod permissions, plus: approve/reject applications, manage members, create feed posts, grant awards |
| **Moderator** | Medium | View flagged content, remove posts/comments, mark flags reviewed/dismissed, view audit log |
| **User** | Base | Standard member access, can report content |

### Role Hierarchy
```
owner > admin > moderator > user
```

### Role Assignment
- **Only the owner** can assign or remove admin/moderator roles
- Roles are stored in `cfm_admins` table with constraint: `role in ('owner', 'admin', 'moderator')`
- Use `cfm_set_role` RPC (owner-only) to assign roles
- Use `cfm_remove_role` RPC (owner-only) to remove roles

---

## Flag/Report Lifecycle

### Report Status Flow
```
pending → reviewed → (done)
pending → actioned → (done)
pending → dismissed → (done)
```

### Status Definitions
- **pending**: New report, awaiting review
- **reviewed**: Reviewed but no action taken (content OK or minor issue)
- **actioned**: Content was removed or user was warned/banned
- **dismissed**: Report was invalid or duplicate

### Report Types
- `harassment` - Harassment / Bullying
- `hate` - Hate or abusive content
- `sexual` - Sexual / explicit content
- `violence` - Violence or threats
- `spam` - Spam / scams
- `impersonation` - Impersonation
- `child_safety` - Child safety concerns
- `other` - Other violations

### Target Types
- `post` - Feed post
- `comment` - Feed comment
- `profile` - User profile
- `live_chat` - Live stream chat message
- `live_stream` - Live stream itself

---

## RPC Functions

### User-Facing

| RPC | Description | Who Can Call |
|-----|-------------|--------------|
| `cfm_submit_report` | Submit a content report | Any authenticated user |
| `cfm_get_role` | Get user's role | Any authenticated user |
| `cfm_is_owner` | Check if user is owner | Any authenticated user |
| `cfm_is_admin` | Check if user is owner or admin | Any authenticated user |
| `cfm_is_mod` | Check if user is owner, admin, or mod | Any authenticated user |

### Moderator/Admin

| RPC | Description | Who Can Call |
|-----|-------------|--------------|
| `cfm_list_reports` | List reports with filters | Mods, Admins, Owner |
| `cfm_update_report_status` | Update report status | Mods, Admins, Owner |
| `cfm_mod_remove_post` | Soft-delete a post | Mods, Admins, Owner |
| `cfm_mod_remove_comment` | Soft-delete a comment | Mods, Admins, Owner |
| `cfm_mod_restore_post` | Restore a removed post | Mods, Admins, Owner |
| `cfm_mod_restore_comment` | Restore a removed comment | Mods, Admins, Owner |
| `cfm_get_audit_log` | View moderation audit log | Mods, Admins, Owner |
| `cfm_count_pending_reports` | Count pending reports | Mods, Admins, Owner |
| `cfm_count_pending_applications` | Count pending member applications | Admins, Owner |

### Owner-Only

| RPC | Description | Who Can Call |
|-----|-------------|--------------|
| `cfm_set_role` | Assign admin/mod role to user | Owner only |
| `cfm_remove_role` | Remove admin/mod role from user | Owner only |

### Usage Examples

```sql
-- Submit a report
SELECT cfm_submit_report(
  'harassment',
  'post',
  'post-uuid-here',
  'author-user-uuid',
  'harassment',
  'This post contains harassment'
);

-- List pending reports
SELECT * FROM cfm_list_reports('pending', 50, 0);

-- Remove a post
SELECT cfm_mod_remove_post('post-uuid', 'Violated community guidelines', 'report-uuid');

-- Assign moderator role (owner only)
SELECT cfm_set_role('user-uuid', 'moderator');
```

---

## Where "Report" Exists in UI

### Web App
- **Feed posts**: 🚩 flag button next to like/share buttons
- **Comments**: 🚩 flag button next to reply button
- **Moderator Dashboard** (`/moderator`): Full report review interface
- **Admin Dashboard** (`/admin`): Moderation tab with report overview

### Mobile App
- **Feed posts**: 🚩 flag button in post action row
- **Comments**: Report via post menu (planned)
- **ReportModal component**: Full report submission interface

---

## Content Visibility Rules

### Removed Content
- **Regular users**: Cannot see removed posts/comments
- **Moderators/Admins**: Can see removed content with "🚫 Removed by moderation" label
- **Feed queries**: Filter `is_removed = false` for regular users

### Hidden Comments
- Uses existing `is_hidden` field
- Hidden comments show only to admins
- Separate from soft-delete removal

---

## Seeding the First Owner

After running the migration, manually insert the first owner:

```sql
-- Replace 'your-user-uuid' with the actual user ID
INSERT INTO public.cfm_admins (user_id, role, created_at)
VALUES ('your-user-uuid', 'owner', now())
ON CONFLICT (user_id) DO UPDATE SET role = 'owner';
```

To find your user ID:
```sql
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
```

---

## Ban/Kick System (Existing)

The following ban/kick functions already exist and use proper role gating:

| Function | Description | Who Can Call |
|----------|-------------|--------------|
| `cfm_ban_user` | Ban user from live streams | Admins, Mods, or Live Host |
| `cfm_unban_user` | Unban a user | Admins, Mods, or Live Host |
| `cfm_kick_live_viewer` | Kick user from current live | Admins, Mods, or Live Host |
| `cfm_is_banned` | Check if user is banned | Any authenticated user |

---

## Database Tables

### cfm_admins
Stores user roles.
```sql
- user_id (uuid, PK)
- role (text: 'owner' | 'admin' | 'moderator')
- created_at (timestamptz)
- created_by (uuid, nullable)
```

### cfm_reports
Stores content reports/flags.
```sql
- id (uuid, PK)
- reporter_user_id (uuid)
- report_type (text)
- target_type (text)
- target_id (uuid, nullable)
- target_user_id (uuid, nullable)
- reason (text)
- details (text, nullable)
- status (text: 'pending' | 'reviewed' | 'actioned' | 'dismissed')
- reviewed_by (uuid, nullable)
- reviewed_at (timestamptz, nullable)
- admin_notes (text, nullable)
- created_at (timestamptz)
```

### cfm_moderation_actions
Audit log for moderation actions.
```sql
- id (uuid, PK)
- action_type (text)
- content_type (text)
- content_id (uuid, nullable)
- target_user_id (uuid, nullable)
- actor_id (uuid)
- note (text, nullable)
- report_id (uuid, nullable)
- created_at (timestamptz)
```

### Soft Delete Fields (on cfm_feed_posts, cfm_feed_comments)
```sql
- is_removed (boolean, default false)
- removed_by (uuid, nullable)
- removed_at (timestamptz, nullable)
- removed_reason (text, nullable)
```

---

## NOT Implemented Yet

The following features are intentionally not implemented in this release:

1. **User blocking** - Users cannot block other users (only admins can ban)
2. **Timeout/mute duration** - Bans are permanent until manually unbanned
3. **Appeal system** - No self-service appeal for removed content
4. **Automated moderation** - No AI/keyword filtering
5. **Report notifications** - Reporters don't get notified of outcomes
6. **Mobile mod dashboard** - Moderation UI is web-only

---

## Manual Test Checklist

### As Owner
- [ ] Can access /admin page
- [ ] Can see "Roles" tab in admin dashboard
- [ ] Can assign admin role to a user
- [ ] Can assign moderator role to a user
- [ ] Can remove admin/mod roles
- [ ] Can see all moderation features

### As Admin
- [ ] Can access /admin page
- [ ] Cannot see "Roles" tab (owner-only)
- [ ] Can approve/reject applications
- [ ] Can remove members
- [ ] Can create feed posts
- [ ] Can see moderation tab and audit log

### As Moderator
- [ ] Cannot access /admin page (redirects)
- [ ] Can access /moderator page
- [ ] Can see pending reports
- [ ] Can mark reports as reviewed/dismissed
- [ ] Can remove posts/comments
- [ ] Can see removed content with label

### As Regular User
- [ ] Cannot access /admin or /moderator pages
- [ ] Can report posts via 🚩 button
- [ ] Can report comments via 🚩 button
- [ ] Cannot see removed posts/comments
- [ ] Cannot see admin/mod menu items

---

## Files Changed (Moderation Implementation)

### SQL
- `supabase-moderation.sql` - Full migration script

### Web App
- `src/lib/auth.ts` - Role helper functions
- `src/components/shell/topnav-auth.tsx` - Role-based menu with notification dots
- `src/components/ui/report-button.tsx` - Reusable report button component
- `src/app/admin/page.tsx` - Admin dashboard with moderation tabs
- `src/app/admin/ui.tsx` - Admin UI with audit log and reports
- `src/app/moderator/page.tsx` - Moderator dashboard page
- `src/app/moderator/ui.tsx` - Moderator dashboard UI
- `src/app/feed/page.tsx` - Filter removed posts, add report buttons
- `src/app/feed/ui.tsx` - Report button on comments

### Mobile App
- `src/components/ReportModal.tsx` - Report submission modal (already existed)
- `app/(tabs)/feed.tsx` - Report button integration (already existed)
