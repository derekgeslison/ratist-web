"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * A Link to /auth/signin that automatically includes ?redirect= to the current page.
 * Drop-in replacement for <Link href="/auth/signin">.
 */
export default function SignInLink({ children, className, onClick }: Props) {
  const pathname = usePathname();
  const href = pathname && pathname !== "/" && pathname !== "/auth/signin"
    ? `/auth/signin?redirect=${encodeURIComponent(pathname)}`
    : "/auth/signin";

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
