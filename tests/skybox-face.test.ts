import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SkyboxFace, { type SkyboxFaceId } from "../src/components/skybox-face";

test("a skybox face preserves real headings, lists, links and buttons in one visible screen", () => {
  const content = createElement("header", null,
    createElement("h2", { id: "tonight-title" }, "VQ Tonight"),
    createElement("ul", null,
      createElement("li", null,
        createElement("a", { href: "/nba/games/sample-game" }, "Away at Home"),
      ),
    ),
    createElement("button", { type: "button", "aria-expanded": false }, "Show all games"),
  );
  const html = renderToStaticMarkup(createElement(SkyboxFace, {
    faceId: "overview", children: content,
  }));
  assert.equal(html,
    '<div class="vq-tonight-board" data-skybox-face="overview">' +
      renderToStaticMarkup(content) + '</div>',
  );
});

test("each stable sport identity renders only its supplied content", () => {
  const faces: SkyboxFaceId[] = ["nfl", "nba", "nhl", "ncaab"];
  for (const faceId of faces) {
    const html = renderToStaticMarkup(createElement(SkyboxFace, {
      faceId,
      children: createElement("p", { role: "status" }, `${faceId} schedule unavailable`),
    }));
    assert.equal(html,
      `<div class="vq-tonight-board" data-skybox-face="${faceId}">` +
        `<p role="status">${faceId} schedule unavailable</p></div>`,
    );
  }
});

test("the standard desk keeps its existing layout without a skybox face marker", () => {
  const html = renderToStaticMarkup(createElement(SkyboxFace, {
    faceId: "overview", presentation: "standard", children: "Standard schedule",
  }));
  assert.equal(html,
    '<div class="vq-tonight-board" style="display:contents">Standard schedule</div>',
  );
});
