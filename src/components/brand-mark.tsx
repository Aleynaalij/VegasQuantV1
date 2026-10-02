/** Vector artwork based on the approved Vegas Quant brand mark. */
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`vq-mark ${className}`} viewBox="0 0 900 570" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M0 0h165l232 435-61 105Z" />
      <path d="m300 180 120-180h300l167 233-114 199-69-118 62-81-70-116H486L369 318Z" />
      <path d="M454 275h137l223 281H665Z" />
    </svg>
  );
}
