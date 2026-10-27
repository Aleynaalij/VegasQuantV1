/** Original prestige VQ monogram paths, shared by app chrome, published cards and card images. */
export const MARK_PATHS: [fill: string, d: string][] = [
  ["#F3DC9A", "M260 35C182 32 130 98 130 174C130 257 182 312 258 312C337 312 388 253 388 173C388 96 337 37 260 35ZM258 46C311 46 348 100 348 174C348 247 314 301 259 301C205 301 169 248 169 174C169 101 204 46 258 46Z"],
  ["#B48A36", "M208 237C255 223 286 251 321 282C350 307 391 339 444 310C414 349 365 342 326 325C282 305 257 258 208 237Z"],
  ["#F3DC9A", "M23 8H118V12C96 14 97 29 105 48L172 223L243 44C251 23 246 15 225 12V8H305V12C281 15 270 29 260 51L159 304L57 50C47 25 43 15 23 12Z"],
  ["#B48A36", "M107 19C95 24 102 42 108 58L173 220L158 257L90 69C82 45 82 25 107 19Z"],
];
/** The monogram as a standalone SVG document (for canvas export). */
export const markSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">${MARK_PATHS.map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join("")}</svg>`;
export default function BrandMark({ className = "" }: { className?: string }) {
  return <svg className={`vq-mark ${className}`} viewBox="0 0 480 360" aria-hidden="true" focusable="false">{MARK_PATHS.map(([fill, d], i) => <path key={i} fill={fill} d={d} />)}</svg>;
}
