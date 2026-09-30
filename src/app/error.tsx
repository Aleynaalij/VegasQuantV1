"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal">
      <h1>The desk hit a snag.</h1>
      <p>Your saved challenge has not been changed.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
