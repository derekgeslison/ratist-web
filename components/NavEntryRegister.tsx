"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pushNavEntry } from "@/lib/nav-history";

interface Props {
  /** User-facing label for this page — usually the dynamic title (movie
   *  title, show name, person name). The SmartBackLink that another
   *  page renders later reads this back as "Back to ..." text. */
  title: string;
}

/**
 * Client-side breadcrumb registrar. Drop this into any server page
 * that wants its dynamic title remembered for back-link context. Just
 * pass the title — the path comes from usePathname() at the time the
 * effect runs, so server-rendered pages get the right breadcrumb push
 * after hydration without needing to plumb pathname through props.
 */
export default function NavEntryRegister({ title }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!pathname || !title) return;
    const search = searchParams?.toString();
    const fullPath = search ? `${pathname}?${search}` : pathname;
    pushNavEntry({ path: pathname, fullPath, title });
  }, [pathname, searchParams, title]);
  return null;
}
