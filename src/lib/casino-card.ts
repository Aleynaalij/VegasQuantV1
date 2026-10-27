// The Vegas Quant card: one playing-card design for every pick, parlay and result, on the page and
// as a downloaded image. Each kind has its own "rank" and colors, like a deck:
//   Pick of the Day = Ace of spades (gold) · a leg = its stat target ("50+") · a parlay = the Joker
//   Hail Mary = the red Joker · a winning ticket = 21 · a miss = the muted club.
export type CardVariant = "pick" | "pod" | "parlay" | "hailmary" | "win" | "miss";
export type CardLeg = {
  name: string;
  market: string;
  note?: string;
  status?: "won" | "lost" | "push" | "open";
};
export type CasinoCardData = {
  /** Taller image for long tickets; standard cards keep their existing dimensions. */
  exportHeight?: number;
  variant: CardVariant;
  eyebrow: string;
  title: string;
  market?: string;
  matchup?: string;
  price?: string;
  legs?: CardLeg[];
  hero?: { label: string; value: string; note?: string };
  stamp?: string;
  footnote?: string;
  publishedAt: string;
};

export type CardTheme = {
  accent: string;
  accentSoft: string;
  gold: string;
  felt: [string, string];
  suit: string;
  suitColor: string;
};
const GOLD = "#e8c46a";
export const THEMES: Record<CardVariant, CardTheme> = {
  pick: { accent: "#6f9bff", accentSoft: "#6f9bff33", gold: GOLD, felt: ["#14234a", "#070d1c"], suit: "♠", suitColor: "#e4eaf4" },
  pod: { accent: GOLD, accentSoft: "#e8c46a33", gold: GOLD, felt: ["#1e2240", "#08091a"], suit: "♠", suitColor: GOLD },
  parlay: { accent: "#a78bfa", accentSoft: "#a78bfa33", gold: GOLD, felt: ["#2a1650", "#0c0620"], suit: "★", suitColor: GOLD },
  hailmary: { accent: "#ff5d6c", accentSoft: "#ff5d6c33", gold: GOLD, felt: ["#3d0f1d", "#12040a"], suit: "★", suitColor: "#ff5d6c" },
  win: { accent: "#1ed883", accentSoft: "#1ed88333", gold: GOLD, felt: ["#0b3a2a", "#03140e"], suit: "♥", suitColor: "#ff5d6c" },
  miss: { accent: "#8a94a8", accentSoft: "#8a94a833", gold: "#a7b0c2", felt: ["#1c2230", "#0a0d14"], suit: "♣", suitColor: "#a7b0c2" },
};
/** Suits cycle down a leg list like a dealt hand. */
export const LEG_SUITS = ["♠", "♥", "♦", "♣"];
const RED_SUITS = new Set(["♥", "♦"]);
export const suitColor = (suit: string) => (RED_SUITS.has(suit) ? "#ff6b78" : "#e4eaf4");

/** The card's corner rank: its stat target for a leg, a playing-card rank otherwise. */
export function cardRank(d: Pick<CasinoCardData, "variant" | "market">) {
  if (d.variant === "pod") return "A";
  if (d.variant === "parlay" || d.variant === "hailmary") return "JOKER";
  if (d.variant === "win") return "21";
  if (d.variant === "miss") return "✕";
  const m = /(?:^|\s)(\d+(?:\.\d+)?\+?)/.exec(d.market || "");
  return m ? m[1] : "VQ";
}

/** "Full game · 50+ receiving yards" -> "50+ receiving yards" for the face of the card. */
export const cleanMarket = (market: string) =>
  market.replace(/^(?:FULL GAME TOTAL|Full game)\s*[·:—-]\s*/i, "").replace(/\s+total\s+/i, " ");

export const odds = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) >= 100
    ? `${n > 0 ? "+" : "−"}${Math.abs(n)}`
    : null;

const stampTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET"
    : "";
};

// ---------- Image export (1080 × 1512, a 5:7 playing card) ----------
export const CARD_W = 1080;
export const CARD_H = 1512;

/** Word-wrap with a canvas measurer; long words break by character. */
export function wrapText(
  measure: (s: string) => number,
  text: string,
  width: number,
  maxLines = Infinity,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (measure(line) > width && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && measure(line.slice(0, cut)) > width) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && measure(last + "…") > width) last = last.slice(0, -1);
    kept[maxLines - 1] = last.trimEnd() + "…";
    return kept;
  }
  return lines;
}

