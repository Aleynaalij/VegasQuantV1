import type { PublicationPost } from "./zone-publication-card";

/** A Zone post tied to a game, as public.game_zone_posts returns it. */
export type GameZonePost = PublicationPost & {
  kind: string;
  photo_path: string | null;
  author_name: string;
  reactions: number;
  comments: number;
};

const str = (v: unknown): v is string => typeof v === "string";

/** Keep only well-formed rows; a malformed response shows nothing rather than a broken section. */
export function gameZonePosts(data: unknown): GameZonePost[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    const r = raw as Record<string, unknown>;
    if (
      !r ||
      !str(r.id) ||
      !str(r.sport) ||
      !str(r.title) ||
      !str(r.body) ||
      !str(r.created_at)
    )
      return [];
    return [
      {
        id: r.id,
        sport: r.sport,
        kind: str(r.kind) ? r.kind : "talk",
        title: r.title,
        body: r.body,
        legs: Array.isArray(r.legs) ? r.legs.filter(str) : [],
        card: str(r.card) ? r.card : null,
        photo_path: str(r.photo_path) ? r.photo_path : null,
        author_name: str(r.author_name) ? r.author_name : "",
        created_at: r.created_at,
        reactions: Number(r.reactions) || 0,
        comments: Number(r.comments) || 0,
      },
    ];
  });
}

/** The post's own page in The Zone, where reactions, votes and comments live. */
export const zonePostHref = (p: Pick<GameZonePost, "id" | "sport">) =>
  `/community?sport=${encodeURIComponent(p.sport)}&post=${encodeURIComponent(p.id)}#post-${p.id}`;

/** A short plain-text lead for posts that are not rendered as a card. */
export function zonePostLead(body: string, max = 320) {
  const text = body
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}
