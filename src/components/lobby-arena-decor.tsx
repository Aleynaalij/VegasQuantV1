import "@/app/lobby-arena-decor.css";

/**
 * Decoration for the lobby arena, kept apart from the lobby's own markup so it can be mounted (or
 * removed) with one line each. Everything here is aria-hidden, takes no pointer events and sits
 * behind live content: no text, links, data or state.
 *
 * - <LobbyArenaPennants />: the green-and-gold ace pennants hanging from the rafters either side of
 *   the headline, with warm rafter light behind them. Mount as the first child of the hero section.
 * - <LobbyArenaSkyline src=… />: blends a skyline image into the foot of the lobby. Renders nothing
 *   without a src, so the lobby never shows an empty frame.
 */
export function LobbyArenaPennants() {
  return (
    <div className="vq-arena-decor" aria-hidden="true">
      <span className="vq-arena-rafter vq-arena-rafter-left" />
      <span className="vq-arena-rafter vq-arena-rafter-right" />
      <Pennant side="left" />
      <Pennant side="right" />
    </div>
  );
}

function Pennant({ side }: { side: "left" | "right" }) {
  const id = `vq-pennant-${side}`;
  return (
    <svg className={`vq-pennant vq-pennant-${side}`} viewBox="0 0 120 260" focusable="false">
      <defs>
        {/* Fabric: deep green with soft vertical folds. */}
        <linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#06301f" />
          <stop offset=".18" stopColor="#0c4a31" />
          <stop offset=".34" stopColor="#083a26" />
          <stop offset=".52" stopColor="#0f5638" />
          <stop offset=".7" stopColor="#09412a" />
          <stop offset=".86" stopColor="#0d4d33" />
          <stop offset="1" stopColor="#052618" />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".45" />
          <stop offset=".2" stopColor="#000" stopOpacity="0" />
          <stop offset=".8" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".35" />
        </linearGradient>
        {/* Metallic gold for rod, piping and the ace. */}
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset=".35" stopColor="#e6bf62" />
          <stop offset=".6" stopColor="#a87a2c" />
          <stop offset="1" stopColor="#f3d488" />
        </linearGradient>
        <linearGradient id={`${id}-gold-h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a6424" />
          <stop offset=".5" stopColor="#ffeab0" />
          <stop offset="1" stopColor="#8a6424" />
        </linearGradient>
        <radialGradient id={`${id}-spade`} cx=".4" cy=".35" r=".8">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".45" stopColor="#efcd78" />
          <stop offset="1" stopColor="#9c7029" />
        </radialGradient>
      </defs>
      {/* hanging cords to the rafters */}
      <path d="M22 0 30 22M98 0 90 22" stroke="#c9a85a" strokeWidth="1.6" opacity=".8" />
      {/* rod with end caps */}
      <rect x="10" y="20" width="100" height="7" rx="3.5" fill={`url(#${id}-gold-h)`} />
      <circle cx="10" cy="23.5" r="5" fill={`url(#${id}-gold)`} />
      <circle cx="110" cy="23.5" r="5" fill={`url(#${id}-gold)`} />
      {/* banner body: shoulders, straight sides, swallow-point base */}
      <path d="M18 27h84v176l-42 42-42-42Z" fill={`url(#${id}-cloth)`} />
      <path d="M18 27h84v176l-42 42-42-42Z" fill={`url(#${id}-shade)`} />
      {/* gold piping: outer band and inner hairline */}
      <path d="M18 27h84v176l-42 42-42-42Z" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="4" strokeLinejoin="round" />
      <path d="M27 36h66v162l-33 33-33-33Z" fill="none" stroke="#d8b766" strokeWidth="1.2" opacity=".75" />
      {/* the ace of spades */}
      <g transform="translate(60 118)">
        <path
          d="M0-40C-9-27-30-15-30 2c0 11 8 19 18 19 5 0 9-2 12-5l-4 20h8l-4-20c3 3 7 5 12 5 10 0 18-8 18-19C30-15 9-27 0-40Z"
          fill={`url(#${id}-spade)`}
          stroke="#6e4e1a"
          strokeWidth="1.2"
        />
        <path d="M-4-30C-10-22-20-14-21-4" fill="none" stroke="#fff8e0" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      </g>
      {/* tassel at the point */}
      <path d="M60 245v6" stroke="#c9a85a" strokeWidth="1.6" />
      <path d="M55 251h10l2 9h-14Z" fill={`url(#${id}-gold)`} />
    </svg>
  );
}

export function LobbyArenaSkyline({ src, ratio = 3.2 }: { src?: string; ratio?: number }) {
  if (!src) return null;
  return (
    <div
      className="vq-arena-skyline"
      aria-hidden="true"
      style={{ backgroundImage: `url("${src}")`, aspectRatio: String(ratio) }}
    />
  );
}
