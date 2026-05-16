import type { Metadata } from "next";
export const metadata: Metadata = { title: "Oscar Best Picture Predictor", alternates: { canonical: "/tools/oscar-predictor" } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
