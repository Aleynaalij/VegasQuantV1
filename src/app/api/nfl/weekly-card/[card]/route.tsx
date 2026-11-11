import { ResearchFrame as Frame } from "@/lib/vq-research-frame";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { publishableKey, supabaseUrl } from "@/lib/supabase";
import { positionCardPayload } from "@/lib/nfl-position-card";
import { cardDate } from "@/lib/nba-threes-card";
import {
  kickoffLabel,
  nickname,
  ordinal,
  tier,
  weeklyCardRef,
  type DvpCard,
  type WrCard,
} from "@/lib/nfl-weekly-cards";

// Sunday NFL research cards (WR matchups, defense vs position): public season stats, no picks.
export const runtime = "nodejs";

const GOLD = "#e8ca7d";
const PALE = "#f4dc99";
const INK = "#07090d";
const MUTED = "#8f99a3";
const TEXT = "#f2f4f5";
const TIER = { green: "#48d58a", yellow: "#f2c94c", red: "#ef6b6b" } as const;
const font = (file: string) =>
  readFile(path.join(process.cwd(), "src/assets/fonts", file));


function WrBody({ card }: { card: WrCard }) {
  const head = {
    display: "flex",
    fontFamily: "DM Sans",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: 2,
    color: GOLD,
  } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
      <div
        style={{
          display: "flex",
          paddingBottom: 8,
          borderBottom: `2px solid ${GOLD}55`,
        }}
      >
        <div style={{ ...head, width: 92 }}>TEAM</div>
        <div style={{ ...head, width: 404 }}>WIDE RECEIVER</div>
        <div style={{ ...head, width: 150, justifyContent: "center" }}>
          MATCHUP
        </div>
        <div style={{ ...head, flexGrow: 1, justifyContent: "flex-end" }}>
          VS DEFENSE
        </div>
      </div>
      {card.rows.map((r) => {
        const color = TIER[tier(r.score)];
        return (
          <div
            key={`${r.player}-${r.team}`}
            style={{
              display: "flex",
              alignItems: "center",
              height: 61,
              borderBottom: "1px solid #ffffff14",
            }}
          >
            <div style={{ display: "flex", width: 92 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  width: 70,
                  padding: "6px 0",
                  border: `1.5px solid ${GOLD}66`,
                  borderRadius: 10,
                  fontFamily: "Barlow Condensed",
                  fontSize: 24,
                  color: PALE,
                }}
              >
                {r.team}
              </div>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", width: 404 }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "DM Sans",
                  fontWeight: 700,
                  fontSize: 25,
                  color: TEXT,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 390,
                }}
              >
                {r.player}
              </div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "DM Sans",
                  fontWeight: 500,
                  fontSize: 15,
                  color: MUTED,
                }}
              >
                {r.targetsPerGame.toFixed(1)} targets/game ·{" "}
                {kickoffLabel(r.kickoff)}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 150,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 96,
                  padding: "2px 0 6px",
                  borderRadius: 8,
                  background: "#ffffff0d",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontFamily: "Barlow Condensed",
                    fontSize: 32,
                    color,
                    lineHeight: 1,
                  }}
                >
                  {r.score}
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 74,
                    height: 5,
                    borderRadius: 3,
                    background: "#ffffff1a",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: `${Math.max(6, r.score)}%`,
                      height: 5,
                      borderRadius: 3,
                      background: color,
                    }}
                  />
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                flexGrow: 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "Barlow Condensed",
                  fontSize: 26,
                  color: TEXT,
                }}
              >
                {nickname(r.opponent)}
              </div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "DM Sans",
                  fontWeight: 500,
                  fontSize: 14,
                  color: MUTED,
                }}
              >
                {ordinal(r.yardsRank)} WR YDS/G
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "BENGALS ALLOW 2ND MOST RUSH YARDS TO QB" → [prefix, highlight, rest] */
function split(text: string): [string, string, string] {
  const m =
    /^(.*? (?:ALLOW|RANK) )((?:\d+(?:ST|ND|RD|TH) )?MOST|#\d+)( .*)$/.exec(
      text,
    );
  return m ? [m[1], m[2], m[3]] : [text, "", ""];
}

