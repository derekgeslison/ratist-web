import type { Metadata } from "next";
export const metadata: Metadata = { title: "Cine-Q", description: "Test your movie and TV knowledge with timed trivia. Clues drip in — guess fast for more points!" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
