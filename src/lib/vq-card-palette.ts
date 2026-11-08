const GOLD = "#e8c46a";
const palettes = [
  { name: "green", accent: "#8fdbb1", glow: "#234d39", base: "#071b13", gold: GOLD },
  { name: "gold", accent: "#f1d58e", glow: "#4a391d", base: "#181208", gold: GOLD },
  { name: "black", accent: "#d7c393", glow: "#282824", base: "#0a0a09", gold: GOLD },
] as const;

/** Deal a palette once per card identity so the preview and PNG always agree. */
export function vqCardPalette(key: string) {
  let hash = 2166136261;
  for (const character of key)
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return palettes[(hash >>> 0) % palettes.length];
}
