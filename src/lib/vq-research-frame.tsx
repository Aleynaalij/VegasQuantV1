import type { ReactNode } from "react";
const TEXT = "#f2f4f5";
const GOLD = "#e8ca7d",
  PALE = "#f4dc99",
  INK = "#07090d",
  MUTED = "#8f99a3";
function Mark() {
  return (
    <svg width={64} height={48} viewBox="0 0 480 360">
      <path
        fill="#F3DC9A"
        d="M260 35C182 32 130 98 130 174C130 257 182 312 258 312C337 312 388 253 388 173C388 96 337 37 260 35ZM258 46C311 46 348 100 348 174C348 247 314 301 259 301C205 301 169 248 169 174C169 101 204 46 258 46Z"
      />
      <path
        fill="#B48A36"
        d="M208 237C255 223 286 251 321 282C350 307 391 339 444 310C414 349 365 342 326 325C282 305 257 258 208 237Z"
      />
      <path
        fill="#F3DC9A"
        d="M23 8H118V12C96 14 97 29 105 48L172 223L243 44C251 23 246 15 225 12V8H305V12C281 15 270 29 260 51L159 304L57 50C47 25 43 15 23 12Z"
      />
      <path
        fill="#B48A36"
        d="M107 19C95 24 102 42 108 58L173 220L158 257L90 69C82 45 82 25 107 19Z"
      />
    </svg>
  );
}

export function ResearchFrame({
  title,
  accent,
  subtitle,
  meta,
  footer,
  children,
  badge = "NFL RESEARCH",
}: {
  title: string;
  accent: string;
  subtitle: string;
  meta: string;
  footer: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: INK,
        backgroundImage: `radial-gradient(circle at 50% -10%, #12382a99 0%, ${INK} 55%)`,
        padding: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          border: `2px solid ${GOLD}66`,
          borderRadius: 28,
          padding: "34px 40px 26px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <Mark />
            <div
              style={{
                display: "flex",
                marginLeft: 14,
                fontFamily: "DM Sans",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: 6,
                color: PALE,
              }}
            >
              VEGAS QUANT
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "DM Sans",
              fontWeight: 700,
              fontSize: 17,
              letterSpacing: 3,
              color: GOLD,
              border: `1.5px solid ${GOLD}88`,
              borderRadius: 999,
              padding: "8px 18px",
            }}
          >
            {badge}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            marginTop: 22,
            fontFamily: "Barlow Condensed",
            lineHeight: 0.9,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 104,
              backgroundImage: `linear-gradient(180deg, ${PALE}, #b48a36)`,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {accent}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 104,
              color: TEXT,
              marginLeft: 20,
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 12,
            fontFamily: "DM Sans",
            fontWeight: 700,
            fontSize: 21,
            letterSpacing: 3,
            color: "#d9dee2",
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 6,
            fontFamily: "DM Sans",
            fontWeight: 500,
            fontSize: 18,
            color: MUTED,
          }}
        >
          {meta}
        </div>
        {children}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "auto",
            fontFamily: "DM Sans",
            fontWeight: 500,
            fontSize: 15,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex", maxWidth: 760 }}>{footer}</div>
          <div
            style={{
              display: "flex",
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: 2,
              color: GOLD,
            }}
          >
            VEGASQUANT.APP
          </div>
        </div>
      </div>
    </div>
  );
}
