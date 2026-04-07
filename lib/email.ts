import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.EMAIL_FROM ?? "The Ratist <noreply@theratist.com>";

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

// ─── Email templates ─────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.theratist.com";

function wrap(content: string): string {
  return `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e0e0e0;background:#0a0a0a;padding:32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${SITE_URL}" style="color:#e63946;text-decoration:none;font-weight:800;font-size:18px;letter-spacing:1px;">THE RATIST</a>
      </div>
      ${content}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #222;text-align:center;font-size:12px;color:#666;">
        <a href="${SITE_URL}" style="color:#666;text-decoration:none;">The Ratist</a> — Rate it. Rank it. Debate it.
      </div>
    </div>
  `;
}

export async function sendSubscriptionConfirmed(email: string, name: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Welcome to the Backstage Pass!",
    html: wrap(`
      <h2 style="color:white;margin:0 0 8px;">Welcome to the Backstage Pass, ${name}!</h2>
      <p>Your premium subscription is now active. Here's what you've unlocked:</p>
      <ul style="padding-left:20px;">
        <li>Host Screening Room sessions</li>
        <li>Movie Club access</li>
        <li>My Analytics & Collections</li>
        <li>Live Review feature</li>
        <li>Custom profile themes</li>
        <li>Ad-free experience</li>
      </ul>
      <p><a href="${SITE_URL}/backstage-pass" style="color:#e63946;">View your subscription →</a></p>
    `),
  });
}

export async function sendSubscriptionCanceled(email: string, name: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Your Backstage Pass has been canceled",
    html: wrap(`
      <h2 style="color:white;margin:0 0 8px;">We're sorry to see you go, ${name}</h2>
      <p>Your Backstage Pass subscription has been canceled. You'll retain access until the end of your current billing period.</p>
      <p>You can resubscribe anytime to regain access to all premium features.</p>
      <p><a href="${SITE_URL}/backstage-pass" style="color:#e63946;">Resubscribe →</a></p>
    `),
  });
}

export async function sendPromoGranted(email: string, name: string, months: number): Promise<void> {
  await sendEmail({
    to: email,
    subject: `You've earned ${months} months of the Backstage Pass — free!`,
    html: wrap(`
      <h2 style="color:white;margin:0 0 8px;">Congratulations, ${name}! 🎉</h2>
      <p>As one of our dedicated reviewers, you've earned <strong>${months} months of the Backstage Pass</strong> — completely free.</p>
      <p>Your premium features are now active, including:</p>
      <ul style="padding-left:20px;">
        <li>Movie Club, Screening Room hosting, My Analytics</li>
        <li>Live Review, Collections, Critics Mode</li>
        <li>Custom profile themes & ad-free experience</li>
      </ul>
      <p>Thank you for being a valued member of The Ratist community.</p>
      <p><a href="${SITE_URL}/backstage-pass" style="color:#e63946;">Explore your premium features →</a></p>
    `),
  });
}

export async function sendPromoExpiringSoon(email: string, name: string, daysLeft: number): Promise<void> {
  await sendEmail({
    to: email,
    subject: `Your free Backstage Pass expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
    html: wrap(`
      <h2 style="color:white;margin:0 0 8px;">Heads up, ${name}!</h2>
      <p>Your complimentary Backstage Pass expires in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.</p>
      <p>To keep enjoying Movie Club, Screening Room hosting, My Analytics, ad-free experience, and all other premium features, subscribe now — starting at just $3.99/month.</p>
      <p><a href="${SITE_URL}/backstage-pass" style="color:#e63946;font-weight:bold;">Subscribe to keep your Backstage Pass →</a></p>
    `),
  });
}

export async function sendAdminMessage(email: string, name: string, message: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Message from The Ratist team",
    html: wrap(`
      <h2 style="color:white;margin:0 0 8px;">Hi ${name},</h2>
      <p>${message}</p>
      <p>— The Ratist Team</p>
    `),
  });
}
