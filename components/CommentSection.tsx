"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SignInLink from "@/components/SignInLink";
import { Heart, Reply, Trash2, ChevronDown, ChevronUp, X, ListStart } from "lucide-react";
import ReportButton from "./ReportButton";
import EmojiButton from "./EmojiButton";
import GifButton from "./GifButton";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

interface CommentUser {
  id: string;
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
}

interface LinkedCollectionPreview {
  id: string;
  name: string;
  // Slug only resolves once the collection is public — the comment-tile
  // renderer treats null/empty slug as "not yet linkable".
  slug: string;
  curator: { firebaseUid: string; name: string };
  previewPosters: string[];
  itemCount: number;
}

// Picker-only data shape — includes visibility + slug-nullable so the
// picker can offer to publish a private collection inline.
interface PickerCollection {
  id: string;
  name: string;
  slug: string | null;
  visibility: "private" | "public" | "unlisted";
  itemCount: number;
  previewPosters: string[];
}

interface CommentData {
  id: string;
  text: string;
  gifUrl: string | null;
  parentId: string | null;
  createdAt: string;
  user: CommentUser;
  likeCount: number;
  likedByMe: boolean;
  linkedCollection: LinkedCollectionPreview | null;
  replies: CommentData[];
}

interface Props {
  targetType: string;
  targetId: string;
  disabled?: boolean;
  isAdmin?: boolean;
  // When true, surface a "Reply with your own list" affordance on the
  // comment form. Only meaningful when targetType is "collection" — on
  // any other target the picker would have nothing useful to do.
  enableCollectionLink?: boolean;
}

