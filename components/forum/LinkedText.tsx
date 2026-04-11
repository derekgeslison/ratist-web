"use client";

/**
 * Renders text with URLs auto-linked and @mentions highlighted.
 */
export default function LinkedText({ text }: { text: string }) {
  // Split on URLs and @mentions
  const parts = text.split(/(https?:\/\/[^\s<>"{}|\\^`[\]]+|@\[[^\]]+\])/gi);

  return (
    <>
      {parts.map((part, i) => {
        // URL
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-[var(--ratist-red)] hover:underline break-all"
            >
              {part}
            </a>
          );
        }
        // @mention
        if (part.match(/^@\[.+\]$/)) {
          return (
            <span key={i} className="text-[var(--ratist-red)] font-medium">
              @{part.slice(2, -1)}
            </span>
          );
        }
        return part;
      })}
    </>
  );
}
