/** Vegas Quant: the Q Lens — a research lens crossed by a rising price line. */
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`vq-mark ${className}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="17" fill="#2458ed" />
      <circle
        cx="30"
        cy="29"
        r="17"
        fill="none"
        stroke="#fff"
        strokeWidth="6"
      />
      <path
        d="m37 39 13 13"
        fill="none"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="m17 34 10-10 7 6 14-15"
        fill="none"
        stroke="#a8f0b1"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
