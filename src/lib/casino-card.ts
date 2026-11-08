import { vqCardPalette } from "./vq-card-palette";

export type CardVariant = "pick" | "pod" | "parlay" | "hailmary" | "win" | "miss";
export type CardLeg = {
  name: string;
  market: string;
  note?: string;
  status?: "won" | "lost" | "push" | "open";
};
export type CasinoCardData = {
  paletteKey?: string;
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

const VARIANT_SUITS: Record<CardVariant, string> = {
  pick: "♠", pod: "♠", parlay: "★", hailmary: "★", win: "♥", miss: "♣",
};
export function casinoCardTheme(data: CasinoCardData) {
  const palette = vqCardPalette(data.paletteKey ?? `${data.variant}:${data.publishedAt}:${data.title}`);
  return { ...palette, suit: VARIANT_SUITS[data.variant] };
}

/** Suits cycle down a leg list like a dealt hand. */
export const LEG_SUITS = ["♠", "♥", "♦", "♣"];
export const suitColor = (suit: string) =>
  suit === "♥" || suit === "♦" ? "#e8c46a" : "#a7d2b8";
export const LEG_RESULT_COLORS = { won: "#8fdbb1", lost: "#e8c46a", push: "#c9c4b8" };

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
  const t = casinoCardTheme(d);
  const W = CARD_W, left = 190, width = W - left * 2;
  const display = (px: number, weight = 800) => `${weight} ${px}px ${fonts.display}`;
  const body = (px: number, weight = 500) => `${weight} ${px}px ${fonts.body}`;
  const wrap = (value: string, font: string, lineWidth = width) => {
    ctx.font = font;
    return wrapText((line) => ctx.measureText(line).width, value, lineWidth);
  };
  const titleSize = d.title.length > 34 || d.stamp ? 66 : 82;
  const eyebrowLines = wrap(d.eyebrow.toUpperCase(), body(28, 800));
  const titleLines = wrap(d.title, display(titleSize), d.stamp ? width - 250 : width);
  const marketLines = d.market ? wrap(d.market, display(48, 700)) : [];
  const matchupLines = d.matchup ? wrap(d.matchup, body(32)) : [];
  const heroNote = d.hero?.note ? wrap(d.hero.note, body(28, 600), width - 68) : [];
  const heroHeight = heroNote.length ? 182 + heroNote.length * 36 : 170;
  const priceLines = d.price ? wrap(d.price, body(30, 800), width - 64) : [];
  const priceHeight = priceLines.length ? 28 + priceLines.length * 36 : 0;
  const footLines = d.footnote ? wrap(d.footnote, body(30)) : [];
  const legs = (d.legs ?? []).map((leg) => {
    const name = wrap(leg.name, display(44), width - 124);
    const market = wrap([leg.market, leg.note].filter(Boolean).join(" · "), body(40), width - 124);
    return { leg, name, market, height: 30 + name.length * 51 + market.length * 48 };
  });
  const headerEnd =
    204 + eyebrowLines.length * 38 + titleLines.length * titleSize * 1.05 +
    (marketLines.length ? 18 + marketLines.length * 58 : 0) +
    (matchupLines.length ? 10 + matchupLines.length * 42 : 0) +
    (d.hero ? 30 + heroHeight : 0) +
    (priceLines.length ? 34 + priceHeight : 0);
  const H = Math.max(CARD_H, Math.ceil(
    headerEnd + (legs.length ? 40 : 0) +
    legs.reduce((sum, row) => sum + row.height, 0) +
    footLines.length * 38 + 250,
  ));
  ctx.canvas.height = H;

  // Table felt behind the card.
  ctx.fillStyle = "#0a0a09";
  ctx.fillRect(0, 0, W, H);
  // Card body.
  const felt = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H / 2, H * 0.75);
  felt.addColorStop(0, t.glow);
  felt.addColorStop(1, t.base);
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
      ctx.fillStyle = t.gold;
      [..."JOKER"].forEach((ch, i) => ctx.fillText(ch, 0, i * 38));
      ctx.font = display(40, 900);
      ctx.fillText(t.suit, 0, 5 * 38 + 10);
    } else {
      ctx.font = display(rank.length > 2 ? 40 : 64, 900);
      ctx.fillStyle = t.gold;
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
  ctx.textAlign = "left";
  let y = 170;
  ctx.font = body(28, 800);
  ctx.fillStyle = t.accent;
  for (const line of eyebrowLines) {
    ctx.fillText(line, left, y);
    y += 38;
  }
  y += 34;
  ctx.font = display(titleSize, 800);
  ctx.fillStyle = "#f6f3eb";
  // Leave room for the casino stamp in the top-right corner.
  for (const line of titleLines) {
    ctx.fillText(line, left, y + titleSize * 0.8);
    y += titleSize * 1.05;
  }
  if (d.market) {
    y += 18;
    ctx.font = display(48, 700);
    ctx.fillStyle = t.accent;
    for (const line of marketLines) {
      ctx.fillText(line, left, y + 40);
      y += 58;
    }
  }
  if (d.matchup) {
    y += 10;
    ctx.font = body(32, 500);
    ctx.fillStyle = "#cbc8bb";
    for (const line of matchupLines) {
      ctx.fillText(line, left, y + 30);
      y += 42;
    }
  }
  if (d.hero) {
    y += 30;
    roundRect(ctx, left, y, width, heroHeight, 28);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = t.accent + "88";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = body(26, 700);
    ctx.fillStyle = "#cbc8bb";
    ctx.fillText(d.hero.label.toUpperCase(), left + 34, y + 48, width - 68);
    ctx.font = display(76, 900);
    ctx.fillStyle = t.accent;
    ctx.fillText(d.hero.value, left + 34, y + 128, width - 68);
    if (d.hero.note) {
      ctx.font = body(28, 600);
      ctx.fillStyle = "#e6e2d7";
      heroNote.forEach((line, i) => ctx.fillText(line, left + 34, y + 182 + i * 36));
    }
    y += heroHeight;
  }
  if (priceLines.length) {
    y += 34;
    ctx.font = body(30, 800);
    const priceWidth = Math.max(...priceLines.map((line) => ctx.measureText(line).width)) + 64;
    roundRect(ctx, left, y, priceWidth, priceHeight, 32);
    ctx.fillStyle = t.accent + "33";
    ctx.fill();
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f6f3eb";
    priceLines.forEach((line, i) => ctx.fillText(line, left + 32, y + 38 + i * 36));
    y += priceHeight;
  }
  if (legs.length) y += 40;
  legs.forEach(({ leg, name, market, height }, i) => {
    if (i) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
    }
    const suit = LEG_SUITS[i % LEG_SUITS.length];
    ctx.font = display(44, 900);
    ctx.fillStyle = suitColor(suit);
    ctx.fillText(suit, left, y + 51);
    ctx.font = display(44);
    ctx.fillStyle = "#f6f3eb";
    name.forEach((line, n) => ctx.fillText(line, left + 56, y + 51 + n * 51));
    ctx.font = body(40);
    ctx.fillStyle = "#cbc8bb";
    market.forEach((line, n) => ctx.fillText(line, left + 56, y + 50 + name.length * 51 + n * 48));
    if (leg.status && leg.status !== "open") {
      const mark = leg.status === "won" ? "✓" : leg.status === "lost" ? "✕" : "–";
      ctx.beginPath();
      ctx.arc(left + width - 30, y + 38, 26, 0, Math.PI * 2);
      ctx.fillStyle = LEG_RESULT_COLORS[leg.status];
      ctx.fill();
      ctx.font = display(32, 900);
      ctx.fillStyle = "#06120d";
      ctx.textAlign = "center";
      ctx.fillText(mark, left + width - 30, y + 50);
      ctx.textAlign = "left";
    }
    y += height;
  });

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
    ctx.font = body(30, 500);
    ctx.fillStyle = "#bdb9ad";
    footLines.forEach((line, i) => ctx.fillText(line, left, H - 205 - (footLines.length - 1 - i) * 38));
  }
  ctx.font = display(30, 900);
  ctx.fillStyle = t.gold;
  ctx.textAlign = "center";
  ctx.fillText("VEGAS QUANT", W / 2, H - 132);
  ctx.font = body(24, 600);
  ctx.fillStyle = "#bdb9ad";
  const when = stampTime(d.publishedAt);
  ctx.fillText(`vegasquant.app${when ? `  ·  ${when}` : ""}`, W / 2, H - 96);
  ctx.textAlign = "left";
}
