/**
 * Year-in-Review unlock gate.
 *
 * Each calendar year's YiR is locked until December 1 of that year.
 * Prior years are always unlocked. Admins bypass the lock so they
 * can test and refine throughout the year.
 *
 * Live-not-frozen by design: once unlocked, the page re-queries every
 * load — so a user viewing on Dec 31 sees December's watches too.
 */

const UNLOCK_MONTH = 11; // Dec is month 11 (0-indexed)
const UNLOCK_DAY = 1;

export function unlockDate(year: number): Date {
  return new Date(year, UNLOCK_MONTH, UNLOCK_DAY, 0, 0, 0);
}

export function isYearInReviewUnlocked(year: number, isAdmin: boolean, now: Date = new Date()): boolean {
  if (isAdmin) return true;
  if (year < now.getFullYear()) return true;
  if (year > now.getFullYear()) return false;
  return now >= unlockDate(year);
}

/**
 * Short human-readable unlock date for the /seen teaser link, e.g.
 * "Dec 1" or "Dec 1, 2026" when crossing year boundaries is plausible.
 * Year is included only when it could be ambiguous (e.g., viewed in
 * January of the same locked year wouldn't make sense, but defensive).
 */
export function unlockTeaser(year: number, now: Date = new Date()): string {
  const isSameYear = year === now.getFullYear();
  return isSameYear ? "Dec 1" : `Dec 1, ${year}`;
}
