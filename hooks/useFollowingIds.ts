import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

// Set of `firebaseUid` strings the viewer follows (accepted only).
// Empty set when signed out. Used by community pages for the
// "Following" filter so the sort/filter pipeline can stay client-side.
export function useFollowingIds(): Set<string> {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setIds(new Set());
      return;
    }
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch("/api/users/me/connections", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const next = new Set<string>(
            (data.following ?? []).map((f: { firebaseUid: string }) => f.firebaseUid)
          );
          setIds(next);
        })
        .catch(() => {})
    );
    return () => { cancelled = true; };
  }, [user]);

  return ids;
}
