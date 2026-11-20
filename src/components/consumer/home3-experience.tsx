"use client";
import Home3, { type Home3Props } from "@/components/home3/home3";
import { Shell } from "@/components/ui";

/** Production owner-preview Home: the arena layout inside the normal app shell. */
export default function Home3Experience(props: Home3Props) {
  return (
    <Shell active="lobby">
      <Home3 {...props} />
    </Shell>
  );
}
