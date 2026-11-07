import { MARK_PATHS } from "@/components/brand-mark";
import { nbaNickname } from "./nba-home";
import {
  sheetPlayerKey,
  teamMean,
  type Outcome,
  type Sheet,
  type Team,
} from "./nba-matchup-sheet-server";

const width = 1200,
  bg = "#08120f",
  panel = "#102019",
  inset = "#0b1813",
  stripe = "#152b21",
  edge = "#294438",
  pale = "#eaf6ef",
  muted = "#a7beb1",
  mint = "#72efab",
  gold = "#f4ce83";
const tones = [mint, gold];
const encode = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const fit = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;
const one = (n: number | null | undefined) =>
  typeof n === "number" ? n.toFixed(1) : "—";
const signed = (n: number | undefined) =>
  typeof n === "number" ? (n > 0 ? "+" : "") + n.toFixed(1) : "—";
const price = (n: number | undefined) =>
  typeof n === "number" ? (n > 0 ? "+" : "") + n : "—";
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const time = (s?: string) =>
  s
    ? new Date(s).toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }) + " ET"
    : "Unavailable";
const abbr = (s: string) =>
  ({ NY: "NYK", GS: "GSW", SA: "SAS", NO: "NOP", WSH: "WAS" })[s] ?? s;
const avg = (numbers: number[]) =>
  numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
const points = (t: Team) => avg(t.finals.map((g) => g.points));
const allowed = (t: Team) => avg(t.finals.map((g) => g.against));
const marketName = (o: Outcome, s: string) => o.name === s;

