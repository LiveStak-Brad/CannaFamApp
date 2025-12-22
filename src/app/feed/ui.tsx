"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFeedComment,
  deleteFeedComment,
  deleteMyDailyPost,
  deleteFeedPost,
  hideFeedComment,
  logFeedPostShare,
  upsertMyDailyPost,
  updateFeedComment,
  toggleCommentUpvote,
  toggleLike,
  updateFeedPost,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { ShareModal } from "@/components/ui/share-modal";
import { Textarea } from "@/components/ui/textarea";
import {
  MiniProfileModal,
  type MiniProfileAwardRow,
  type MiniProfilePointsRow,
  type MiniProfileSubject,
} from "@/components/ui/mini-profile";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";

export type FeedPost = {
  id: string;
  title: string | null;
  content: string | null;
  post_type: string | null;
  created_at: string | null;
  media_url: string | null;
  media_type: string | null;
  author_user_id?: string | null;
  post_date?: string | null;
};

export type MyDailyPost = {
  id: string;
  title: string | null;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
};

export function MyDailyPostComposer({
  canPost,
  existing,
  mentionCandidates,
}: {
  canPost: boolean;
  existing: MyDailyPost | null;
  mentionCandidates: MentionCandidate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<null | { tone: "success" | "error"; text: string }>(null);
  const [content, setContent] = useState(existing?.content ?? "");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  const mentionMatches = useMemo(() => {
    const q = (mentionQuery ?? "").trim().toLowerCase();
    if (!q) return [] as MentionCandidate[];
    return mentionCandidates
      .filter((m) => (m.favorited_username ?? "").toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [mentionCandidates, mentionQuery]);

  function updateMentionState(nextText: string) {
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? nextText.length;
    const before = nextText.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at === -1) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    if (at > 0) {
      const ch = before[at - 1];
      if (ch && !/\s/.test(ch)) {
        setMentionQuery(null);
        setMentionStart(null);
        return;
      }
    }
    const q = before.slice(at + 1);
    if (!q.length || /\s/.test(q)) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    setMentionQuery(q);
    setMentionStart(at);
  }

  function insertMention(username: string) {
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? content.length;
    const start = mentionStart ?? content.lastIndexOf("@", cursor);
    if (start < 0) return;
    const before = content.slice(0, start);
    const after = content.slice(cursor);
    const next = `${before}@${username} ${after}`;
    setContent(next);
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = before.length + 1 + username.length + 1;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  if (!canPost) return null;

  return (
    <Card title="Your post today">
      <div className="space-y-3">
        <div className="text-sm text-[color:var(--muted)]">
          Limit 1 post per day. You can edit or delete your post for today. Use @username to tag members.
        </div>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            const fd = new FormData(e.currentTarget);
            fd.set("content", content);
            startTransition(async () => {
              try {
                const res = await upsertMyDailyPost(fd);
                setMsg({ tone: "success", text: res.message });
                router.refresh();
              } catch (err) {
                setMsg({
                  tone: "error",
                  text: err instanceof Error ? err.message : "Save failed",
                });
              }
            });
          }}
        >
          <Input
            label="Title (optional)"
            name="title"
            defaultValue={existing?.title ?? ""}
            placeholder="Optional title"
          />
          <div className="space-y-2">
            <label className="block">
              <div className="text-sm font-semibold text-[color:var(--foreground)]">Post</div>
              <textarea
                ref={composerRef}
                name="content"
                className="mt-2 w-full min-h-28 rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
                value={content}
                onChange={(e) => {
                  const next = e.target.value;
                  setContent(next);
                  updateMentionState(next);
                }}
                onSelect={(e) => {
                  updateMentionState((e.target as HTMLTextAreaElement).value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setMentionQuery(null);
                    setMentionStart(null);
                  }
                }}
                required
                placeholder="Share an update for today"
              />
            </label>

            {mentionQuery && mentionMatches.length ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-2">
                <div className="text-xs text-[color:var(--muted)] px-2 py-1">Tag a member</div>
                <div className="max-h-48 overflow-auto">
                  {mentionMatches.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.04)]"
                      onClick={() => insertMention(m.favorited_username)}
                    >
                      <GifterRingAvatar
                        size={24}
                        imageUrl={m.photo_url}
                        name={m.favorited_username}
                        totalUsd={
                          typeof m.lifetime_gifted_total_usd === "number" ? m.lifetime_gifted_total_usd : null
                        }
                        showDiamondShimmer
                      />
                      <div className="font-semibold">@{m.favorited_username}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Media (optional)</div>
            <input
              type="file"
              name="media"
              accept="image/*,video/*"
              className="block w-full text-sm text-[color:var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[color:var(--border)] file:bg-black/20 file:px-3 file:py-2 file:text-sm file:text-[color:var(--foreground)]"
            />
            <div className="text-xs text-[color:var(--muted)]">One image or video.</div>
          </div>

          {existing?.media_url && existing?.media_type ? (
            <div className="pt-1">
              <FeedMedia mediaUrl={existing.media_url} mediaType={existing.media_type} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : existing ? "Update" : "Post"}
            </Button>
            {existing ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  const ok = window.confirm("Delete your post for today? This cannot be undone.");
                  if (!ok) return;
                  setMsg(null);
                  startTransition(async () => {
                    try {
                      const res = await deleteMyDailyPost();
                      setMsg({ tone: "success", text: res.message });
                      router.refresh();
                    } catch (err) {
                      setMsg({
                        tone: "error",
                        text: err instanceof Error ? err.message : "Delete failed",
                      });
                    }
                  });
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </Card>
  );
}

export type LikerProfile = {
  user_id: string;
  favorited_username: string;
  photo_url: string | null;
  lifetime_gifted_total_usd?: number | null;
  bio?: string | null;
  public_link?: string | null;
  instagram_link?: string | null;
  x_link?: string | null;
  tiktok_link?: string | null;
  youtube_link?: string | null;
};

export type FeedComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string | null;
  is_hidden: boolean | null;
};

export type MentionCandidate = {
  user_id: string;
  favorited_username: string;
  photo_url: string | null;
  lifetime_gifted_total_usd?: number | null;
  bio?: string | null;
  public_link?: string | null;
  instagram_link?: string | null;
  x_link?: string | null;
  tiktok_link?: string | null;
  youtube_link?: string | null;
};

export type GiftTopGifter = {
  favorited_username: string;
  photo_url: string | null;
  lifetime_gifted_total_usd?: number | null;
  total_cents: number;
};

function formatUSD(cents: number) {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "$0";
  return `$${(n / 100).toFixed(2)}`;
}

export function GiftModal({
  open,
  postId,
  pending,
  presets,
  allowCustom,
  minCents,
  maxCents,
  notice,
  onClose,
  onStartCheckout,
}: {
  open: boolean;
  postId: string;
  pending: boolean;
  presets: number[];
  allowCustom: boolean;
  minCents: number;
  maxCents: number;
  notice?: string | null;
  onClose: () => void;
  onStartCheckout: (amountCents: number) => void;
}) {
  const [custom, setCustom] = useState<string>("");

  if (!open) return null;

  const parsedCustom = Math.round(Number(custom) * 100);
  const customValid =
    allowCustom &&
    Number.isFinite(parsedCustom) &&
    parsedCustom >= minCents &&
    parsedCustom <= maxCents;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close gifting"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl px-4 pb-4">
        <Card title="Send a gift">
          <div className="space-y-3">
            <div className="text-xs text-[color:var(--muted)]">Post: {postId}</div>

            {notice ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-xs text-[color:var(--muted)]">
                {notice}
              </div>
            ) : null}

            <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-xs text-[color:var(--muted)]">
              All gifts go to CannaStreams to support the platform. We still track "support earned" for member posts.
            </div>

            <div className="grid grid-cols-2 gap-2">
              {presets.map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onStartCheckout(c)}
                >
                  {formatUSD(c)}
                </Button>
              ))}
            </div>

            {allowCustom ? (
              <div className="space-y-2">
                <Input
                  label="Custom amount (USD)"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder={(minCents / 100).toFixed(2)}
                />
                <Button
                  type="button"
                  disabled={pending || !customValid}
                  onClick={() => onStartCheckout(parsedCustom)}
                >
                  Send Gift
                </Button>
                <div className="text-xs text-[color:var(--muted)]">
                  Min {formatUSD(minCents)} • Max {formatUSD(maxCents)}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function GiftButton({
  postId,
  canGift,
  presets,
  allowCustom,
  minCents,
  maxCents,
  notice,
}: {
  postId: string;
  canGift: boolean;
  presets: number[];
  allowCustom: boolean;
  minCents: number;
  maxCents: number;
  notice?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-2 text-xs"
        disabled={pending || !canGift}
        onClick={() => {
          if (!canGift) return;
          setMsg(null);
          setOpen(true);
        }}
      >
        Gift
      </Button>

      {msg ? <div className="text-xs text-[color:var(--muted)]">{msg}</div> : null}

      <GiftModal
        open={open}
        postId={postId}
        pending={pending}
        presets={presets}
        allowCustom={allowCustom}
        minCents={minCents}
        maxCents={maxCents}
        notice={notice ?? null}
        onClose={() => setOpen(false)}
        onStartCheckout={(amountCents) => {
          if (!canGift) return;
          void amountCents;
          setMsg(null);
          startTransition(async () => {
            setMsg("Gifts are sent using coins. Please purchase coins in the app to continue.");
          });
        }}
      />
    </div>
  );
}

export function SiteGiftButton({
  returnPath,
  canGift,
  presets,
  allowCustom,
  minCents,
  maxCents,
  notice,
}: {
  returnPath: string;
  canGift: boolean;
  presets: number[];
  allowCustom: boolean;
  minCents: number;
  maxCents: number;
  notice?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-2 text-xs"
        disabled={pending || !canGift}
        onClick={() => {
          if (!canGift) return;
          setMsg(null);
          setOpen(true);
        }}
      >
        Gift
      </Button>

      {msg ? <div className="text-xs text-[color:var(--muted)]">{msg}</div> : null}

      <GiftModal
        open={open}
        postId="Site"
        pending={pending}
        presets={presets}
        allowCustom={allowCustom}
        minCents={minCents}
        maxCents={maxCents}
        notice={notice ?? null}
        onClose={() => setOpen(false)}
        onStartCheckout={(amountCents) => {
          if (!canGift) return;
          void amountCents;
          setMsg(null);
          startTransition(async () => {
            setMsg("Gifts are sent using coins. Please purchase coins in the app to continue.");
          });
        }}
      />
    </div>
  );
}

export function GiftSummary({
  totalCents,
  topGifters,
}: {
  totalCents: number;
  topGifters: GiftTopGifter[];
}) {
  const total = Number(totalCents ?? 0);
  const top = Array.isArray(topGifters) ? topGifters.slice(0, 3) : [];

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-[color:var(--muted)]">🎁 {formatUSD(total)} gifted</div>
      {top.length ? (
        <div className="flex items-center gap-1">
          {top.map((g) => (
            <GifterRingAvatar
              key={g.favorited_username}
              size={28}
              imageUrl={g.photo_url}
              name={g.favorited_username}
              totalUsd={typeof g.lifetime_gifted_total_usd === "number" ? g.lifetime_gifted_total_usd : null}
              showDiamondShimmer
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WhoLikedModal({
  open,
  count,
  likers,
  awards,
  leaderboard,
  myUserId,
  onClose,
}: {
  open: boolean;
  count: number;
  likers: LikerProfile[];
  awards: MiniProfileAwardRow[];
  leaderboard: MiniProfilePointsRow[];
  myUserId?: string | null;
  onClose: () => void;
}) {
  if (!open) return null;

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selected = useMemo(
    () => likers.find((l) => l.user_id === selectedUserId) ?? null,
    [likers, selectedUserId],
  );

  const selectedSubject: MiniProfileSubject | null = selected
    ? {
        user_id: selected.user_id,
        favorited_username: selected.favorited_username,
        photo_url: selected.photo_url,
        lifetime_gifted_total_usd:
          typeof selected.lifetime_gifted_total_usd === "number" ? selected.lifetime_gifted_total_usd : null,
        bio: selected.bio ?? null,
        public_link: selected.public_link ?? null,
        instagram_link: selected.instagram_link ?? null,
        x_link: selected.x_link ?? null,
        tiktok_link: selected.tiktok_link ?? null,
        youtube_link: selected.youtube_link ?? null,
      }
    : null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close who liked"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl px-4 pb-4">
        <Card title="Who liked this">
          <div className="space-y-3">
            <div className="text-xs text-[color:var(--muted)]">{count} like(s)</div>
            {likers.length ? (
              <div className="space-y-2">
                {likers.map((p) => (
                  <button
                    key={p.user_id}
                    type="button"
                    className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
                    onClick={() => setSelectedUserId(p.user_id)}
                  >
                    <GifterRingAvatar
                      size={32}
                      imageUrl={p.photo_url}
                      name={p.favorited_username}
                      totalUsd={
                        typeof p.lifetime_gifted_total_usd === "number" ? p.lifetime_gifted_total_usd : null
                      }
                      showDiamondShimmer
                    />
                    <div className="text-sm font-semibold">{p.favorited_username}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[color:var(--muted)]">Not available.</div>
            )}

            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <MiniProfileModal
        open={!!selectedUserId}
        subject={selectedSubject}
        leaderboard={leaderboard}
        awards={awards}
        myUserId={myUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}

function fmtTime(s: string | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return "";
  }
}

export function LocalTime({ iso }: { iso: string | null | undefined }) {
  const [out, setOut] = useState<string>("");

  useEffect(() => {
    const s = String(iso ?? "").trim();
    if (!s) {
      setOut("");
      return;
    }
    try {
      setOut(new Date(s).toLocaleString());
    } catch {
      setOut(s);
    }
  }, [iso]);

  if (!iso) return null;
  return <span>{out}</span>;
}

function CommentsModal({
  open,
  postId,
  canComment,
  isAdmin,
  myUserId,
  mentionCandidates,
  comments,
  commenterProfiles,
  upvoteCountByComment,
  upvotedByMe,
  awards,
  leaderboard,
  onClose,
}: {
  open: boolean;
  postId: string;
  canComment: boolean;
  isAdmin: boolean;
  myUserId: string | null;
  mentionCandidates: MentionCandidate[];
  comments: FeedComment[];
  commenterProfiles: Map<
    string,
    {
      favorited_username: string;
      photo_url: string | null;
      lifetime_gifted_total_usd?: number | null;
      bio?: string | null;
      public_link?: string | null;
      instagram_link?: string | null;
      x_link?: string | null;
      tiktok_link?: string | null;
      youtube_link?: string | null;
    }
  >;
  upvoteCountByComment: Map<string, number>;
  upvotedByMe: Set<string>;
  awards: MiniProfileAwardRow[];
  leaderboard: MiniProfilePointsRow[];
  onClose: () => void;
}) {
  if (!open) return null;

  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [text, setText] = useState("");
  const [sortMode, setSortMode] = useState<"newest" | "top">("newest");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");

  const [localComments, setLocalComments] = useState<FeedComment[]>(comments);

  useEffect(() => {
    setLocalComments(comments);
  }, [comments]);

  const selected = useMemo(() => {
    if (!selectedUserId) return null;
    const p = commenterProfiles.get(selectedUserId) ?? null;
    if (!p) return null;
    const subj: MiniProfileSubject = {
      user_id: selectedUserId,
      favorited_username: p.favorited_username,
      photo_url: p.photo_url,
      lifetime_gifted_total_usd:
        typeof p.lifetime_gifted_total_usd === "number" ? p.lifetime_gifted_total_usd : null,
      bio: p.bio ?? null,
      public_link: p.public_link ?? null,
      instagram_link: p.instagram_link ?? null,
      x_link: p.x_link ?? null,
      tiktok_link: p.tiktok_link ?? null,
      youtube_link: p.youtube_link ?? null,
    };
    return subj;
  }, [commenterProfiles, selectedUserId]);

  const visible = useMemo(
    () => localComments.filter((c) => !c.is_hidden || isAdmin),
    [isAdmin, localComments],
  );

  const replyToComment = useMemo(() => {
    if (!replyToId) return null;
    return visible.find((c) => c.id === replyToId) ?? null;
  }, [replyToId, visible]);

  const threads = useMemo(() => {
    const parents = visible.filter((c) => !c.parent_comment_id);
    const byParent = new Map<string, FeedComment[]>();
    for (const c of visible) {
      const pid = String(c.parent_comment_id ?? "").trim();
      if (!pid) continue;
      byParent.set(pid, [...(byParent.get(pid) ?? []), c]);
    }

    const byCreatedDesc = (a: FeedComment, b: FeedComment) => {
      const at = String(a.created_at ?? "");
      const bt = String(b.created_at ?? "");
      if (at === bt) return 0;
      return at > bt ? -1 : 1;
    };

    const byTop = (a: FeedComment, b: FeedComment) => {
      const au = upvoteCountByComment.get(a.id) ?? 0;
      const bu = upvoteCountByComment.get(b.id) ?? 0;
      if (au !== bu) return bu - au;
      return byCreatedDesc(a, b);
    };

    parents.sort(sortMode === "top" ? byTop : byCreatedDesc);

    return parents.map((p) => {
      const replies = (byParent.get(p.id) ?? []).slice();
      replies.sort(sortMode === "top" ? byTop : byCreatedDesc);
      return { parent: p, replies };
    });
  }, [sortMode, upvoteCountByComment, visible]);

  const mentionMatches = useMemo(() => {
    const q = (mentionQuery ?? "").trim().toLowerCase();
    if (!q) return [] as MentionCandidate[];
    const matches = mentionCandidates
      .filter((m) => (m.favorited_username ?? "").toLowerCase().startsWith(q))
      .slice(0, 8);
    return matches;
  }, [mentionCandidates, mentionQuery]);

  function updateMentionState(nextText: string) {
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? nextText.length;
    const before = nextText.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at === -1) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    if (at > 0) {
      const ch = before[at - 1];
      if (ch && !/\s/.test(ch)) {
        setMentionQuery(null);
        setMentionStart(null);
        return;
      }
    }
    const q = before.slice(at + 1);
    if (!q.length || /\s/.test(q)) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    setMentionQuery(q);
    setMentionStart(at);
  }

  function insertMention(username: string) {
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const start = mentionStart ?? text.lastIndexOf("@", cursor);
    if (start < 0) return;
    const before = text.slice(0, start);
    const after = text.slice(cursor);
    const next = `${before}@${username} ${after}`;
    setText(next);
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = (before.length + 1 + username.length + 1);
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  const mentionByUsername = useMemo(() => {
    const m = new Map<string, MentionCandidate>();
    for (const c of mentionCandidates) {
      const k = String(c.favorited_username ?? "").toLowerCase();
      if (!k) continue;
      m.set(k, c);
    }
    return m;
  }, [mentionCandidates]);

  function renderWithMentions(raw: string) {
    const parts = raw.split(/(@[A-Za-z0-9_]+)/g);
    return parts.map((part, idx) => {
      if (!part.startsWith("@")) return <span key={idx}>{part}</span>;
      const name = part.slice(1);
      const cand = mentionByUsername.get(name.toLowerCase()) ?? null;
      if (!cand) return <span key={idx}>{part}</span>;
      return (
        <button
          key={idx}
          type="button"
          className="font-semibold underline underline-offset-4"
          onClick={() => setSelectedUserId(cand.user_id)}
        >
          {part}
        </button>
      );
    });
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close comments"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl px-4 pb-4">
        <Card title="Comments">
          <div className="space-y-3">
            {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

            <div className="text-xs text-[color:var(--muted)]">
              {localComments.length} comment(s)
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={sortMode === "newest" ? "secondary" : undefined}
                  disabled={pending}
                  onClick={() => setSortMode("newest")}
                >
                  Newest
                </Button>
                <Button
                  type="button"
                  variant={sortMode === "top" ? "secondary" : undefined}
                  disabled={pending}
                  onClick={() => setSortMode("top")}
                >
                  Top
                </Button>
              </div>
              {replyToComment ? (
                <div className="text-xs text-[color:var(--muted)]">
                  Replying to <span className="font-semibold">{commenterProfiles.get(replyToComment.user_id)?.favorited_username ?? "Member"}</span>
                  <button
                    type="button"
                    className="ml-2 underline underline-offset-4"
                    onClick={() => setReplyToId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>

            {canComment ? (
              <div className="space-y-2">
                <label className="block">
                  <div className="text-sm font-semibold text-[color:var(--foreground)]">
                    Write a comment
                  </div>
                  <textarea
                    ref={composerRef}
                    className="mt-2 w-full min-h-28 rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
                    value={text}
                    onChange={(e) => {
                      const next = e.target.value;
                      setText(next);
                      updateMentionState(next);
                    }}
                    onSelect={(e) => {
                      const next = (e.target as HTMLTextAreaElement).value;
                      updateMentionState(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setMentionQuery(null);
                        setMentionStart(null);
                      }
                    }}
                    placeholder="Write something..."
                  />
                </label>

                {mentionQuery && mentionMatches.length ? (
                  <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-2">
                    <div className="text-xs text-[color:var(--muted)] px-2 py-1">Tag a member</div>
                    <div className="max-h-48 overflow-auto">
                      {mentionMatches.map((m) => (
                        <button
                          key={m.user_id}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.04)]"
                          onClick={() => insertMention(m.favorited_username)}
                        >
                          <GifterRingAvatar
                            size={24}
                            imageUrl={m.photo_url}
                            name={m.favorited_username}
                            totalUsd={
                              typeof m.lifetime_gifted_total_usd === "number" ? m.lifetime_gifted_total_usd : null
                            }
                            showDiamondShimmer
                          />
                          <div className="font-semibold">@{m.favorited_username}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={pending || !text.trim()}
                    onClick={() => {
                      setMsg(null);
                      startTransition(async () => {
                        try {
                          const res = await addFeedComment(postId, text, replyToId);
                          setMsg({ tone: "success", text: res.message });
                          const newId = String((res as any)?.commentId ?? "").trim() ||
                            (globalThis.crypto && "randomUUID" in globalThis.crypto
                              ? (globalThis.crypto as any).randomUUID()
                              : String(Date.now()));
                          if (myUserId) {
                            setLocalComments((prev) => [
                              ...prev,
                              {
                                id: newId,
                                post_id: postId,
                                user_id: myUserId,
                                content: text,
                                parent_comment_id: replyToId ?? null,
                                created_at: new Date().toISOString(),
                                is_hidden: false,
                              },
                            ]);
                          }
                          setText("");
                          setReplyToId(null);
                        } catch (e) {
                          setMsg({
                            tone: "error",
                            text: e instanceof Error ? e.message : "Comment failed",
                          });
                        }
                      });
                    }}
                  >
                    {pending ? "Posting..." : "Post"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[color:var(--muted)]">
                Log in and get approved to comment.
              </div>
            )}

            <div className="max-h-[55vh] space-y-2 overflow-auto">
              {threads.length ? (
                threads.map(({ parent, replies }) => {
                  const all = [parent, ...replies];
                  return (
                    <div key={parent.id} className="space-y-2">
                      {all.map((c) => {
                        const isReply = !!c.parent_comment_id;
                        const p = commenterProfiles.get(c.user_id) ?? null;
                        const name = p?.favorited_username || "Member";
                        const photo = p?.photo_url ?? null;
                        const bio = p?.bio ?? null;

                        const upCount = upvoteCountByComment.get(c.id) ?? 0;
                        const mine = upvotedByMe.has(c.id);
                        const isOwner = !!myUserId && c.user_id === myUserId;
                        const isEditing = editingId === c.id;

                        return (
                          <div
                            key={c.id}
                            className={
                              "rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 " +
                              (isReply ? "ml-10" : "")
                            }
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                className="flex min-w-0 items-start gap-3 text-left"
                                onClick={() => setSelectedUserId(c.user_id)}
                              >
                                <GifterRingAvatar
                                  size={32}
                                  imageUrl={photo}
                                  name={name}
                                  totalUsd={
                                    typeof p?.lifetime_gifted_total_usd === "number" ? p.lifetime_gifted_total_usd : null
                                  }
                                  showDiamondShimmer
                                />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-semibold truncate">{name}</div>
                                  </div>
                                  {bio ? (
                                    <div className="mt-0.5 text-xs text-[color:var(--muted)] truncate">{bio}</div>
                                  ) : null}
                                  <div className="mt-1 text-xs text-[color:var(--muted)]">{fmtTime(c.created_at)}</div>
                                </div>
                              </button>

                              <div className="shrink-0 text-right">
                                <button
                                  type="button"
                                  className={
                                    "rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs font-semibold " +
                                    (mine
                                      ? "bg-[rgba(209,31,42,0.25)] text-[color:var(--foreground)]"
                                      : "bg-[rgba(255,255,255,0.02)] text-[color:var(--muted)]")
                                  }
                                  onClick={() => {
                                    if (!canComment) return;
                                    setMsg(null);
                                    startTransition(async () => {
                                      try {
                                        const res = await toggleCommentUpvote(c.id, mine);
                                        setMsg({ tone: "success", text: res.message });
                                      } catch (e) {
                                        setMsg({
                                          tone: "error",
                                          text: e instanceof Error ? e.message : "Upvote failed",
                                        });
                                      }
                                    });
                                  }}
                                >
                                  ⬆ {upCount}
                                </button>

                                {!isReply ? (
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                                      onClick={() => {
                                        if (!canComment) return;
                                        setReplyToId(c.id);
                                        requestAnimationFrame(() => composerRef.current?.focus());
                                      }}
                                    >
                                      Reply
                                    </button>
                                  </div>
                                ) : null}

                                {isOwner ? (
                                  <div className="mt-2 flex justify-end gap-2">
                                    {isEditing ? (
                                      <>
                                        <button
                                          type="button"
                                          className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                                          onClick={() => {
                                            setEditingId(null);
                                            setEditingText("");
                                          }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                                          onClick={() => {
                                            const next = editingText.trim();
                                            if (!next) return;
                                            setMsg(null);
                                            startTransition(async () => {
                                              try {
                                                const res = await updateFeedComment(c.id, next);
                                                setMsg({ tone: "success", text: res.message });
                                                setEditingId(null);
                                                setEditingText("");
                                              } catch (e) {
                                                setMsg({
                                                  tone: "error",
                                                  text: e instanceof Error ? e.message : "Update failed",
                                                });
                                              }
                                            });
                                          }}
                                        >
                                          Save
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                                        onClick={() => {
                                          setEditingId(c.id);
                                          setEditingText(c.content);
                                        }}
                                      >
                                        Edit
                                      </button>
                                    )}
                                  </div>
                                ) : null}

                                {isAdmin ? (
                                  <div className="mt-2 flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                                      onClick={() => {
                                        setMsg(null);
                                        startTransition(async () => {
                                          try {
                                            const res = await hideFeedComment(c.id, !c.is_hidden);
                                            setMsg({ tone: "success", text: res.message });
                                          } catch (e) {
                                            setMsg({
                                              tone: "error",
                                              text: e instanceof Error ? e.message : "Hide failed",
                                            });
                                          }
                                        });
                                      }}
                                    >
                                      {c.is_hidden ? "Unhide" : "Hide"}
                                    </button>
                                    <button
                                      type="button"
                                      className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                                      onClick={() => {
                                        const ok = window.confirm("Delete this comment?");
                                        if (!ok) return;
                                        setMsg(null);
                                        startTransition(async () => {
                                          try {
                                            const res = await deleteFeedComment(c.id);
                                            setMsg({ tone: "success", text: res.message });
                                          } catch (e) {
                                            setMsg({
                                              tone: "error",
                                              text: e instanceof Error ? e.message : "Delete failed",
                                            });
                                          }
                                        });
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="mt-2">
                                <Textarea
                                  label="Edit comment"
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  placeholder="Update your comment"
                                />
                              </div>
                            ) : (
                              <div className="mt-2 text-sm whitespace-pre-wrap">{renderWithMentions(c.content)}</div>
                            )}
                            {c.is_hidden && isAdmin ? (
                              <div className="mt-2 text-xs text-[color:var(--muted)]">Hidden from public.</div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-[color:var(--muted)]">No comments yet.</div>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <MiniProfileModal
        open={!!selectedUserId}
        subject={selected}
        awards={awards}
        leaderboard={leaderboard}
        myUserId={myUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}

export function CommentsButton({
  postId,
  canComment,
  isAdmin,
  myUserId,
  mentionCandidates,
  comments,
  commenterProfiles,
  upvoteCountByComment,
  upvotedByMe,
  awards,
  leaderboard,
}: {
  postId: string;
  canComment: boolean;
  isAdmin: boolean;
  myUserId: string | null;
  mentionCandidates: MentionCandidate[];
  comments: FeedComment[];
  commenterProfiles: Map<
    string,
    { favorited_username: string; photo_url: string | null; lifetime_gifted_total_usd?: number | null; bio?: string | null }
  >;
  upvoteCountByComment: Map<string, number>;
  upvotedByMe: Set<string>;
  awards: MiniProfileAwardRow[];
  leaderboard: MiniProfilePointsRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-2 text-xs"
        onClick={() => setOpen(true)}
      >
        💬 {comments.length}
      </Button>
      <CommentsModal
        open={open}
        postId={postId}
        canComment={canComment}
        isAdmin={isAdmin}
        myUserId={myUserId}
        mentionCandidates={mentionCandidates}
        comments={comments}
        commenterProfiles={commenterProfiles}
        upvoteCountByComment={upvoteCountByComment}
        upvotedByMe={upvotedByMe}
        awards={awards}
        leaderboard={leaderboard}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function LikeCountButton({
  count,
  canOpen,
  likers,
  awards,
  leaderboard,
  myUserId,
}: {
  count: number;
  canOpen: boolean;
  likers: LikerProfile[];
  awards: MiniProfileAwardRow[];
  leaderboard: MiniProfilePointsRow[];
  myUserId?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!canOpen) {
    return <span>{count} like{count === 1 ? "" : "s"}</span>;
  }

  return (
    <>
      <button
        type="button"
        className="underline underline-offset-4"
        onClick={() => setOpen(true)}
      >
        {count} like{count === 1 ? "" : "s"}
      </button>
      <WhoLikedModal
        open={open}
        count={count}
        likers={likers}
        awards={awards}
        leaderboard={leaderboard}
        myUserId={myUserId}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function FeedEditModal({
  open,
  post,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  post: FeedPost;
  pending: boolean;
  onClose: () => void;
  onSave: (fd: FormData) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close edit post"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl px-4 pb-4">
        <Card title="Edit post">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSave(new FormData(e.currentTarget));
            }}
          >
            <input type="hidden" name="id" value={post.id} />
            <Input label="Title" name="title" defaultValue={post.title ?? ""} required />
            <Input
              label="Post type"
              name="post_type"
              defaultValue={post.post_type ?? ""}
              required
            />
            <Textarea
              label="Content"
              name="content"
              defaultValue={post.content ?? ""}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function FeedAdminPostControls({
  post,
  isAdmin,
}: {
  post: FeedPost;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<null | { tone: "success" | "error"; text: string }>(null);

  if (!isAdmin) return null;

  return (
    <div className="space-y-2">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            setOpen(true);
          }}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            const ok = window.confirm("Delete this post? This cannot be undone.");
            if (!ok) return;
            setMsg(null);
            startTransition(async () => {
              try {
                const res = (await deleteFeedPost(post.id)) as any;
                setMsg({ tone: "success", text: String(res?.message ?? "Post deleted.") });
                router.refresh();
              } catch (e) {
                setMsg({
                  tone: "error",
                  text: e instanceof Error ? e.message : "Delete failed",
                });
              }
            });
          }}
        >
          Delete
        </Button>
      </div>

      <FeedEditModal
        open={open}
        post={post}
        pending={pending}
        onClose={() => setOpen(false)}
        onSave={(fd) => {
          setMsg(null);
          startTransition(async () => {
            try {
              const res = (await updateFeedPost(fd)) as any;
              setMsg({ tone: "success", text: String(res?.message ?? "Post updated.") });
              setOpen(false);
              router.refresh();
            } catch (e) {
              setMsg({
                tone: "error",
                text: e instanceof Error ? e.message : "Update failed",
              });
            }
          });
        }}
      />
    </div>
  );
}

export function FeedMedia({
  mediaUrl,
  mediaType,
}: {
  mediaUrl: string;
  mediaType: string;
}) {
  if (!mediaUrl) return null;

  if (mediaType === "video") {
    return (
      <div className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-black/20">
        <video
          controls
          playsInline
          preload="metadata"
          src={mediaUrl}
          className="block w-full max-h-[400px] object-contain"
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-black/20">
      <img
        src={mediaUrl}
        alt="Feed media"
        loading="lazy"
        className="block w-full max-h-[400px] object-contain"
      />
    </div>
  );
}

export function FeedShareButton({
  postId,
  title,
  content,
  canEarn = true,
}: {
  postId: string;
  title: string;
  content: string;
  canEarn?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const link = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/feed#${postId}`;
  }, [postId]);

  const message = useMemo(() => {
    const trimmed = content.trim().replace(/\s+/g, " ");
    const chars = Array.from(trimmed);
    const snippet = chars.length > 120 ? `${chars.slice(0, 120).join("")}…` : trimmed;
    return `${title}\n\n${snippet}\n\n${link}`.trim();
  }, [title, content, link]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-2 text-xs"
        disabled={pending || !canEarn}
        onClick={() => {
          setMsg(null);
          setOpen(true);
        }}
      >
        Share
      </Button>

      {msg ? <div className="text-xs text-[color:var(--muted)]">{msg}</div> : null}

      <ShareModal
        open={open}
        title="Share this post"
        link={link}
        message={message}
        confirmLabel="I shared it"
        pending={pending}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          if (!canEarn) return;
          startTransition(async () => {
            try {
              const res = await logFeedPostShare(postId);
              setMsg(res.message);
              setOpen(false);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Share logging failed");
            }
          });
        }}
      />
    </>
  );
}

export function LikeButton({
  postId,
  liked,
  likeCount,
  likers,
  awards,
  leaderboard,
  canEarn = true,
  myUserId,
}: {
  postId: string;
  liked: boolean;
  likeCount: number;
  likers: LikerProfile[];
  awards: MiniProfileAwardRow[];
  leaderboard: MiniProfilePointsRow[];
  canEarn?: boolean;
  myUserId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [openWhoLiked, setOpenWhoLiked] = useState(false);

  const [localLiked, setLocalLiked] = useState(liked);
  const [localCount, setLocalCount] = useState(likeCount);

  useEffect(() => {
    setLocalLiked(liked);
    setLocalCount(likeCount);
  }, [liked, likeCount]);

  return (
    <div className="space-y-1">
      <div className="inline-flex overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
        <button
          type="button"
          disabled={pending || !canEarn}
          className="px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            if (!canEarn) return;
            setMsg(null);
            startTransition(async () => {
              const nextLiked = !localLiked;
              setLocalLiked(nextLiked);
              setLocalCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
              try {
                await toggleLike(postId, localLiked);
                setMsg(localLiked ? "💔 Like removed" : "❤️ Like logged (+1)");
              } catch (e) {
                setLocalLiked(liked);
                setLocalCount(likeCount);
                setMsg(e instanceof Error ? e.message : "Like failed");
              }
            });
          }}
        >
          {localLiked ? "Liked" : pending ? "..." : "Like"}
        </button>
        <button
          type="button"
          disabled={pending || localCount <= 0}
          className="border-l border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--muted)] transition hover:text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={(e) => {
            e.stopPropagation();
            if (localCount <= 0) return;
            setOpenWhoLiked(true);
          }}
          aria-label="View who liked"
        >
          {localCount}
        </button>
      </div>
      {msg ? <div className="text-xs text-[color:var(--muted)]">{msg}</div> : null}

      <WhoLikedModal
        open={openWhoLiked}
        count={localCount}
        likers={likers}
        awards={awards}
        leaderboard={leaderboard}
        myUserId={myUserId}
        onClose={() => setOpenWhoLiked(false)}
      />
    </div>
  );
}
