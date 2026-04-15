interface Props {
  className?: string;
  size?: number;
}

export default function TwoThumbsIcon({ className, size }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 28"
      {...(size ? { width: size, height: size * 28 / 32 } : {})}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Thumbs down (behind, offset right and up) */}
      <g transform="translate(12, 0) scale(0.75)">
        <path d="M17 2v10" />
        <path d="M9 16.5l1-3.5H4.2a2 2 0 0 1-1.93-2.56l2.33-8A2 2 0 0 1 6.5 1H20a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 20a3.13 3.13 0 0 1-3-3.5Z" />
      </g>
      {/* Thumbs up (front) */}
      <g transform="translate(0, 6) scale(0.75)">
        <path d="M7 10v12" />
        <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
    </svg>
  );
}
