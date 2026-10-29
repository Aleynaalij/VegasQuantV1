import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { publishableKey, supabaseUrl } from "@/lib/supabase";
import {
  cardDate,
  isCardDay,
  one,
  pct,
  type ThreesCard,
  type ThreesLine,
} from "@/lib/nba-threes-card";

// The daily "3-point volume" card attached to the Zone post: public box-score research, no picks.
export const runtime = "nodejs";

const GOLD = "#e8ca7d";
const PALE = "#f4dc99";
const INK = "#07090d";
const MUTED = "#8f99a3";
const font = (file: string) =>
  readFile(path.join(process.cwd(), "src/assets/fonts", file));

function Column({
  label,
  lines,
  by,
}: {
  label: string;
  lines: ThreesLine[];
  by: "tpa" | "tpm";
}) {
  const top = Math.max(...lines.map((l) => l[by]), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 436 }}>
      <div
        style={{
          display: "flex",
          fontFamily: "DM Sans",
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: 4,
          color: GOLD,
          paddingBottom: 14,
          borderBottom: `2px solid ${GOLD}55`,
        }}
      >
        {label}
      </div>
      {lines.map((l, i) => (
        <div
          key={l.player}
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "14px 0 12px",
            borderBottom: "1px solid #ffffff14",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                width: 34,
                fontFamily: "Barlow Condensed",
                fontSize: 28,
                color: i === 0 ? GOLD : MUTED,
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flexGrow: 1,
                width: 300,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "DM Sans",
                  fontWeight: 700,
                  fontSize: 24,
                  color: "#f2f4f5",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {l.player}
              </div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "DM Sans",
                  fontWeight: 500,
                  fontSize: 17,
                  color: MUTED,
                  marginTop: 2,
                }}
              >
                {l.team} ·{" "}
                {by === "tpa"
                  ? `${one(l.tpm)} made · ${pct(l)}`
                  : `${one(l.tpa)} att · ${pct(l)}`}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontSize: 46,
                color: i === 0 ? PALE : GOLD,
                lineHeight: 1,
              }}
            >
              {one(l[by])}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 10,
              marginLeft: 34,
              height: 5,
              borderRadius: 3,
              background: "#ffffff10",
            }}
          >
            <div
              style={{
                display: "flex",
                width: `${Math.round((100 * l[by]) / top)}%`,
                height: 5,
                borderRadius: 3,
                backgroundImage: `linear-gradient(90deg, #b48a36, ${PALE})`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params;
  if (!isCardDay(day)) return new Response("Unknown card", { status: 404 });
  const db = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false },
  });
  const r = await db.rpc("nba_threes_card", { p_day: day });
  const card = r.data as ThreesCard | null;
  if (r.error || !card?.games?.length || !card.attempted?.length)
    return new Response("No card for this day", { status: 404 });
  const [barlow, dm500, dm700] = await Promise.all([
    font("barlow-condensed-800-latin.ttf"),
    font("dm-sans-500.ttf"),
    font("dm-sans-700.ttf"),
  ]);
  const n = card.games.length;
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: INK,
          backgroundImage: `radial-gradient(circle at 50% -10%, #3a2d1288 0%, ${INK} 55%)`,
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
            padding: "40px 44px 32px",
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
              NBA RESEARCH
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              marginTop: 34,
              fontFamily: "Barlow Condensed",
              lineHeight: 0.9,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 128,
                backgroundImage: `linear-gradient(180deg, ${PALE}, #b48a36)`,
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              3-POINT
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 128,
                color: "#f2f4f5",
                marginLeft: 22,
              }}
            >
              VOLUME
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 16,
              fontFamily: "DM Sans",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: 3,
              color: "#d9dee2",
            }}
          >
            {cardDate(card.day)} · {n} GAME{n === 1 ? "" : "S"}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 8,
              fontFamily: "DM Sans",
              fontWeight: 500,
              fontSize: 19,
              color: MUTED,
            }}
          >
            {card.games
              .slice(0, 8)
              .map((g) => `${g.away} @ ${g.home}`)
              .join("   ·   ")}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 36,
            }}
          >
            <Column
              label="MOST ATTEMPTED / GAME"
              lines={card.attempted}
              by="tpa"
            />
            <Column label="MOST MADE / GAME" lines={card.made} by="tpm" />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginTop: "auto",
              fontFamily: "DM Sans",
              fontWeight: 500,
              fontSize: 16,
              color: MUTED,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex" }}>
                Season per-game averages · players on today’s teams · min. 3
                games
              </div>
              <div style={{ display: "flex", marginTop: 4 }}>
                Box scores: ESPN · Research only, not picks
              </div>
            </div>
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
    ),
    {
      width: 1080,
      height: 1350,
      fonts: [
        {
          name: "Barlow Condensed",
          data: barlow,
          weight: 800,
          style: "normal",
        },
        { name: "DM Sans", data: dm500, weight: 500, style: "normal" },
        { name: "DM Sans", data: dm700, weight: 700, style: "normal" },
      ],
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=86400",
      },
    },
  );
}
