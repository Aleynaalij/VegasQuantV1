// Conservative sRGB bounds for the current opaque, component-monotonic hero gradient.
export function luminance(rgb) {
  const c = rgb.map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
export function ratio(a, b) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function parseRGB(value) {
  const m = value.match(
    /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
  );
  if (!m || (m[4] && Number(m[4]) !== 1))
    throw Error(`Unsupported/transparent computed color: ${value}`);
  return m.slice(1, 4).map(Number);
}
export function heroContrast(snapshot) {
  const stops = (snapshot.gradient.match(/rgba?\([^)]*\)/g) || []).map(
    parseRGB,
  );
  if (stops.length !== 3)
    throw Error("Unrecognized hero gradient; manual reassessment required");
  const hi = [0, 1, 2].map((i) => Math.max(...stops.map((c) => c[i])));
  const lo = [0, 1, 2].map((i) => Math.min(...stops.map((c) => c[i])));
  const border = parseRGB(snapshot.overlay.borderColor),
    opacity = Number(snapshot.overlay.opacity);
  if (
    snapshot.overlay.image !== "none" ||
    snapshot.overlay.background !== "rgba(0, 0, 0, 0)" ||
    opacity < 0 ||
    opacity > 1
  )
    throw Error("Unrecognized hero decorative overlay");
  // Include worst-case decorative border compositing across every text position, not only where ring falls.
  const overHi = hi.map((v, i) => v * (1 - opacity) + border[i] * opacity);
  const overLo = lo.map((v, i) => v * (1 - opacity) + border[i] * opacity);
  const backgrounds = [hi, lo, overHi, overLo];
  return snapshot.nodes.map((node) => {
    if (
      node.opacity !== "1" ||
      node.filter !== "none" ||
      node.mixBlendMode !== "normal"
    )
      throw Error("Text compositing needs manual review");
    const fg = parseRGB(node.color),
      min = Math.min(...backgrounds.map((bg) => ratio(fg, bg)));
    // Foreground must be brighter than all possible backgrounds to make this bounding proof valid.
    if (backgrounds.some((bg) => luminance(bg) >= luminance(fg)))
      throw Error("Non-monotonic foreground/background contrast");
    const large =
      parseFloat(node.fontSize) >= 24 ||
      (Number(node.fontWeight) >= 700 && parseFloat(node.fontSize) >= 18.6667);
    return {
      ...node,
      minContrast: min,
      required: large ? 3 : 4.5,
      pass: min >= (large ? 3 : 4.5),
    };
  });
}
