import type { Metadata } from "next";

export const metadata: Metadata = { title: "Submit Feedback" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
