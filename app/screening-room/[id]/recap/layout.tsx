import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const session = await prisma.screeningSession.findUnique({
      where: { id },
      select: { movieTitle: true, posterPath: true, participants: { select: { userId: true } } },
    });
    if (!session) return { title: "Screening Room Recap" };

    const title = `Screening Room: ${session.movieTitle ?? "Movie Night"}`;
    const description = `${session.participants.length} friends watched ${session.movieTitle ?? "a movie"} together on The Ratist`;
    const ogUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.theratist.com"}/api/og/screening?id=${id}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [{ url: ogUrl, width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogUrl],
      },
    };
  } catch {
    return { title: "Screening Room Recap" };
  }
}

export default function RecapLayout({ children }: Props) {
  return <>{children}</>;
}
