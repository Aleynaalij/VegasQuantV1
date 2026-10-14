"use client";
import Link from "next/link";
import { Shell } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Shell active="error">
      <div className="fatal" role="alert">
        <h1>The desk hit a snag.</h1>
        <p>
          This page could not load. Your saved challenge, picks and records have
          not been changed.
        </p>
        <div className="fatal-actions">
          <button className="primary" onClick={reset}>
            Try again
          </button>
          <Link className="text-link" href="/methodology">
            Read the methodology while you wait →
          </Link>
        </div>
      </div>
    </Shell>
  );
}