function DvpBody({ card, single = false }: { card: DvpCard; single?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        marginTop: 20,
      }}
    >
      {card.games.map((g) => (
        <div
          key={`${g.awayAbbr}-${g.homeAbbr}`}
          style={{
            display: "flex",
            flexDirection: "column",
            width: single ? 942 : 462,
            height: single ? 890 : 456,
            marginBottom: 16,
            border: "1px solid #ffffff1f",
            borderRadius: 16,
            background: "#ffffff06",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "10px 12px 8px",
              borderBottom: `2px solid ${GOLD}55`,
              background: "#12382a66",
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "DM Sans",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 2,
                color: MUTED,
              }}
            >
              {kickoffLabel(g.kickoff)}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Barlow Condensed",
                fontSize: 34,
                color: PALE,
              }}
            >
              {nickname(g.awayAbbr)} @ {nickname(g.homeAbbr)}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "6px 14px",
            }}
          >
            {g.lines.length ? (
              g.lines.map((l) => {
                const [a, b, c] = split(l.text);
                return (
                  <div
                    key={l.text}
                    style={{
                      display: "flex",
                      height: single ? 70 : 35,
                      alignItems: "center",
                      borderBottom: "1px solid #ffffff10",
                      fontFamily: "Barlow Condensed",
                      fontSize: single ? 32 : 21,
                      letterSpacing: 0.5,
                      color: TEXT,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>{a}</span>
                    <span
                      style={{
                        color: l.kind === "allow" ? TIER.green : GOLD,
                        padding: "0 5px",
                      }}
                    >
                      {b}
                    </span>
                    <span>{c}</span>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  display: "flex",
                  padding: "16px 0",
                  fontFamily: "DM Sans",
                  fontWeight: 500,
                  fontSize: 18,
                  color: MUTED,
                }}
              >
                No top-8 defensive ranks either way.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ card: string }> },
) {
  const { card: id } = await params;
  const post = /^post-([0-9a-f-]{36})$/i.exec(decodeURIComponent(id));
  let ref = weeklyCardRef(decodeURIComponent(id));
  if (!ref && !post) return new Response("Unknown card", { status: 404 });
  const db = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false },
  });
  let r;
  try {
    r = post
      ? await db.rpc("nfl_position_card", { p_post: post[1] })
      : await db.rpc("nfl_weekly_card", { p_card: `nfl-${ref!.kind}:${ref!.day}:${ref!.page}` });
  } catch {
    return new Response("Card temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    });
  }
  if (r.error)
    return new Response("Card temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    });
  const data = post ? positionCardPayload(r.data) : r.data as WrCard | DvpCard | null;
  if (post && data) ref = {kind:"dvp",day:data.day,page:1};
  if (!ref) return new Response("No card", {status:404});
  const ok =
    ref.kind === "wr"
      ? Array.isArray((data as WrCard | null)?.rows) &&
        (data as WrCard).rows.length > 0
      : Array.isArray((data as DvpCard | null)?.games) &&
        (data as DvpCard).games.length > 0;
  if (!data || !ok)
    return new Response("No card", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const [barlow, dm500, dm700] = await Promise.all([
    font("barlow-condensed-800-latin.ttf"),
    font("dm-sans-500.ttf"),
    font("dm-sans-700.ttf"),
  ]);
  const meta = `${cardDate(ref.day)} · CARD ${data.page} OF ${data.pages} · SEASON THROUGH WEEK ${data.throughWeek}`;
  const element =
    ref.kind === "wr" ? (
      <Frame
        accent="WR"
        title="MATCHUPS"
        subtitle="BEST TO TOUGHEST · VS THE OPPOSING PASS DEFENSE"
        meta={meta}
        footer="Matchup 0–100: how much the opponent allows to WRs per game (yards 50%, TDs 30%, catches 20%). Green 60+, yellow 40–59, red under 40. Team defense, not a cornerback assignment. Research only, not picks. Stats: nflverse."
      >
        <WrBody card={data as WrCard} />
      </Frame>
    ) : (
      <Frame
        accent="DEFENSE"
        title="VS POSITION"
        subtitle={post ? "THURSDAY NIGHT · TOP-8 SEASON RANKS PER GAME" : "SUNDAY & MONDAY GAMES · TOP-8 SEASON RANKS PER GAME"}
        meta={meta}
        footer="“Allow 3rd most” = 3rd most per game allowed this season (1 = most). Research only, not picks. Stats: nflverse."
      >
        <DvpBody card={data as DvpCard} single={!!post} />
      </Frame>
    );
  return new ImageResponse(element, {
    width: 1080,
    height: 1350,
    fonts: [
      { name: "Barlow Condensed", data: barlow, weight: 800, style: "normal" },
      { name: "DM Sans", data: dm500, weight: 500, style: "normal" },
      { name: "DM Sans", data: dm700, weight: 700, style: "normal" },
    ],
    headers: { "Cache-Control": "public, max-age=600, s-maxage=86400" },
  });
}
