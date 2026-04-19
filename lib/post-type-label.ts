// Maps a discussion's threadType value (from movie/show/celebrity Discussions tab)
// to a human-readable post type label. Anything not a blog/news type is a forum thread.
const POST_TYPE_LABELS: Record<string, string> = {
  "two-thumbs": "Two Thumbs",
  "movie-map": "Movie Map",
  "blog": "Blog",
  "news": "News",
};

export function getPostTypeLabel(threadType: string): string {
  return POST_TYPE_LABELS[threadType] ?? "Forum";
}