export function nbaMatchupSheetSvg(sheet: Sheet) {
  const { game, teams, quotes, availability, cutoff } = sheet;
  const availabilityLines = (
    availability?.text ?? "No linked official game report in the Dealer post."
  )
    .split(/\s+/)
    .reduce<string[]>((lines, word) => {
      const i = lines.length - 1;
      if (i < 0 || lines[i].length + word.length >= 122) lines.push(word);
      else lines[i] += " " + word;
      return lines;
    }, []);
  const height = 1290 + Math.max(0, availabilityLines.length - 1) * 17;
  const draw: string[] = [];
  function rect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    r = 0,
    stroke?: string,
  ) {
    draw.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${color}"${stroke ? ` stroke="${stroke}"` : ""}/>`,
    );
  }
  function line(x: number, y: number, x2: number, y2: number, color = edge) {
    draw.push(
      `<path d="M${x} ${y}L${x2} ${y2}" stroke="${color}" fill="none"/>`,
    );
  }
  function text(
    s: string | number,
    x: number,
    y: number,
    size = 13,
    color = pale,
    weight = 500,
    anchor = "start",
  ) {
    draw.push(
      `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${encode(String(s))}</text>`,
    );
  }
  function dot(x: number, y: number, r: number, color: string) {
    draw.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="${bg}"/>`,
    );
  }
  function heading(
    x: number,
    y: number,
    w: number,
    h: number,
    n: string,
    title: string,
    sub: string,
  ) {
    rect(x, y, w, h, panel, 12, edge);
    rect(x + 13, y + 14, 28, 23, stripe, 5);
    text(n, x + 27, y + 30, 10, mint, 800, "middle");
    text(title, x + 49, y + 31, 19, pale, 800);
    text(sub, x + 15, y + 52, 11, muted);
  }
  function playerLine(
    name: string,
    market: "player_points" | "player_rebounds",
  ) {
    const found = quotes[market]?.outcomes.filter(
      (o) =>
        o.description && sheetPlayerKey(o.description) === sheetPlayerKey(name),
    );
    const over = found?.find((o) => o.name === "Over"),
      under = found?.find((o) => o.name === "Under");
    return over && under && over.point === under.point ? { over, under } : null;
  }
  rect(0, 0, width, height, bg);
  rect(0, 0, width, 6, mint);
  draw.push(
    `<g transform="translate(38 24) scale(.082)">${MARK_PATHS.map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join("")}</g>`,
  );
  text("VEGAS QUANT", 86, 47, 20, gold, 800);
  line(251, 29, 251, 53);
  text("NBA MATCHUP CHEAT SHEET", 269, 47, 16, pale, 800);
  rect(993, 27, 168, 24, "#342c1e", 5);
  text("RESEARCH ONLY", 1077, 44, 11, gold, 800, "middle");
  line(38, 66, 1162, 66);
  rect(38, 83, 1124, 132, panel, 13, edge);
  teams.forEach((t, i) => {
    const x = i === 0 ? 52 : 1040,
      label = i === 0 ? 176 : 1024,
      anchor = i === 0 ? "start" : "end";
    rect(x, 97, 108, 103, inset, 10, edge);
    if (t.logo && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(t.logo))
      draw.push(
        `<image x="${x + 10}" y="105" width="88" height="88" href="${t.logo}"/>`,
      );
    else text(abbr(t.code), x + 54, 156, 26, tones[i], 800, "middle");
    const nick = nbaNickname(t.name),
      city = t.name.slice(0, -nick.length).trim();
    const wins = t.finals.filter((g) => g.won).length;
    text(
      (i === 0 ? "AWAY" : "HOME") + "  /  " + abbr(t.code),
      label,
      116,
      11,
      tones[i],
      800,
      anchor,
    );
    text(fit(city, 19), label, 148, 27, pale, 800, anchor);
    text(nick, label, 175, 22, pale, 700, anchor);
    text(
      t.finals.length
        ? `${wins}-${t.finals.length - wins}  |  Last ${t.finals.length} finals`
        : "No prior finals in sample",
      label,
      195,
      11,
      muted,
      600,
      anchor,
    );
  });
  line(426, 101, 426, 197);
  line(774, 101, 774, 197);
  text(date(game.tipoff).toUpperCase(), 600, 117, 13, muted, 700, "middle");
  text(time(game.tipoff), 600, 153, 32, pale, 800, "middle");
  text(
    fit(game.venue ?? "Venue unavailable", 45),
    600,
    179,
    13,
    muted,
    600,
    "middle",
  );

  rect(38, 228, 1124, 76, inset, 10, edge);
  text("FANDUEL", 55, 256, 17, mint, 800);
  text("Full game  /  Stored quotes", 55, 281, 11, muted);
  const marketLabels = ["SPREAD", "TOTAL", "MONEYLINE"];
  (["spreads", "totals", "h2h"] as const).forEach((m, i) => {
    const x = 266 + i * 297,
      q = quotes[m];
    line(x, 241, x, 291);
    const os =
      m === "totals"
        ? ["Over", "Under"].map((n) =>
            q?.outcomes.find((o) => marketName(o, n)),
          )
        : teams.map((t) => q?.outcomes.find((o) => marketName(o, t.name)));
    text(marketLabels[i], x + 14, 250, 10, muted, 800);
    const quoteText = os
      .map((o, n) =>
        o
          ? `${m === "totals" ? o.name : abbr(teams[n].code)} ${m === "spreads" ? signed(o.point) : m === "totals" ? one(o.point) : price(o.price)}`
          : null,
      )
      .filter(Boolean)
      .join("  /  ");
    text(quoteText || "No verified quote", x + 14, 273, 16, pale, 800);
    text(
      q
        ? `${m === "h2h" ? "" : os.map((o) => price(o?.price)).join(" / ") + "  ·  "}${time(q.time)}`
        : "—",
      x + 14,
      292,
      10,
      muted,
      600,
    );
  });

  heading(
    38,
    320,
    350,
    337,
    "01",
    "Team profile",
    "Recorded regular-season form",
  );
  text("PER GAME", 54, 391, 10, muted, 800);
  teams.forEach((t, i) =>
    text(abbr(t.code), 293 + i * 77, 391, 11, tones[i], 800, "end"),
  );
  const profile = [
    ["Points for", points],
    ["Points allowed", allowed],
    [
      "Scoring margin",
      (t: Team) => avg(t.finals.map((g) => g.points - g.against)),
    ],
    ["Player rebounds", (t: Team) => teamMean(t, "rebounds")],
    ["Assists", (t: Team) => teamMean(t, "assists")],
    ["3-pointers made", (t: Team) => teamMean(t, "threes")],
    ["3-point attempts", (t: Team) => teamMean(t, "attempts")],
    ["Steals", (t: Team) => teamMean(t, "steals")],
    ["Blocks", (t: Team) => teamMean(t, "blocks")],
    ["Player turnovers", (t: Team) => teamMean(t, "turnovers")],
  ] as const;
  profile.forEach(([name, metric], i) => {
    const y = 400 + i * 18;
    if (i % 2 === 0) rect(49, y, 328, 17, stripe, 3);
    text(name, 55, y + 12, 12);
    teams.forEach((t, j) =>
      text(one(metric(t)), 293 + j * 77, y + 12, 12, tones[j], 700, "end"),
    );
  });
  text("RECENT FINALS  /  MOST RECENT FIRST", 54, 604, 10, muted, 800);
  teams.forEach((t, i) => {
    text(abbr(t.code), 54, 625 + i * 16, 11, tones[i], 800);
    t.finals.forEach((g, j) =>
      text(
        (g.won ? "W " : "L ") + abbr(g.opponent),
        98 + j * 55,
        625 + i * 16,
        10,
        pale,
        600,
      ),
    );
  });

  heading(
    402,
    320,
    382,
    337,
    "02",
    "Scoring matchup",
    "Each dot represents one completed game",
  );
  const scores = teams.flatMap((t) =>
    t.finals.flatMap((g) => [g.points, g.against]),
  );
  const lo = Math.floor(Math.min(90, ...scores) / 10) * 10,
    hi = Math.ceil(Math.max(140, ...scores) / 10) * 10;
  const px = (n: number) => 451 + ((n - lo) / (hi - lo)) * 303,
    py = (n: number) => 529 - ((n - lo) / (hi - lo)) * 125;
  for (let n = lo; n <= hi; n += 10) {
    line(px(n), 404, px(n), 529);
    line(451, py(n), 754, py(n));
    text(n, px(n), 544, 9, muted, 600, "middle");
    text(n, 443, py(n) + 3, 9, muted, 600, "end");
  }
  line(451, 529, 754, 404, "#49685a");
  text("POINTS SCORED", 451, 397, 9, muted, 800);
  text("POINTS ALLOWED", 603, 561, 9, muted, 800, "middle");
  teams.forEach((t, i) => {
    t.finals.forEach((g) => dot(px(g.against), py(g.points), 5, tones[i]));
    dot(425 + i * 75, 579, 4.5, tones[i]);
    text(abbr(t.code), 436 + i * 75, 583, 10, muted, 700);
  });
  line(418, 592, 768, 592);
  profile
    .filter(([key]) =>
      ["Points for", "Player rebounds", "3-point attempts"].includes(key),
    )
    .forEach(([key, metric], i) => {
      const y = 605 + i * 15;
      text(key, 418, y + 8, 9, muted, 700);
      const vals = teams.map(metric),
        max = Math.max(1, ...vals.map((v) => v ?? 0)) * 1.1;
      vals.forEach((v, j) => {
        rect(519, y + j * 5, 160, 4, stripe, 2);
        if (v !== null) rect(519, y + j * 5, (160 * v) / max, 4, tones[j], 2);
        text(one(v), 724 + j * 39, y + 8, 9.5, tones[j], 800, "end");
      });
    });

  heading(
    798,
    320,
    364,
    337,
    "03",
    "Player line context",
    "FanDuel points  /  " + time(quotes.player_points?.time),
  );
  const pointRows = teams.flatMap((t, i) =>
    t.players
      .filter((p) => playerLine(p.name, "player_points"))
      .slice(0, 4)
      .map((p) => ({ p, color: tones[i] })),
  );
  for (const [k, x] of [
    ["PLAYER", 814],
    ["LINE", 994],
    ["AVG", 1040],
    ["OVER / UNDER", 1148],
  ] as const)
    text(k, x, 390, 9.5, muted, 800, k === "PLAYER" ? "start" : "end");
  if (!pointRows.length)
    text("No matching two-sided points quotes.", 814, 414, 11, muted);
  pointRows.forEach(({ p, color }, i) => {
    const y = 398 + i * 15,
      q = playerLine(p.name, "player_points")!;
    if (i % 2 === 0) rect(809, y, 342, 14, stripe, 3);
    text(fit(p.name, 27), 814, y + 10.5, 10.8, pale, 600);
    text(one(q.over.point), 994, y + 10.5, 10.5, pale, 800, "end");
    text(one(p.stats.points), 1040, y + 10.5, 10.5, color, 800, "end");
    text(
      `${price(q.over.price)} / ${price(q.under.price)}`,
      1148,
      y + 10.5,
      10.2,
      muted,
      600,
      "end",
    );
  });
  line(812, 527, 1148, 527);
  text("3-POINT VOLUME", 814, 548, 15, pale, 800);
  text(
    "Attempts per game  /  At least 3 appearances",
    814,
    567,
    10,
    muted,
    600,
  );
  teams.forEach((t, i) => {
    const x = 814 + i * 171;
    text(abbr(t.code), x, 586, 11, tones[i], 800);
    const leaders = t.players
      .filter((p) => p.games >= 3 && p.stats.attempts !== null)
      .sort((a, b) => (b.stats.attempts ?? 0) - (a.stats.attempts ?? 0))
      .slice(0, 3);
    if (!leaders.length) text("No complete sample", x, 606, 10, muted);
    leaders.forEach((p, j) => {
      text(fit(p.name, 23), x, 605 + j * 16, 10.5, pale, 600);
      text(
        one(p.stats.attempts),
        x + 153,
        605 + j * 16,
        10.5,
        tones[i],
        800,
        "end",
      );
    });
  });

  const headers = [
    "POS",
    "GP",
    "MIN",
    "PTS",
    "REB",
    "AST",
    "3PM",
    "3PA",
    "STL",
    "BLK",
    "TO",
    "FD PTS",
    "FD REB",
  ];
  const cols = [
    242, 284, 331, 385, 438, 491, 546, 601, 653, 700, 750, 811, 873,
  ];
  teams.forEach((t, i) => {
    const y = 672 + i * 234;
    rect(38, y, 1124, 222, panel, 11, edge);
    rect(39, y + 1, 1122, 30, stripe, 9);
    text(abbr(t.code), 53, y + 21, 13, tones[i], 800);
    text(t.name + " player form", 105, y + 22, 16, pale, 800);
    text(
      `LAST ${t.finals.length} TEAM FINALS  /  TOP 10 BY AVERAGE MINUTES`,
      1148,
      y + 21,
      10,
      muted,
      800,
      "end",
    );
    text("PLAYER", 54, y + 47, 10, muted, 800);
    headers.forEach((h, j) =>
      text(
        h,
        cols[j],
        y + 47,
        10,
        j === 7 || j > 10 ? mint : muted,
        800,
        "middle",
      ),
    );
    text("LAST POINTS  /  NEWEST FIRST", 1147, y + 47, 10, muted, 800, "end");
    line(51, y + 54, 1148, y + 54);
    if (!t.players.length)
      text(
        "No confirmed player box scores for this sample.",
        54,
        y + 78,
        13,
        muted,
      );
    t.players.forEach((p, j) => {
      const top = y + 57 + j * 15.2;
      if (j % 2 === 0) rect(50, top, 1100, 14, stripe, 3);
      text(fit(p.name, 28), 54, top + 10.6, 11.5, pale, 600);
      if ((p.stats.attempts ?? 0) >= 3)
        rect(579, top + 1, 44, 12, "#29513e", 3);
      const values = [
        p.position,
        p.games,
        one(p.stats.minutes),
        one(p.stats.points),
        one(p.stats.rebounds),
        one(p.stats.assists),
        one(p.stats.threes),
        one(p.stats.attempts),
        one(p.stats.steals),
        one(p.stats.blocks),
        one(p.stats.turnovers),
        one(playerLine(p.name, "player_points")?.over.point),
        one(playerLine(p.name, "player_rebounds")?.over.point),
      ];
      values.forEach((v, k) =>
        text(
          v,
          cols[k],
          top + 10.6,
          10.8,
          k === 3 || k === 7 ? tones[i] : pale,
          k === 3 || k === 7 ? 800 : 600,
          "middle",
        ),
      );
      p.lastPoints.forEach((n, k) => {
        rect(928 + k * 43, top + 1, 35, 12, "#253e33", 3);
        text(n ?? "—", 945.5 + k * 43, top + 10, 9.8, pale, 700, "middle");
      });
    });
    text(
      "GP = appearances. Averages use games played. Dash = unavailable. FD columns show the stored FanDuel line.",
      54,
      y + 217,
      9.8,
      muted,
    );
  });

  const statusY = 1140,
    statusH = 73 + Math.max(0, availabilityLines.length - 1) * 17;
  rect(38, statusY, 1124, statusH, panel, 11, edge);
  text("04  /  OFFICIAL AVAILABILITY", 54, statusY + 25, 15, pale, 800);
  text(
    availability
      ? `NBA ${availability.label}  /  linked in the Dealer post`
      : "Coverage unavailable",
    54,
    statusY + 43,
    11,
    gold,
    700,
  );
  availabilityLines.forEach((v, i) =>
    text(v, 54, statusY + 61 + i * 17, 12, pale, 600),
  );
  text("PREGAME RESEARCH SNAPSHOT", 38, height - 51, 11, mint, 800);
  text(
    `${date(cutoff)}  ·  ${time(cutoff)}  |  Historical averages are descriptive. Prices can change.`,
    38,
    height - 29,
    11,
    muted,
    600,
  );
  text("VEGASQUANT.APP", 1162, height - 29, 11, gold, 800, "end");
  line(38, height - 15, 1162, height - 15);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Arial, sans-serif">${draw.join("")}</g></svg>`;
}
