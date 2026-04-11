/**
 * Build a sign-in URL that redirects back to the current page after login.
 * Use in client components: signinUrl(pathname)
 * Use in server components: signinUrl("/known/path")
 */
export function signinUrl(currentPath?: string): string {
  if (!currentPath || currentPath === "/" || currentPath === "/auth/signin") {
    return "/auth/signin";
  }
  return `/auth/signin?redirect=${encodeURIComponent(currentPath)}`;
}