/** Leg rows shrink to fit: 10 legs still fit one card. */
export function legLayout(count: number, room: number) {
  const row = Math.max(64, Math.min(116, Math.floor(room / Math.max(count, 1))));
  return { row, name: Math.round(row * 0.36), market: Math.round(row * 0.28) };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the card. `mark` is the Vegas Quant logo as a loaded image (optional). */
export function drawCasinoCard(
  ctx: CanvasRenderingContext2D,
  d: CasinoCardData,
  fonts: { display: string; body: string },
  mark?: CanvasImageSource | null,
) {
  const t = THEMES[d.variant];
  const W = CARD_W,
    H = d.exportHeight || CARD_H;
  const display = (px: number, weight = 800) => `${weight} ${px}px ${fonts.display}`;
  const body = (px: number, weight = 500) => `${weight} ${px}px ${fonts.body}`;

  // Table felt behind the card.
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, W, H);
  // Card body.
  const felt = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H / 2, H * 0.75);
  felt.addColorStop(0, t.felt[0]);
  felt.addColorStop(1, t.felt[1]);
  roundRect(ctx, 18, 18, W - 36, H - 36, 56);
  ctx.fillStyle = felt;
  ctx.fill();
  // Card-back lattice, clipped to the card.
  ctx.save();
  roundRect(ctx, 18, 18, W - 36, H - 36, 56);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 2;
  for (let x = -H; x < W + H; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
    ctx.stroke();
  }
  // The logo, large in the back of the card.
  if (mark) {
    ctx.globalAlpha = 0.09;
    const mw = 900,
      mh = 675;
    ctx.translate(W / 2, H / 2 + 40);
    ctx.rotate(-0.18);
    ctx.drawImage(mark, -mw / 2, -mh / 2, mw, mh);
  }
  ctx.restore();
  // Double frame: accent outer line, gold inner line.
  ctx.lineWidth = 6;
  ctx.strokeStyle = t.accent;
  roundRect(ctx, 18, 18, W - 36, H - 36, 56);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = t.gold + "99";
  roundRect(ctx, 46, 46, W - 92, H - 92, 36);
  ctx.stroke();

  // Corner indices (top-left upright, bottom-right rotated), like a real card.
  const rank = cardRank(d);
  const corner = () => {
    ctx.textAlign = "center";
    if (rank === "JOKER") {
      ctx.font = display(34, 900);
      ctx.fillStyle = t.suitColor;
      [..."JOKER"].forEach((ch, i) => ctx.fillText(ch, 0, i * 38));
      ctx.font = display(40, 900);
      ctx.fillText(t.suit, 0, 5 * 38 + 10);
    } else {
      ctx.font = display(rank.length > 2 ? 40 : 64, 900);
      ctx.fillStyle = t.suitColor;
      ctx.fillText(rank, 0, 0);
      ctx.font = display(54, 900);
      ctx.fillText(t.suit, 0, 62);
    }
  };
  ctx.save();
  ctx.translate(112, 132);
  corner();
  ctx.restore();
  ctx.save();
  ctx.translate(W - 112, H - 132);
  ctx.rotate(Math.PI);
  corner();
  ctx.restore();

  // Content column, clear of the corners.
  const left = 190,
    width = W - left * 2;
  ctx.textAlign = "left";
  let y = 170;
  ctx.font = body(28, 800);
  ctx.fillStyle = t.accent;
  for (const line of wrapText((s) => ctx.measureText(s).width, d.eyebrow.toUpperCase(), width, 2)) {
    ctx.fillText(line, left, y);
    y += 38;
  }
  y += 34;
  const titleSize = d.title.length > 34 || d.stamp ? 66 : 82;
  ctx.font = display(titleSize, 800);
  ctx.fillStyle = "#f6f8fd";
  // Leave room for the casino stamp in the top-right corner.
  for (const line of wrapText((s) => ctx.measureText(s).width, d.title, d.stamp ? width - 250 : width, 3)) {
    ctx.fillText(line, left, y + titleSize * 0.8);
    y += titleSize * 1.05;
  }
  if (d.market) {
    y += 18;
    ctx.font = display(48, 700);
    ctx.fillStyle = t.accent;
    for (const line of wrapText((s) => ctx.measureText(s).width, d.market, width, 2)) {
      ctx.fillText(line, left, y + 40);
      y += 58;
    }
  }
  if (d.matchup) {
    y += 10;
    ctx.font = body(32, 500);
    ctx.fillStyle = "#b8c3d8";
    for (const line of wrapText((s) => ctx.measureText(s).width, d.matchup, width, 2)) {
      ctx.fillText(line, left, y + 30);
      y += 42;
    }
  }
  if (d.hero) {
    y += 30;
    const heroH = d.hero.note ? 214 : 170;
    roundRect(ctx, left, y, width, heroH, 28);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = t.accent + "88";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = body(26, 700);
    ctx.fillStyle = "#b8c3d8";
    ctx.fillText(d.hero.label.toUpperCase(), left + 34, y + 48);
    ctx.font = display(76, 900);
    ctx.fillStyle = t.accent;
    ctx.fillText(d.hero.value, left + 34, y + 128);
    if (d.hero.note) {
      ctx.font = body(28, 600);
      ctx.fillStyle = "#dfe6f3";
      ctx.fillText(wrapText((s) => ctx.measureText(s).width, d.hero.note, width - 68, 1)[0], left + 34, y + 182);
    }
    y += heroH;
  }
  if (d.price) {
    y += 34;
    ctx.font = body(30, 800);
    const pw = Math.min(width, ctx.measureText(d.price).width + 64);
    roundRect(ctx, left, y, pw, 64, 32);
    ctx.fillStyle = t.accentSoft;
    ctx.fill();
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f6f8fd";
    ctx.fillText(wrapText((s) => ctx.measureText(s).width, d.price, width - 64, 1)[0], left + 32, y + 43);
    y += 64;
  }
  ctx.font = body(24, 500);
  const footLines = d.footnote ? wrapText((s) => ctx.measureText(s).width, d.footnote, width, 2) : [];
  if (d.legs?.length) {
    y += 40;
    const bottom = H - 220 - footLines.length * 32 - (footLines.length ? 20 : 0);
    const { row, name, market } = legLayout(d.legs.length, bottom - y);
    d.legs.forEach((leg, i) => {
      const top = y + i * row;
      if (top + row > bottom + 4) return;
      if (i) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left + width, top);
        ctx.stroke();
      }
      const suit = LEG_SUITS[i % 4];
      ctx.font = display(name + 4, 900);
      ctx.fillStyle = suitColor(suit);
      ctx.fillText(suit, left, top + row * 0.5);
      ctx.font = display(name, 800);
      ctx.fillStyle = "#f6f8fd";
      ctx.fillText(wrapText((s) => ctx.measureText(s).width, leg.name, width - 150, 1)[0], left + 56, top + row * 0.45);
      ctx.font = body(market, 500);
      ctx.fillStyle = "#b8c3d8";
      const sub = leg.note ? `${leg.market} · ${leg.note}` : leg.market;
      ctx.fillText(wrapText((s) => ctx.measureText(s).width, sub, width - 150, 1)[0], left + 56, top + row * 0.8);
      if (leg.status && leg.status !== "open") {
        const mark = leg.status === "won" ? "✓" : leg.status === "lost" ? "✕" : "–";
        ctx.beginPath();
        ctx.arc(left + width - 30, top + row * 0.52, Math.min(30, row * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = leg.status === "won" ? "#1ed883" : leg.status === "lost" ? "#ff5d6c" : "#8a94a8";
        ctx.fill();
        ctx.font = display(Math.min(34, row * 0.34), 900);
        ctx.fillStyle = "#06120d";
        ctx.textAlign = "center";
        ctx.fillText(mark, left + width - 30, top + row * 0.52 + Math.min(12, row * 0.12));
        ctx.textAlign = "left";
      }
    });
  }

  // Casino stamp.
  if (d.stamp) {
    ctx.save();
    ctx.translate(W - 250, 300);
    ctx.rotate(-0.22);
    ctx.font = display(54, 900);
    const sw = ctx.measureText(d.stamp).width + 70;
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 6;
    roundRect(ctx, -sw / 2, -52, sw, 104, 18);
    ctx.stroke();
    ctx.lineWidth = 2;
    roundRect(ctx, -sw / 2 + 10, -42, sw - 20, 84, 12);
    ctx.stroke();
    ctx.fillStyle = t.accent;
    ctx.textAlign = "center";
    ctx.fillText(d.stamp, 0, 20);
    ctx.restore();
    ctx.textAlign = "left";
  }

  // Footer: brand and publication time; footnote above it.
  if (footLines.length) {
    ctx.font = body(24, 500);
    ctx.fillStyle = "#8f9bb2";
    footLines.forEach((line, i) => ctx.fillText(line, left, H - 205 - (footLines.length - 1 - i) * 32));
  }
  ctx.font = display(30, 900);
  ctx.fillStyle = t.gold;
  ctx.textAlign = "center";
  ctx.fillText("VEGAS QUANT", W / 2, H - 132);
  ctx.font = body(24, 600);
  ctx.fillStyle = "#8f9bb2";
  const when = stampTime(d.publishedAt);
  ctx.fillText(`vegasquant.app${when ? `  ·  ${when}` : ""}`, W / 2, H - 96);
  ctx.textAlign = "left";
}
