import { ImageResponse } from "next/og";
import { getDesk } from "@/lib/data";
import { money, odd, winProfit } from "@/lib/domain";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const d = await getDesk(),
    p = d.picks.find((p) => p.id === id);
  if (!p) return new Response("Pick not found", { status: 404 });
  const g = d.games.find((g) => g.id === p.game_id),
    s = d.stages.find((s) => s.id === p.stage_id);
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#0b1016",
          color: "#eef2ee",
          padding: 70,
          fontFamily: "sans-serif",
          borderTop: "12px solid #71e8b5",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 5,
            color: "#71e8b5",
          }}
        >
          VEGAS QUANT
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            marginTop: 20,
            color: "#94a39d",
          }}
        >
          THE 5-SPOT CHALLENGE
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 90,
            fontSize: 24,
            color: "#71e8b5",
          }}
        >
          OFFICIAL {s ? `LEG #${s.stage_number}` : "PLAY"}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 30,
            color: "#c3cac6",
          }}
        >
          {g?.away_team} @ {g?.home_team}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 35,
            fontSize: p.selection.length > 38 ? 48 : 64,
            fontWeight: 700,
          }}
        >
          {p.selection}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 56,
            color: "#71e8b5",
            marginTop: 25,
          }}
        >
          {odd(p.odds)}
        </div>
        <div
          style={{
            display: "flex",
            gap: 50,
            marginTop: 65,
            paddingTop: 35,
            borderTop: "1px solid #29332e",
          }}
        >
          {[
            ["STAKE", money(p.stake_cents)],
            ["TO WIN", money(winProfit(p.stake_cents, p.odds))],
            ["EDGE", `${p.edge}%`],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <span style={{ fontSize: 20, color: "#98a49d" }}>{k}</span>
              <span style={{ fontSize: 40 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 45, fontSize: 25 }}>
          Confidence {p.confidence}/10 · Risk {p.risk}/10 · Grade {p.bet_grade}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 25,
            fontSize: 23,
            color: "#b5c1b9",
          }}
        >
          Playable: {p.playable_number}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 23,
            color: "#b5c1b9",
          }}
        >
          Pass: {p.pass_number}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: 19,
            color: "#88958d",
          }}
        >
          Vegas Quant Ultra · Entertainment challenge. No wager is guaranteed.
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1350,
      headers: {
        "Content-Disposition": `attachment; filename="vegas-quant-${id}.png"`,
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
