import test from "node:test";
import assert from "node:assert/strict";
import { ratio, heroContrast } from "./contrast-bound.mjs";
const snapshot = {
  gradient:
    "radial-gradient(ellipse at 80% 0%, rgb(49, 92, 69) 0%, rgb(16, 46, 35) 48%, rgb(10, 25, 20) 100%)",
  overlay: {
    borderColor: "rgb(149, 130, 90)",
    opacity: "0.05",
    image: "none",
    background: "rgba(0, 0, 0, 0)",
  },
  nodes: [
    {
      color: "rgb(193, 208, 200)",
      opacity: "1",
      filter: "none",
      mixBlendMode: "normal",
      fontSize: "13px",
      fontWeight: "400",
    },
  ],
};
test("WCAG black white ratio", () =>
  assert.equal(ratio([0, 0, 0], [255, 255, 255]), 21));
test("new muted token clears gradient plus decorative ring conservative bound", () =>
  assert(heroContrast(snapshot)[0].pass));
test("old muted token fails conservative gradient bound", () =>
  assert(
    !heroContrast({
      ...snapshot,
      nodes: [{ ...snapshot.nodes[0], color: "rgb(185, 201, 194)" }],
    })[0].pass,
  ));
test("changed gradient syntax cannot silently pass", () =>
  assert.throws(() => heroContrast({ ...snapshot, gradient: "none" })));
