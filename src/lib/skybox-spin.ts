import type { Sport } from "@/lib/sports";
import type { TonightGame } from "@/lib/vq-tonight";

/** Faces of the turning Skybox, in turning order. NHL joins only when its access rule allows it. */
export const SPIN_ORDER: Sport[] = ["nfl", "nba", "nhl", "ncaab"];

/** What the Skybox shows: the All sports overview, or one sport's face. */
export type SpinMode = "overview" | Sport;

/**
 * One sport's schedule as the face shows it. Built only from the readers VQ Tonight already uses:
 * `unavailable` (the source failed and nothing earlier is known) is never shown as "no games";
 * `stale` keeps earlier games when a later refresh failed.
 */
export type FaceState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; games: TonightGame[]; stale: boolean; checkedAt: number | null };

/** Index into a ring of `n` faces, for any integer position (negative or beyond one turn). */
export const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** The face list for the current access rules (NHL only when not held). */
export function spinFaces(nhlVisible: boolean): Sport[] {
  return SPIN_ORDER.filter((s) => s !== "nhl" || nhlVisible);
}

/** Today's games for one sport, already filtered to the ET day and sorted chronologically. */
export function faceGames(rows: TonightGame[], sport: Sport): TonightGame[] {
  return rows.filter((g) => g.sport === sport);
}

/** Movement under this many pixels is still a tap. */
export const SLOP = 10;

/**
 * Classify a pointer gesture from its start. Horizontal wins only when it clearly dominates, so a
 * slightly diagonal vertical scroll stays a scroll, and a pinch (second pointer) is never a turn.
 */
export function classifyGesture(dx: number, dy: number): "pending" | "horizontal" | "vertical" {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < SLOP) return "pending";
  return ax > ay * 1.2 ? "horizontal" : "vertical";
}

/**
 * Where a released horizontal drag settles, as a step of -1, 0 or +1 faces. Dragging left (dx < 0)
 * brings the next face. A quarter-width drag commits; a quick flick commits from a shorter drag. A
 * reversal (the flick goes against the distance) follows the flick's direction only when the flick
 * is fast; otherwise the distance decides.
 */
export function settleStep(dx: number, velocity: number, width: number): -1 | 0 | 1 {
  const w = Math.max(1, width);
  const fast = Math.abs(velocity) > 0.45; // px per ms
  if (fast && Math.abs(dx) > SLOP * 2) return velocity < 0 ? 1 : -1;
  if (Math.abs(dx) > w * 0.25) return dx < 0 ? 1 : -1;
  return 0;
}

/** The turn (degrees) a live drag of `dx` pixels represents, with resistance past one face. */
export function dragDegrees(dx: number, width: number, faces: number): number {
  const step = 360 / Math.max(1, faces);
  const raw = (dx / Math.max(1, width)) * step;
  const limit = step * 1.15;
  return Math.max(-limit, Math.min(limit, raw));
}

/** How far each face sits from the prism's centre, so `n` faces of `width` close into a ring. */
export function ringRadius(width: number, faces: number): number {
  if (faces < 3) return width / 2;
  return width / 2 / Math.tan(Math.PI / faces);
}

/** Session key for the chosen face, so returning from a game restores it (no history entries). */
export const SPIN_STORAGE_KEY = "vq-skybox-face";

export function parseSpinMode(v: unknown, faces: Sport[]): SpinMode {
  return v === "overview" || (typeof v === "string" && (faces as string[]).includes(v)) ? (v as SpinMode) : "overview";
}
