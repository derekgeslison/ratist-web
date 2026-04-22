import type { Metadata } from "next";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";

interface Props {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const thread = await prisma.forumThread.findUnique({
      where: { slug },
      select: { title: true, threadType: true },
    });
    if (!thread) return { title: "Thread Not Found" };
    return {
      title: thread.title,
      description: `${thread.title} — ${thread.threadType === "debate" ? "a debate" : thread.threadType === "theory" ? "a fan theory" : "a discussion"} on The Ratist Forum.`,
      alternates: { canonical: `/forum/t/${slug}` },
    };
  } catch {
    return { title: "Forum Thread" };
  }
}

export default async function ForumThreadLayout({ children, params }: Props) {
  const { slug } = await params;

  // Fetch thread + first few posts server-side to emit DiscussionForumPosting
  // schema. The interactive page itself stays a client component — this
  // layout only contributes server-rendered structured data.
  let schema: Record<string, unknown> | null = null;
  let breadcrumb: Record<string, unknown> | null = null;
  try {
    const thread = await prisma.forumThread.findUnique({
      where: { slug },
      select: {
        title: true,
        createdAt: true,
        updatedAt: true,
        viewCount: true,
        author: { select: { name: true, firebaseUid: true } },
        media: { select: { posterPath: true }, take: 1 },
        posts: {
          select: {
            content: true,
            createdAt: true,
            author: { select: { name: true, firebaseUid: true } },
          },
          orderBy: { createdAt: "asc" },
          take: 10,
        },
      },
    });

    if (thread) {
      const opening = thread.posts[0];
      const replies = thread.posts.slice(1);
      // Prefer a linked movie/show poster as the thread image; fall back to
      // the Ratist logo so Google always has an image URL.
      const firstPoster = thread.media[0]?.posterPath;
      const image = firstPoster
        ? `https://image.tmdb.org/t/p/w500${firstPoster}`
        : "https://www.theratist.com/icon-512.png";
      schema = {
        "@context": "https://schema.org",
        "@type": "DiscussionForumPosting",
        headline: thread.title,
        url: `https://www.theratist.com/forum/t/${slug}`,
        datePublished: thread.createdAt.toISOString(),
        dateModified: thread.updatedAt.toISOString(),
        image,
        author: {
          "@type": "Person",
          name: thread.author.name,
          ...(thread.author.firebaseUid ? { url: `https://www.theratist.com/profile/${thread.author.firebaseUid}` } : {}),
        },
        interactionStatistic: [
          {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/ViewAction",
            userInteractionCount: thread.viewCount,
          },
          {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/CommentAction",
            userInteractionCount: replies.length,
          },
        ],
        ...(opening ? { articleBody: opening.content.slice(0, 1500) } : {}),
        ...(replies.length > 0
          ? {
              comment: replies.map((p) => ({
                "@type": "Comment",
                text: p.content.slice(0, 500),
                author: {
                  "@type": "Person",
                  name: p.author.name,
                  ...(p.author.firebaseUid ? { url: `https://www.theratist.com/profile/${p.author.firebaseUid}` } : {}),
                },
                datePublished: p.createdAt.toISOString(),
              })),
            }
          : {}),
      };

      breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.theratist.com" },
          { "@type": "ListItem", position: 2, name: "Forum", item: "https://www.theratist.com/forum" },
          { "@type": "ListItem", position: 3, name: thread.title, item: `https://www.theratist.com/forum/t/${slug}` },
        ],
      };
    }
  } catch { /* DB not ready */ }

  return (
    <>
      {schema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      )}
      {breadcrumb && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      )}
      {children}
    </>
  );
}
