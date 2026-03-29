import type { Metadata } from "next";
export const metadata: Metadata = { title: "Oscar Picks" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
