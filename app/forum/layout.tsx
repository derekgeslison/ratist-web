import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Forum", description: "Discussions, fan theories, polls, debates, and recommendations about movies and TV shows. Join the conversation with fellow cinephiles on The Ratist Forum.", alternates: { canonical: "/forum" } };

// The /forum index is a client component (live filters/search), so
// any server-rendered JSON-LD has to live in a server-rendered
// wrapper. This layout fetches the latest 30 threads and exposes
// them as an ItemList so the Rich Results Test sees something
// crawlable on /forum. The nested thread layout still emits its own
// DiscussionForumPosting on /forum/t/[slug] — both can coexist.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const threads = await prisma.forumThread.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 30,
    select: { slug: true, title: true },
  }).catch(() => [] as { slug: string; title: string }[]);

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Recent forum threads",
    itemListElement: threads.map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `https://www.theratist.com/forum/t/${t.slug}`,
      name: t.title,
    })),
  };

  return (
    <>
      {itemListSchema.itemListElement.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      )}
      {children}
    </>
  );
}
