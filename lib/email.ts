import { Resend } from "resend";
import { unsubscribeUrl } from "@/lib/unsubscribe";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.EMAIL_FROM ?? "The Ratist <noreply@theratist.com>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.theratist.com";
const LOGO_URL = `${SITE_URL}/logo-full.png`;

// ─── Email preference categories ────────────────────────────────────────────
// promotional: marketing offers, new feature announcements
// subscription: expiry reminders, payment issues, promo grants
// activity: admin messages
// Policy/legal and ban emails are ALWAYS sent regardless of preferences.

export type EmailCategory = "promotional" | "subscription" | "activity";

export interface EmailPrefs {
  promotional: boolean;
  subscription: boolean;
  activity: boolean;
}

const DEFAULT_EMAIL_PREFS: EmailPrefs = { promotional: true, subscription: true, activity: true };

export function parseEmailPrefs(raw: unknown): EmailPrefs {
  if (raw && typeof raw === "object") return { ...DEFAULT_EMAIL_PREFS, ...(raw as Partial<EmailPrefs>) };
  return DEFAULT_EMAIL_PREFS;
}

/** Check if a user wants emails for a given category. Respects legacy emailOptOut. */
export function shouldSendEmail(emailPrefs: unknown, emailOptOut: boolean, category: EmailCategory): boolean {
  if (emailOptOut) return false; // legacy blanket opt-out
  const prefs = parseEmailPrefs(emailPrefs);
  return prefs[category];
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  if (!resend) {
    console.warn("Email not configured (RESEND_API_KEY missing). Skipping:", subject);
    return false;
  }
  try {
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

// ─── Branded email wrapper ──────────────────────────────────────────────────

function wrap(content: string, preheader?: string, userId?: string): string {
  const unsubLink = userId ? unsubscribeUrl(userId) : null;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>The Ratist</title>
  <!--[if mso]><style>body{font-family:Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#000;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:24px 0 20px;">
              <a href="${SITE_URL}" style="text-decoration:none;">
                <img src="${LOGO_URL}" alt="The Ratist" width="160" style="display:block;max-width:160px;height:auto;" />
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#111;border-radius:12px;border:1px solid #222;padding:32px 28px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:#555;">
                <a href="${SITE_URL}" style="color:#555;text-decoration:none;">The Ratist</a> &mdash; Rate it. Rank it. Debate it.
              </p>
              <p style="margin:0;font-size:11px;color:#444;">
                ${unsubLink ? `<a href="${unsubLink}" style="color:#444;text-decoration:underline;">Unsubscribe from emails</a> &middot; ` : ""}
                <a href="${SITE_URL}/profile" style="color:#444;text-decoration:underline;">Manage preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Shared styles as inline strings
const h2 = 'style="margin:0 0 12px;font-size:22px;font-weight:700;color:#fff;line-height:1.3;"';
const p = 'style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#ccc;"';
const accent = "#CC0033";
const btnStyle = `display:inline-block;padding:12px 28px;background:${accent};color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;`;
const listStyle = 'style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.8;color:#ccc;"';
const divider = '<hr style="border:none;border-top:1px solid #222;margin:20px 0;" />';

function btn(text: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td><a href="${href}" style="${btnStyle}">${text}</a></td></tr></table>`;
}

function featureList(): string {
  return `<ul ${listStyle}>
    <li>Host Screening Room sessions</li>
    <li>Movie Club access</li>
    <li>My Analytics &amp; Collections</li>
    <li>Live Review feature</li>
    <li>Custom profile themes</li>
    <li>Ad-free experience</li>
  </ul>`;
}

// ─── Email templates ────────────────────────────────────────────────────────

export async function sendSubscriptionConfirmed(email: string, name: string, userId?: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Welcome to the Backstage Pass!",
    html: wrap(`
      <h2 ${h2}>Welcome to the Backstage Pass, ${name}!</h2>
      <p ${p}>Your premium subscription is now active. Here's what you've unlocked:</p>
      ${featureList()}
      ${btn("Explore Your Premium Features", `${SITE_URL}/backstage-pass`)}
    `, "Your premium subscription is now active.", userId),
  });
}

export async function sendSubscriptionCanceled(email: string, name: string, userId?: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Your Backstage Pass has been canceled",
    html: wrap(`
      <h2 ${h2}>We're sorry to see you go, ${name}</h2>
      <p ${p}>Your Backstage Pass subscription has been canceled. You'll retain access until the end of your current billing period.</p>
      <p ${p}>You can resubscribe anytime to regain access to all premium features.</p>
      ${btn("Resubscribe", `${SITE_URL}/backstage-pass`)}
    `, "Your subscription has been canceled.", userId),
  });
}

export async function sendPromoGranted(email: string, name: string, months: number, userId?: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: `You've earned ${months} months of the Backstage Pass — free!`,
    html: wrap(`
      <h2 ${h2}>Congratulations, ${name}!</h2>
      <p ${p}>As one of our dedicated reviewers, you've earned <strong style="color:#fff;">${months} months of the Backstage Pass</strong> — completely free.</p>
      <p ${p}>Your premium features are now active:</p>
      ${featureList()}
      <p ${p}>Thank you for being a valued member of The Ratist community.</p>
      ${btn("Explore Your Premium Features", `${SITE_URL}/backstage-pass`)}
    `, `You've earned ${months} free months of premium!`, userId),
  });
}

export async function sendPromoExpiringSoon(email: string, name: string, daysLeft: number, userId?: string): Promise<void> {
  const urgency = daysLeft <= 3
    ? `Your free Backstage Pass expires in just <strong style="color:${accent};">${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.`
    : `Your complimentary Backstage Pass expires in <strong style="color:#fff;">${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.`;

  await sendEmail({
    to: email,
    subject: `Your free Backstage Pass expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
    html: wrap(`
      <h2 ${h2}>Heads up, ${name}!</h2>
      <p ${p}>${urgency}</p>
      <p ${p}>To keep enjoying Movie Club, Screening Room hosting, My Analytics, custom themes, ad-free experience, and all other premium features, subscribe now — starting at just <strong style="color:#fff;">$3.99/month</strong>.</p>
      ${btn("Subscribe to Keep Your Backstage Pass", `${SITE_URL}/backstage-pass`)}
      ${divider}
      <p style="margin:0;font-size:13px;color:#666;">If you don't subscribe, your account will revert to our free tier. You won't lose any of your reviews, ratings, or data.</p>
    `, `Your free Backstage Pass expires in ${daysLeft} days.`, userId),
  });
}

export async function sendAdminGranted(email: string, name: string, expiryDate: Date | null, userId?: string): Promise<void> {
  const expiryText = expiryDate
    ? `Your access is active until <strong style="color:#fff;">${expiryDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>.`
    : "Your access has no expiration date.";

  await sendEmail({
    to: email,
    subject: "You've been granted the Backstage Pass!",
    html: wrap(`
      <h2 ${h2}>Great news, ${name}!</h2>
      <p ${p}>A Ratist admin has granted you the <strong style="color:#fff;">Backstage Pass</strong>. ${expiryText}</p>
      <p ${p}>You now have access to all premium features:</p>
      ${featureList()}
      ${btn("Explore Your Premium Features", `${SITE_URL}/backstage-pass`)}
    `, "You've been granted the Backstage Pass!", userId),
  });
}

export async function sendAdminMessage(email: string, name: string, message: string, userId?: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Message from The Ratist team",
    html: wrap(`
      <h2 ${h2}>Hi ${name},</h2>
      <p ${p}>${message}</p>
      <p style="margin:16px 0 0;font-size:14px;color:#888;">&mdash; The Ratist Team</p>
    `, "You have a message from The Ratist team.", userId),
  });
}

export async function sendBanNotification(
  email: string,
  name: string,
  userId: string,
  reason: string | null,
  bannedUntil: Date | null,
): Promise<void> {
  const durationText = bannedUntil
    ? `Your account is suspended until <strong style="color:#fff;">${bannedUntil.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>.`
    : "Your account has been <strong style=\"color:#fff;\">permanently suspended</strong>.";

  const reasonText = reason
    ? `<div style="background:#1a1a1a;border-left:3px solid ${accent};padding:12px 16px;margin:0 0 16px;border-radius:0 6px 6px 0;">
        <p style="margin:0;font-size:13px;color:#888;">Reason:</p>
        <p style="margin:4px 0 0;font-size:14px;line-height:1.6;color:#ccc;">${reason}</p>
      </div>`
    : "";

  await sendEmail({
    to: email,
    subject: "Your Ratist account has been suspended",
    html: wrap(`
      <h2 ${h2}>Account Suspended</h2>
      <p ${p}>Hi ${name}, your account on The Ratist has been suspended for violating our <a href="${SITE_URL}/terms" style="color:${accent};">Terms of Service</a>.</p>
      ${reasonText}
      <p ${p}>${durationText}</p>
      ${bannedUntil ? `<p ${p}>After your suspension ends, you'll be able to log in and use the site normally. Your data will be preserved.</p>` : `<p ${p}>If you believe this was a mistake, you can reach out via our <a href="${SITE_URL}/feedback" style="color:${accent};">feedback form</a>.</p>`}
    `, "Your Ratist account has been suspended.", userId),
  });
}

export async function sendUnbanNotification(email: string, name: string, userId: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Your Ratist account has been restored",
    html: wrap(`
      <h2 ${h2}>Welcome back, ${name}!</h2>
      <p ${p}>Your account suspension has been lifted. You can now log in and use The Ratist normally.</p>
      <p ${p}>Please review our <a href="${SITE_URL}/terms" style="color:${accent};">Terms of Service</a> to ensure future compliance.</p>
      ${btn("Go to The Ratist", SITE_URL)}
    `, "Your Ratist account has been restored.", userId),
  });
}

/**
 * Tiny markdown-ish renderer for the policy-update summary. Admins
 * paste plain text with simple markdown (## / ###, **bold**, - bullets,
 * [text](url), blank-line paragraphs) and we convert to HTML so
 * formatting survives the email render. NOT a general-purpose markdown
 * library — this only covers what the policy summaries actually use.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(s: string): string {
  // Apply on already-escaped text. Order matters: links before bold so
  // a bracketed phrase containing ** doesn't get partially formatted.
  let out = s;
  // [text](url) — link. URL is already HTML-escaped by the outer pass;
  // we whitelist scheme to http/https/relative-path to avoid
  // javascript: injection. Relative paths get expanded to SITE_URL —
  // email clients can't resolve "/foo" against a base, so the link
  // would otherwise dead-end at "http:///foo" in their browser.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    let safeUrl: string;
    if (/^https?:\/\//.test(url)) safeUrl = url;
    else if (url.startsWith("/")) safeUrl = `${SITE_URL}${url}`;
    else safeUrl = "#";
    return `<a href="${safeUrl}" style="color:#cc0033;text-decoration:underline;">${text}</a>`;
  });
  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#fff;">$1</strong>');
  return out;
}

function summaryToHtml(raw: string): string {
  const escaped = escapeHtml(raw.trim());
  const lines = escaped.split(/\r?\n/);
  const blocks: string[] = [];
  let bullets: string[] = [];
  let paraLines: string[] = [];

  function flushBullets() {
    if (bullets.length === 0) return;
    blocks.push(
      `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6;color:#ccc;">${
        bullets.map((b) => `<li style="margin:0 0 6px;">${renderInline(b)}</li>`).join("")
      }</ul>`,
    );
    bullets = [];
  }
  function flushPara() {
    if (paraLines.length === 0) return;
    blocks.push(
      `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#ccc;">${
        renderInline(paraLines.join("<br />"))
      }</p>`,
    );
    paraLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushBullets();
      flushPara();
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (h3) {
      flushBullets();
      flushPara();
      blocks.push(`<h3 style="margin:18px 0 8px;font-size:16px;color:#fff;">${renderInline(h3[1])}</h3>`);
    } else if (h2) {
      flushBullets();
      flushPara();
      blocks.push(`<h2 style="margin:20px 0 10px;font-size:18px;color:#fff;">${renderInline(h2[1])}</h2>`);
    } else if (bullet) {
      flushPara();
      bullets.push(bullet[1]);
    } else {
      flushBullets();
      paraLines.push(line);
    }
  }
  flushBullets();
  flushPara();
  return blocks.join("");
}

export async function sendPolicyUpdate(
  email: string,
  name: string,
  userId: string,
  policyType: "privacy" | "terms" | "both",
  summary: string,
): Promise<boolean> {
  const policyName = policyType === "both" ? "Privacy Policy and Terms of Service"
    : policyType === "privacy" ? "Privacy Policy" : "Terms of Service";
  const links = policyType === "both"
    ? `${btn("View Privacy Policy", `${SITE_URL}/privacy`)}${btn("View Terms of Service", `${SITE_URL}/terms`)}`
    : btn(`View ${policyName}`, `${SITE_URL}/${policyType === "privacy" ? "privacy" : "terms"}`);

  const summaryHtml = summaryToHtml(summary);

  return sendEmail({
    to: email,
    subject: `We've updated our ${policyName}`,
    html: wrap(`
      <h2 ${h2}>Hi ${name},</h2>
      <p ${p}>We've made changes to our <strong style="color:#fff;">${policyName}</strong>. Here's a summary of what changed:</p>
      <div style="background:#1a1a1a;border-left:3px solid ${accent};padding:14px 18px;margin:0 0 16px;border-radius:0 6px 6px 0;">
        ${summaryHtml}
      </div>
      <p ${p}>These changes take effect immediately. By continuing to use The Ratist, you agree to the updated terms.</p>
      ${links}
      ${divider}
      <p style="margin:0;font-size:13px;color:#666;">This is a required legal notification and is sent to all users regardless of email preferences.</p>
    `, `We've updated our ${policyName}.`, userId),
  });
}
