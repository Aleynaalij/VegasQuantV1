import Link from "next/link";
import { ChartNoAxesColumnIncreasing, Gauge } from "lucide-react";
import "@/app/lobby-intelligence.css";

export default function LobbyIntelligence() {
  return (
    <section className="vq-intel" aria-labelledby="vq-intel-title">
      <h2 className="vq-lobby-section-title" id="vq-intel-title">
        VQ Intelligence
      </h2>
      <ul className="vq-intel-list">
        <li className="vq-intel-card">
          <ChartNoAxesColumnIncreasing
            className="vq-intel-icon"
            size={26}
            aria-hidden="true"
          />
          <span className="vq-intel-name">Simulator</span>
          <span className="vq-intel-soon">
            Coming soon<span className="vq-intel-sr">, not available yet</span>
          </span>
        </li>
        <li>
          <Link
            className="vq-intel-card vq-intel-link"
            href="/vegas-fear"
            aria-label="Fear Index, NFL and NBA market pressure"
          >
            <Gauge className="vq-intel-icon" size={26} aria-hidden="true" />
            <span className="vq-intel-name">Fear Index</span>
            <span className="vq-intel-soon">NFL / NBA</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
