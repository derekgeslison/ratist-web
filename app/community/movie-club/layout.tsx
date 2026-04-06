import type { Metadata } from "next";
export const metadata: Metadata = { title: "Movie Club", description: "Watch a new movie each week with the community. Rate it, discuss it, compare opinions." };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
