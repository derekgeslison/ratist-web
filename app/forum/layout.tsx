import type { Metadata } from "next";
export const metadata: Metadata = { title: "Forum", description: "Discussions, fan theories, polls, debates, and recommendations about movies and TV shows. Join the conversation with fellow cinephiles on The Ratist Forum.", alternates: { canonical: "/forum" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
