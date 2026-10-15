"use client";
import { useEffect } from "react";

// Design preview switch: /?skin=lounge turns the casino-lounge theme on for this browser tab,
// /?skin=classic turns it off. Nothing changes for anyone who doesn't open the link.
export default function SkinPreview() {
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("skin");
    let skin: string | null = null;
    try {
      if (asked === "lounge") sessionStorage.setItem("vq-skin", "lounge");
      if (asked === "classic") sessionStorage.removeItem("vq-skin");
      skin = sessionStorage.getItem("vq-skin");
    } catch {
      skin = asked === "lounge" ? "lounge" : null;
    }
    if (skin === "lounge") document.documentElement.dataset.skin = "lounge";
    else delete document.documentElement.dataset.skin;
  }, []);
  return null;
}
