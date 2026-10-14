/** Vegas Quant: the Diamond Q — a playing-card diamond (Vegas) cut into a Q, with a money-green tail (the edge). */
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`vq-mark ${className}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="15" fill="#101a33" />
      <path d="M32 8 53 32 32 56 11 32Z" fill="#2f6bff" />
      <path d="M32 8 53 32H11Z" fill="#5a8bff" />
      <path d="M32 18 44 32 32 46 20 32Z" fill="#101a33" />
      <path
        d="M35 35 50 50"
        stroke="#101a33"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M35 35 50 50"
        stroke="#1ed883"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
