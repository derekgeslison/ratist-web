import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const REMOVE_VALUES = new Set(["none", "all", "default"]);
const FILTER_VALUES = new Set(["all", "unwatched"]);
const POSITION_VALUES = new Set(["top", "bottom"]);

interface SettingsShape {
  autoAddToDefaultWatchlist: boolean;
  autoSeenOnWatchlistCheck: boolean;
  autoRemoveFromWatchlistOnSeen: "none" | "all" | "default";
  defaultWatchlistFilter: "all" | "unwatched";
  watchlistAddPosition: "top" | "bottom";
  pinCheckedToBottom: boolean;
  watchlistStreamingNotifs: boolean;
}

function defaults(): SettingsShape {
  return {
    autoAddToDefaultWatchlist: true,
    autoSeenOnWatchlistCheck: false,
    autoRemoveFromWatchlistOnSeen: "none",
    defaultWatchlistFilter: "all",
    watchlistAddPosition: "top",
    pinCheckedToBottom: false,
    watchlistStreamingNotifs: false,
  };
}

// GET /api/me/watchlist-settings — current settings (defaults for
// signed-out users so the client can render the panel without
// branching). Used by both the settings UI and any code that needs
// to consult a setting at action time (e.g., useWatchlistFlow when
// deciding whether to auto-add to default).
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json(defaults());
  return NextResponse.json({
    autoAddToDefaultWatchlist: user.autoAddToDefaultWatchlist,
    autoSeenOnWatchlistCheck: user.autoSeenOnWatchlistCheck,
    autoRemoveFromWatchlistOnSeen: user.autoRemoveFromWatchlistOnSeen as SettingsShape["autoRemoveFromWatchlistOnSeen"],
    defaultWatchlistFilter: user.defaultWatchlistFilter as SettingsShape["defaultWatchlistFilter"],
    watchlistAddPosition: user.watchlistAddPosition as SettingsShape["watchlistAddPosition"],
    pinCheckedToBottom: user.pinCheckedToBottom,
    watchlistStreamingNotifs: user.watchlistStreamingNotifs,
  });
}

// PATCH /api/me/watchlist-settings — partial update. Each field is
// optional in the body; absent fields are left unchanged. Validates
// enum-typed strings to keep garbage out.
export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.autoAddToDefaultWatchlist === "boolean") data.autoAddToDefaultWatchlist = body.autoAddToDefaultWatchlist;
  if (typeof body.autoSeenOnWatchlistCheck === "boolean") data.autoSeenOnWatchlistCheck = body.autoSeenOnWatchlistCheck;
  if (typeof body.autoRemoveFromWatchlistOnSeen === "string" && REMOVE_VALUES.has(body.autoRemoveFromWatchlistOnSeen)) {
    data.autoRemoveFromWatchlistOnSeen = body.autoRemoveFromWatchlistOnSeen;
  }
  if (typeof body.defaultWatchlistFilter === "string" && FILTER_VALUES.has(body.defaultWatchlistFilter)) {
    data.defaultWatchlistFilter = body.defaultWatchlistFilter;
  }
  if (typeof body.watchlistAddPosition === "string" && POSITION_VALUES.has(body.watchlistAddPosition)) {
    data.watchlistAddPosition = body.watchlistAddPosition;
  }
  if (typeof body.pinCheckedToBottom === "boolean") data.pinCheckedToBottom = body.pinCheckedToBottom;
  if (typeof body.watchlistStreamingNotifs === "boolean") data.watchlistStreamingNotifs = body.watchlistStreamingNotifs;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      autoAddToDefaultWatchlist: true,
      autoSeenOnWatchlistCheck: true,
      autoRemoveFromWatchlistOnSeen: true,
      defaultWatchlistFilter: true,
      watchlistAddPosition: true,
      pinCheckedToBottom: true,
      watchlistStreamingNotifs: true,
    },
  });

  return NextResponse.json(updated);
}
