"use client";

import { useAuth } from "@/context/AuthContext";

interface Props {
  ownerFirebaseUid: string;
  children: React.ReactNode;
}

/** Only renders children if the current user matches the ownerFirebaseUid */
export default function OwnerOnly({ ownerFirebaseUid, children }: Props) {
  const { user } = useAuth();
  if (!user || user.uid !== ownerFirebaseUid) return null;
  return <>{children}</>;
}
