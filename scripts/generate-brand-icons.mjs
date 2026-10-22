// Keep install icons, favicon and the shared VQ mark in the Home lounge palette.
// Run from the repository root: node scripts/generate-brand-icons.mjs
import fs from 'node:fs/promises';
import sharp from 'sharp';
const mark = await fs.readFile('public/brand/vq-mark.svg', 'utf8');
const paths = mark.match(/<path[^>]+\/>/g).join('');
const svg = (maskable = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><radialGradient id="felt"><stop stop-color="#10382b"/><stop offset="1" stop-color="#070d0b"/></radialGradient></defs><rect width="512" height="512" rx="${maskable ? 0 : 100}" fill="#07080b"/><circle cx="256" cy="256" r="${maskable ? 190 : 222}" fill="url(#felt)" stroke="#b48a36" stroke-width="2"/><circle cx="256" cy="256" r="${maskable ? 181 : 213}" fill="none" stroke="#e8c46a" stroke-opacity=".16"/><g transform="${maskable ? 'translate(88 130) scale(.70)' : 'translate(52 103) scale(.85)'}">${paths}</g></svg>`;
for (const [name, size, mask] of [['192', 192, false], ['512', 512, false], ['apple', 180, false], ['maskable-512', 512, true]]) {
  await sharp(Buffer.from(svg(mask))).resize(size, size).png({ palette: true, colours: 64, dither: 0 }).toFile(`public/icons/vq-lounge-${name}.png`);
}
await fs.writeFile('src/app/icon.svg', svg());
await fs.writeFile('public/icons/vq-prestige-app.svg', svg());
await fs.writeFile('public/icons/vq-prestige-maskable.svg', svg(true));
