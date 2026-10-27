"use client";
import { useEffect } from "react";
/** Vegas Quant is dark only. Keeps the browser theme-color and the root theme pinned to dark. */
export default function ThemePrompt() {
  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", "#070b14"));
  }, []);
  return null;
}
