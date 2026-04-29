"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Check, Megaphone, Newspaper, Handshake, Shield, MessageCircle, HelpCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const CATEGORIES = [
  { value: "general", label: "General Inquiry", icon: MessageCircle, blurb: "Questions about The Ratist, account help, or anything else." },
  { value: "advertising", label: "Advertising / Sponsorship", icon: Megaphone, blurb: "Direct ad sales, sponsored content, or promotional partnerships." },
  { value: "press", label: "Press / Media", icon: Newspaper, blurb: "Interview requests, coverage, or quotes for an article." },
  { value: "partnerships", label: "Partnerships", icon: Handshake, blurb: "API access, integrations, affiliate programs, or co-marketing." },
  { value: "dmca", label: "DMCA / Legal", icon: Shield, blurb: "Copyright takedown notices, legal correspondence, or compliance questions." },
  { value: "other", label: "Something else", icon: HelpCircle, blurb: "" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

export default function ContactPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<CategoryValue | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Prefill name/email for signed-in users once auth resolves. We only
  // fill empty fields so we don't clobber what the user has already
  // typed (e.g., a press inquirer using a different email than their
  // Ratist account).
  useEffect(() => {
    if (!user) return;
    setName((current) => current || user.displayName || "");
    setEmail((current) => current || user.email || "");
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !name.trim() || !email.trim() || !message.trim()) return;
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim(),
      }),
    }).catch(() => null);

    if (res?.ok) {
      setSubmitted(true);
    } else {
      const data = await res?.json().catch(() => null);
      setError(data?.error ?? "Failed to send message. Please try again.");
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7 text-green-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Message Sent</h1>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">
          Thanks for reaching out. We&apos;ll review your message and get back to you at the email you provided. For most inquiries, expect a response within 1–3 business days.
        </p>
        <Link href="/" className="text-sm text-[var(--ratist-red)] hover:underline">Back to Home</Link>
      </div>
    );
  }

  const selectedCategory = CATEGORIES.find((c) => c.value === category);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      <div className="flex items-center gap-3 mb-3">
        <Mail className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Contact Us</h1>
      </div>
      <p className="text-sm text-[var(--foreground-muted)] mb-2">
        For advertising, press, partnership, or legal inquiries — or anything else that needs a direct response from the team.
      </p>
      <p className="text-xs text-[var(--foreground-muted)] mb-8">
        Looking for help with a bug, a feature idea, or your account?{" "}
        <Link href="/feedback" className="text-[var(--ratist-red)] hover:underline">Submit feedback instead</Link>
        {" "}— it goes straight to the product team.
      </p>

      {/* Category picker — visual cards instead of a dropdown so visitors
          can see at a glance what each option covers */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-2">What is this regarding?</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                  active
                    ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--ratist-red)]/50"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[var(--ratist-red)]" : "text-[var(--foreground-muted)]"}`} />
                <span className={`text-xs font-semibold ${active ? "text-white" : "text-[var(--foreground-muted)]"}`}>{c.label}</span>
              </button>
            );
          })}
        </div>
        {selectedCategory?.blurb && (
          <p className="text-xs text-[var(--foreground-muted)] mt-2 italic">{selectedCategory.blurb}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              placeholder="you@example.com"
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
          </div>
        </div>

        {(category === "advertising" || category === "press" || category === "partnerships") && (
          <div>
            <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">
              Company / publication <span className="text-xs opacity-60">(optional)</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={160}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">
            Subject <span className="text-xs opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="A short summary of your inquiry"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Your message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={7}
            maxLength={5000}
            placeholder={
              category === "dmca"
                ? "Include the URL of the alleged infringing content, the original copyrighted work, your contact info, and a good-faith statement that you're authorized to act on behalf of the rights holder."
                : "Tell us what you're looking for. Be specific — links, examples, and timing details all help us respond faster."
            }
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
          />
          <p className="text-xs text-[var(--foreground-muted)] mt-1 text-right">{message.length}/5000</p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !category || !name.trim() || !email.trim() || !message.trim()}
          className="w-full bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold py-2.5 rounded-full disabled:opacity-40 transition-colors"
        >
          {submitting ? "Sending..." : "Send Message"}
        </button>

        <p className="text-[11px] text-[var(--foreground-muted)] text-center pt-2">
          By submitting this form you agree to our{" "}
          <Link href="/privacy" className="underline hover:text-white">Privacy Policy</Link>. We&apos;ll only use your information to respond to this inquiry.
        </p>
      </form>
    </div>
  );
}
