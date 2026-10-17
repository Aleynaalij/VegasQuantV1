"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import CasinoCard from "./casino-card";
import DownloadCard from "./download-card";
import GamblyLink from "./gambly-link";
import { weekendMoneylineCard as card, weekendMoneylineCopy } from "@/lib/weekend-moneyline-card";
import type { CasinoCardData } from "@/lib/casino-card";
import { time } from "@/lib/domain";

export default function WeekendMoneylineCard() {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const update = () => setExpired(Date.now() >= Date.parse(card.expiresAt));
    update();
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const face: CasinoCardData = {
    variant: "parlay", eyebrow: "12-leg moneyline · Sunday predictions",
    title: card.title, matchup: "October 18 · Every Sunday matchup",
    legs: card.legs.map(l => ({ name: l.name, market: "Moneyline", note: l.matchup })),
    footnote: "One-time analyst predictions · No validated edge claimed. Every leg must win.",
    publishedAt: card.preparedAt,
  };
  return (
    <section className="zone-parlay" id={card.id} aria-label="Sunday moneyline prediction card">
      <CasinoCard data={face} />
      <p className="notice">One-time prediction card · Not a VQ Approved or official pick. Combined odds and payout are unverified.</p>
      {expired ? <p role="status">Kickoff has passed. Original predictions preserved; copying is closed.</p> :
        <GamblyLink url="https://gambly.com" selection={weekendMoneylineCopy} label="Copy moneyline card & open Gambly ↗" />}
      <details>
        <summary>Why these teams · risks & sources</summary>
        <p>Prepared {time(card.preparedAt)} from this week’s published matchup research and stored FanDuel moneyline observations. These are qualitative winner leans, not a priced model forecast. No combined probability, EV or confidence score is supplied.</p>
        <p>Historical quotes below came through The Odds API and were received {time(card.quoteRetrievedAt)}. They are not live executable prices. Final inactives, stadium weather, public splits and a complete line-movement review remain unverified. Missing information is not clearance.</p>
        <p>One turnover, quarterback change or late inactive can break the entire card. Giants, Falcons and Packers are especially fragile leans. Heavy favorites still add failure paths; this ticket has not passed the normal selection gate.</p>
        {card.legs.map(l => <div key={l.slug}>
          <h3>{l.name} moneyline · {l.matchup}</h3>
          <p>{l.why}</p><p><strong>Why it could lose:</strong> {l.risk}</p>
          <p>FanDuel historical snapshot: {l.odds > 0 ? "+" : ""}{l.odds} · Provider observation {time(l.quoteAt)}.</p>
          <Link href={`/matchups/${l.slug}`}>Published game research →</Link>
        </div>)}
        <p><a href={card.source} target="_blank" rel="noopener noreferrer">NFL Week 6 final injury report ↗</a></p>
        <p><a href={card.quoteSource} target="_blank" rel="noopener noreferrer">Odds source: The Odds API ↗</a></p>
      </details>
      <DownloadCard title={card.title} subtitle="12-leg moneyline · October 18 Sunday predictions" publishedAt={card.preparedAt} sections={[
        { heading: "Selections", text: weekendMoneylineCopy },
        { heading: "Prediction card", text: "One-time analyst predictions. Not VQ Approved or an official pick. No validated edge, combined odds or payout. Every leg must win." },
        { heading: "Risks & sources", text: `${card.source}\nFinal availability and current prices must be checked. Giants, Falcons and Packers are fragile leans.` },
      ]} />
    </section>
  );
}