// Mini-tile rendered inside a comment when linkedCollection is set. Pure
// visual; tap takes the viewer to the linked collection page.
function LinkedCollectionTile({ linked }: { linked: LinkedCollectionPreview }) {
  const router = useRouter();
  const href = `/collections/${linked.curator.firebaseUid}/${linked.slug}`;
  // Use a button with explicit router.push instead of <Link> — soft-nav
  // through a Link inside a comment was silently no-op'ing, possibly
  // because the existing comment subtree intercepts certain click paths.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(href);
      }}
      className="mt-2 flex items-center gap-3 bg-[var(--surface-2)] hover:bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)]/50 rounded-lg p-2 max-w-[360px] transition-colors group text-left w-full cursor-pointer"
    >
      <div className="flex gap-0.5 shrink-0">
        {Array.from({ length: 4 }).map((_, i) => {
          const p = linked.previewPosters[i];
          return (
            <div key={i} className="relative w-6 aspect-[2/3] rounded-sm overflow-hidden bg-[var(--surface)]">
              {p ? (
                <Image src={posterUrl(p, "w92")} alt="" fill sizes="24px" className="object-cover" />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{linked.name}</p>
        <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
          {linked.itemCount} title{linked.itemCount === 1 ? "" : "s"} · by {linked.curator.name}
        </p>
      </div>
    </button>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export default function CommentSection({ targetType, targetId, disabled, isAdmin: isAdminProp, enableCollectionLink }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState(false);
  const [newText, setNewText] = useState("");
  const [newGifUrl, setNewGifUrl] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyGifUrl, setReplyGifUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Linked-collection state ("reply with your own list"). One slot per
  // form (top-level + active reply) so a user can have a draft going on
  // both at once without them stepping on each other.
  const [newLinked, setNewLinked] = useState<LinkedCollectionPreview | null>(null);
  const [replyLinked, setReplyLinked] = useState<LinkedCollectionPreview | null>(null);
  const [pickerOpen, setPickerOpen] = useState<"new" | "reply" | null>(null);
  const [pickerOptions, setPickerOptions] = useState<PickerCollection[] | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  // Tracks which private collection is currently being published from
  // inside the picker so the row can show a spinner.
  const [publishingFromPicker, setPublishingFromPicker] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  // Refs to the live textareas so the emoji picker can insert at the
  // current caret position. Auto-grow is handled by the inline onInput.
  const newTextRef = useRef<HTMLTextAreaElement | null>(null);
  const replyTextRef = useRef<HTMLTextAreaElement | null>(null);

  function autoGrow(ta: HTMLTextAreaElement) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }

  function insertEmojiInto(
    ref: React.RefObject<HTMLTextAreaElement | null>,
    current: string,
    setter: (next: string) => void,
    emoji: string,
  ) {
    const ta = ref.current;
    if (!ta) { setter(current + emoji); return; }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + emoji + current.slice(end);
    setter(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
      autoGrow(ta);
    });
  }
  const [togglingLike, setTogglingLike] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const isAdmin = isAdminProp ?? adminStatus;

  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  useEffect(() => {
    (async () => {
      const headers: Record<string, string> = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
        // Check admin status if not provided via prop
        if (isAdminProp === undefined) {
          fetch("/api/auth/admin-check", { headers }).then((r) => r.json()).then((d) => {
            if (d.isAdmin) setAdminStatus(true);
          }).catch(() => {});
        }
      }
      const res = await fetch(`/api/comments?targetType=${targetType}&targetId=${targetId}`, { headers });
      const data = await res.json();
      setComments(data.comments ?? []);
      setLoading(false);
    })();
  }, [user?.uid, targetType, targetId, isAdminProp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to and highlight a comment when the page was opened with
  // a #comment-<id> hash (notification click). Has to wait for the
  // comments fetch to land AND any ancestor threads to expand —
  // nested replies aren't in the DOM until their parents open.
  useEffect(() => {
    if (loading || comments.length === 0) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const match = hash.match(/^#comment-(.+)$/);
    if (!match) return;
    const targetId = match[1];

    // Walk the tree to find ancestor IDs so we can expand the threads.
    function findPath(list: CommentData[], id: string, path: string[]): string[] | null {
      for (const c of list) {
        if (c.id === id) return path;
        const found = findPath(c.replies, id, [...path, c.id]);
        if (found) return found;
      }
      return null;
    }
    const ancestors = findPath(comments, targetId, []);
    if (ancestors === null) return; // comment not in this tree
    if (ancestors.length > 0) {
      setExpandedThreads((prev) => {
        const next = new Set(prev);
        for (const id of ancestors) next.add(id);
        return next;
      });
    }
    // Wait one paint so the now-expanded ancestors render the target.
    requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${targetId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(targetId);
      window.setTimeout(() => setHighlightedId(null), 2400);
    });
  }, [loading, comments]);

  async function submitComment(parentId: string | null = null) {
    const text = parentId ? replyText : newText;
    const gifUrl = parentId ? replyGifUrl : newGifUrl;
    const linked = parentId ? replyLinked : newLinked;
    // Comment must have either text, a GIF, or a linked collection. The
    // linked-collection embed counts as content on its own so curators
    // can drop in a list without typing a redundant "here's mine".
    if (!text.trim() && !gifUrl && !linked) return;
    if (submitting) return;
    setSubmitting(true);
    const token = await getToken();
    if (!token) { setSubmitting(false); return; }
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType,
        targetId,
        parentId,
        text: text.trim(),
        gifUrl,
        linkedCollectionId: linked?.id ?? null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (parentId) {
        setComments((prev) => insertReply(prev, parentId, data.comment));
        setExpandedThreads((prev) => new Set(prev).add(parentId));
        setReplyText("");
        setReplyGifUrl(null);
        setReplyLinked(null);
        setReplyingTo(null);
      } else {
        setComments((prev) => [...prev, data.comment]);
        setNewText("");
        setNewGifUrl(null);
        setNewLinked(null);
      }
      setPickerOpen(null);
    }
    setSubmitting(false);
  }

  // Lazy-load ALL of the user's collections (public + private) so the
  // picker can offer to publish a private one inline. Cached in state so
  // subsequent opens don't refetch within the same session — but the
  // publish action below busts the cache.
  async function ensurePickerOptions() {
    if (pickerOptions !== null || pickerLoading) return;
    await refreshPickerOptions();
  }

  async function refreshPickerOptions() {
    setPickerLoading(true);
    try {
      const token = await getToken();
      if (!token) { setPickerOptions([]); return; }
      const res = await fetch("/api/custom-collections", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setPickerOptions([]); return; }
      const data = await res.json();
      type IncomingPickerCollection = {
        id: string;
        name: string;
        slug: string | null;
        visibility?: "private" | "public" | "unlisted";
        previewPosters: (string | null)[];
        itemCount: number;
      };
      const opts: PickerCollection[] = (data.collections ?? []).map((c: IncomingPickerCollection) => ({
        id: c.id,
        name: c.name,
        slug: c.slug ?? null,
        visibility: c.visibility ?? "private",
        previewPosters: (c.previewPosters ?? []).filter((p: string | null): p is string => typeof p === "string"),
        itemCount: c.itemCount,
      }));
      setPickerOptions(opts);
    } catch {
      setPickerOptions([]);
    } finally {
      setPickerLoading(false);
    }
  }

  function selectLinkedFromPicker(slot: "new" | "reply", c: PickerCollection) {
    if (c.visibility !== "public" || !c.slug) {
      setPickerError("Private collections can't be linked. Use the Publish & link button.");
      return;
    }
    const linked: LinkedCollectionPreview = {
      id: c.id,
      name: c.name,
      slug: c.slug,
      curator: { firebaseUid: user?.uid ?? "", name: user?.displayName ?? "you" },
      previewPosters: c.previewPosters,
      itemCount: c.itemCount,
    };
    if (slot === "new") setNewLinked(linked);
    else setReplyLinked(linked);
    setPickerOpen(null);
    setPickerError(null);
  }

  // Publish a private collection inline from the picker, then auto-link
  // it. Backed by the existing /publish endpoint so the same 5-item
  // minimum + rate limit + isOfficial gating apply. Confirms first
  // since publishing makes the collection visible to everyone.
  async function publishAndLinkFromPicker(slot: "new" | "reply", c: PickerCollection) {
    if (publishingFromPicker) return;
    if (!window.confirm(
      `"${c.name}" is currently private. Publishing will make it visible on the community feed and to anyone with the link. Continue?`,
    )) return;
    setPublishingFromPicker(c.id);
    setPickerError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/custom-collections/${c.id}/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPickerError(data.error ?? "Couldn't publish that collection.");
        return;
      }
      const newSlug: string | undefined = data.slug;
      if (!newSlug) { setPickerError("Published, but no slug returned. Refresh to retry."); return; }
      // Refresh the picker so other rows pick up the new visibility.
      await refreshPickerOptions();
      // Then immediately link it to the comment form.
      selectLinkedFromPicker(slot, { ...c, visibility: "public", slug: newSlug });
    } finally {
      setPublishingFromPicker(null);
    }
  }

  function insertReply(comments: CommentData[], parentId: string, reply: CommentData): CommentData[] {
    return comments.map((c) => {
      if (c.id === parentId) {
        return { ...c, replies: [...c.replies, reply] };
      }
      if (c.replies.length > 0) {
        return { ...c, replies: insertReply(c.replies, parentId, reply) };
      }
      return c;
    });
  }

  async function toggleLike(commentId: string) {
    if (!user || togglingLike.has(commentId)) return;
    setTogglingLike((prev) => new Set(prev).add(commentId));
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setComments((prev) => updateComment(prev, commentId, (c) => ({
        ...c,
        likedByMe: data.liked,
        likeCount: c.likeCount + (data.liked ? 1 : -1),
      })));
    }
    setTogglingLike((prev) => { const s = new Set(prev); s.delete(commentId); return s; });
  }

  async function deleteComment(commentId: string) {
    if (!user || deleting.has(commentId)) return;
    setDeleting((prev) => new Set(prev).add(commentId));
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setComments((prev) => removeComment(prev, commentId));
    }
    setDeleting((prev) => { const s = new Set(prev); s.delete(commentId); return s; });
  }

  function updateComment(comments: CommentData[], id: string, fn: (c: CommentData) => CommentData): CommentData[] {
    return comments.map((c) => {
      if (c.id === id) return fn(c);
      if (c.replies.length > 0) return { ...c, replies: updateComment(c.replies, id, fn) };
      return c;
    });
  }

  function removeComment(comments: CommentData[], id: string): CommentData[] {
    return comments.filter((c) => c.id !== id).map((c) => ({
      ...c,
      replies: removeComment(c.replies, id),
    }));
  }

  function toggleExpand(id: string) {
    setExpandedThreads((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function countAllReplies(c: CommentData): number {
    let count = c.replies.length;
    for (const r of c.replies) count += countAllReplies(r);
    return count;
  }

  function renderComment(comment: CommentData, depth: number = 0, depth1ParentId?: string) {
    const isOwn = user?.uid === comment.user.firebaseUid;
    const canDeleteComment = isOwn || isAdmin;
    const isExpanded = expandedThreads.has(comment.id);
    const maxIndent = Math.min(depth, 2);
    // depth 0: reply creates thread 1 (attached to this comment)
    // depth 1: reply creates thread 2 (attached to this comment)
    // depth 2+: reply stays in thread 2 (attached to the depth-1 parent)
    const replyTo = depth >= 2 && depth1ParentId ? depth1ParentId : comment.id;

    // Highlight when the page was opened with #comment-<id> in the URL
    // (notification click target). Pulse fades after a couple seconds.
    const isHighlighted = highlightedId === comment.id;
    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        className={`${depth > 0 ? "pl-3 border-l border-[var(--border)]/30" : ""}${isHighlighted ? " ring-2 ring-[var(--ratist-red)]/60 rounded-lg transition-shadow" : ""}`}
        style={depth > 0 ? { marginLeft: `${maxIndent * 16}px` } : undefined}
      >
        <div className="flex gap-2.5 py-2.5 group/comment">
          {/* Avatar */}
          <Link href={`/profile/${comment.user.firebaseUid}`} className="shrink-0">
            {comment.user.avatarUrl ? (
              <Image src={comment.user.avatarUrl} alt={comment.user.name} width={28} height={28} className="rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[10px] text-[var(--foreground-muted)]">
                {comment.user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 text-xs">
              <Link href={`/profile/${comment.user.firebaseUid}`} className="font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">
                {comment.user.name}
              </Link>
              <span className="text-[var(--foreground-muted)]">{timeAgo(comment.createdAt)}</span>
            </div>

            {/* Text with @mention highlighting (skip render when text is
                empty — comments may be GIF-only). */}
            {comment.text && (
              <p className="text-sm text-white/90 mt-0.5 whitespace-pre-wrap break-words">
                {comment.text.split(/(@\[[^\]]+\])/g).map((part, i) =>
                  part.match(/^@\[.+\]$/) ? (
                    <span key={i} className="text-[var(--ratist-red)] font-medium">@{part.slice(2, -1)}</span>
                  ) : part
                )}
              </p>
            )}
            {comment.gifUrl && (
              <a href={comment.gifUrl} target="_blank" rel="noopener noreferrer" className="block mt-1.5 max-w-[260px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={comment.gifUrl} alt="GIF" className="rounded-lg border border-[var(--border)]/40 max-w-full h-auto" loading="lazy" />
              </a>
            )}
            {comment.linkedCollection && <LinkedCollectionTile linked={comment.linkedCollection} />}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-1">
              {user && !disabled && (
                <>
                  <button
                    onClick={() => toggleLike(comment.id)}
                    disabled={togglingLike.has(comment.id)}
                    className={`flex items-center gap-1 text-xs transition-colors ${
                      comment.likedByMe ? "text-[var(--ratist-red)]" : "text-[var(--foreground-muted)] hover:text-[var(--ratist-red)]"
                    }`}
                  >
                    <Heart className={`w-3 h-3 ${comment.likedByMe ? "fill-current" : ""}`} />
                    {comment.likeCount > 0 && comment.likeCount}
                  </button>
                  <button
                    onClick={() => {
                      if (replyingTo === replyTo) { setReplyingTo(null); setReplyText(""); }
                      else {
                        setReplyingTo(replyTo);
                        const isSelf = user?.uid === comment.user.firebaseUid;
                        setReplyText(isSelf ? "" : `@[${comment.user.name}] `);
                      }
                    }}
                    className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
                  >
                    <Reply className="w-3 h-3" /> Reply
                  </button>
                  {canDeleteComment && (
                    confirmingDelete === comment.id ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <button onClick={() => { deleteComment(comment.id); setConfirmingDelete(null); }} className="text-red-400 hover:text-red-300 font-medium">Delete</button>
                        <button onClick={() => setConfirmingDelete(null)} className="text-[var(--foreground-muted)] hover:text-white">Cancel</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingDelete(comment.id)}
                        disabled={deleting.has(comment.id)}
                        className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors opacity-0 group-hover/comment:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )
                  )}
                </>
              )}
              {!user && comment.likeCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
                  <Heart className="w-3 h-3" /> {comment.likeCount}
                </span>
              )}
              {user && <ReportButton targetType="comment" targetId={comment.id} />}
            </div>

            {/* Reply input — Facebook-style: textarea full-width on top,
                action row (emoji + GIF + Post) below. Same UX as the
                main comment box; identical layout keeps the wiring
                obvious. */}
            {replyingTo === comment.id && (
              <div className="mt-2">
                {renderSelectedLinkedChip("reply")}
                {replyGifUrl && (
                  <div className="relative w-fit mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={replyGifUrl} alt="" className="rounded-lg border border-[var(--border)]/40 max-h-32" />
                    <button
                      type="button"
                      onClick={() => setReplyGifUrl(null)}
                      className="absolute -top-1.5 -right-1.5 bg-black/80 hover:bg-black text-white rounded-full p-0.5"
                      title="Remove GIF"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <textarea
                  ref={replyTextRef}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${comment.user.name}...`}
                  rows={1}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none max-h-[7.5rem] overflow-y-auto"
                  onInput={(e) => autoGrow(e.target as HTMLTextAreaElement)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitComment(comment.id); } }}
                  onFocus={(e) => { const len = e.target.value.length; e.target.setSelectionRange(len, len); }}
                  autoFocus
                />
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-1">
                    <EmojiButton onSelect={(emoji) => insertEmojiInto(replyTextRef, replyText, setReplyText, emoji)} />
                    <GifButton onSelect={(gifUrl) => setReplyGifUrl(gifUrl)} />
                    {renderPickerButton("reply")}
                  </div>
                  <button
                    onClick={() => submitComment(comment.id)}
                    disabled={(!replyText.trim() && !replyGifUrl && !replyLinked) || submitting}
                    className="px-3 py-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {submitting ? "..." : "Post"}
                  </button>
                </div>
                {renderPickerDropdown("reply")}
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies.length > 0 && (
          <>
            <button onClick={() => toggleExpand(comment.id)} className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)] hover:text-white ml-10 -mt-1 mb-1 transition-colors">
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {(() => { const total = countAllReplies(comment); return isExpanded ? "Hide replies" : `Show ${total} repl${total === 1 ? "y" : "ies"}`; })()}
            </button>
            {isExpanded && comment.replies.map((reply) => renderComment(reply, depth + 1, depth >= 1 ? (depth1ParentId ?? comment.id) : undefined))}
          </>
        )}
      </div>
    );
  }

  // Affordance gating — the "reply with your own list" button only makes
  // sense on collection target pages. Hiding it elsewhere prevents a
  // stray collection-link button from appearing on, say, a forum thread.
  const showLinkedAffordance = !!enableCollectionLink && targetType === "collection";

  function renderSelectedLinkedChip(slot: "new" | "reply") {
    const linked = slot === "new" ? newLinked : replyLinked;
    const setLinked = slot === "new" ? setNewLinked : setReplyLinked;
    if (!linked) return null;
    return (
      <div className="flex items-center gap-2 mb-1.5 px-2 py-1 bg-[var(--surface-2)] rounded-lg border border-[var(--border)] text-xs">
        <ListStart className="w-3 h-3 text-[var(--ratist-red)]" />
        <span className="text-white truncate flex-1">{linked.name}</span>
        <button type="button" onClick={() => setLinked(null)} className="text-[var(--foreground-muted)] hover:text-white" title="Remove linked collection">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  function renderPickerButton(slot: "new" | "reply") {
    if (!showLinkedAffordance) return null;
    const isOpen = pickerOpen === slot;
    return (
      <button
        type="button"
        title="Reply with your own list"
        onClick={() => {
          setPickerOpen(isOpen ? null : slot);
          if (!isOpen) ensurePickerOptions();
        }}
        className={`p-1.5 rounded transition-colors ${
          isOpen ? "bg-[var(--surface-2)] text-white" : "text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)]"
        }`}
      >
        <ListStart className="w-4 h-4" />
      </button>
    );
  }

  function renderPickerDropdown(slot: "new" | "reply") {
    if (!showLinkedAffordance || pickerOpen !== slot) return null;
    return (
      <div className="mt-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2 max-h-[280px] overflow-y-auto">
        <p className="text-[11px] text-[var(--foreground-muted)] px-1 pb-1.5">Pick one of your collections to attach</p>
        {pickerError && (
          <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1 mb-1.5">
            {pickerError}
          </div>
        )}
        {pickerLoading ? (
          <p className="text-xs text-[var(--foreground-muted)] py-3 text-center">Loading…</p>
        ) : !pickerOptions || pickerOptions.length === 0 ? (
          <p className="text-xs text-[var(--foreground-muted)] py-3 px-2">
            You haven&apos;t built any collections yet. <Link href="/tools/collections/new" className="text-[var(--ratist-red)] hover:underline">Create one</Link> first.
          </p>
        ) : (
          <div className="space-y-1">
            {pickerOptions.map((c) => {
              const isPublic = c.visibility === "public" && !!c.slug;
              return (
                <div key={c.id} className="flex items-center gap-2 hover:bg-[var(--surface)] rounded p-1.5 transition-colors">
                  <div className="flex gap-0.5 shrink-0">
                    {Array.from({ length: 4 }).map((_, i) => {
                      const p = c.previewPosters[i];
                      return (
                        <div key={i} className="relative w-4 aspect-[2/3] rounded-sm overflow-hidden bg-[var(--surface)]">
                          {p ? <Image src={posterUrl(p, "w92")} alt="" fill sizes="16px" className="object-cover" /> : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white truncate flex items-center gap-1.5">
                      {c.name}
                      {!isPublic && <span className="text-[9px] uppercase tracking-wider text-[var(--foreground-muted)] bg-[var(--surface)] border border-[var(--border)] rounded px-1">Private</span>}
                    </p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">{c.itemCount} title{c.itemCount === 1 ? "" : "s"}</p>
                  </div>
                  {isPublic ? (
                    <button
                      type="button"
                      onClick={() => selectLinkedFromPicker(slot, c)}
                      className="text-[10px] font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-2 py-0.5 transition-colors shrink-0"
                    >
                      Link
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => publishAndLinkFromPicker(slot, c)}
                      disabled={publishingFromPicker === c.id}
                      title="Publishing makes the collection public and links it to your comment"
                      className="text-[10px] font-semibold text-white bg-[var(--ratist-red)]/70 hover:bg-[var(--ratist-red)] rounded-full px-2 py-0.5 transition-colors shrink-0 disabled:opacity-50"
                    >
                      {publishingFromPicker === c.id ? "…" : "Publish & link"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (disabled && comments.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-white mb-2">
        Comments{comments.length > 0 ? ` (${countAll(comments)})` : ""}
      </h3>

      {loading ? (
        <p className="text-xs text-[var(--foreground-muted)] py-4">Loading comments...</p>
      ) : (
        <>
          {comments.length > 0 && (
            <div className="divide-y divide-[var(--border)]/10">
              {comments.map((c) => renderComment(c))}
            </div>
          )}

          {user && !disabled ? (
            <div className="mt-3">
              {renderSelectedLinkedChip("new")}
              {newGifUrl && (
                <div className="relative w-fit mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={newGifUrl} alt="" className="rounded-lg border border-[var(--border)]/40 max-h-32" />
                  <button
                    type="button"
                    onClick={() => setNewGifUrl(null)}
                    className="absolute -top-1.5 -right-1.5 bg-black/80 hover:bg-black text-white rounded-full p-0.5"
                    title="Remove GIF"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <textarea
                ref={newTextRef}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder={showLinkedAffordance ? "Add a comment, or reply with your own list…" : "Add a comment..."}
                rows={1}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none max-h-[7.5rem] overflow-y-auto"
                onInput={(e) => autoGrow(e.target as HTMLTextAreaElement)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitComment(); } }}
              />
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-1">
                  <EmojiButton onSelect={(emoji) => insertEmojiInto(newTextRef, newText, setNewText, emoji)} />
                  <GifButton onSelect={(gifUrl) => setNewGifUrl(gifUrl)} />
                  {renderPickerButton("new")}
                </div>
                <button
                  onClick={() => submitComment()}
                  disabled={(!newText.trim() && !newGifUrl && !newLinked) || submitting}
                  className="px-4 py-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? "..." : "Post"}
                </button>
              </div>
              {renderPickerDropdown("new")}
            </div>
          ) : !user ? (
            <p className="text-xs text-[var(--foreground-muted)] mt-2">
              <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to comment.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function countAll(comments: CommentData[]): number {
  return comments.reduce((sum, c) => sum + 1 + countAll(c.replies), 0);
}
