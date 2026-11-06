import { ChartNoAxesColumnIncreasing, Gauge } from "lucide-react";
import "@/app/lobby-intelligence.css";

/**
 * VQ Intelligence on the lobby: the two tools on the way, shown as the concept draws them but plainly
 * marked "Coming soon". Neither is built for members yet, so these are not links or buttons, carry
 * no previews, numbers or routes, and tell assistive tech "Coming soon, not available yet". When a tool ships,
 * its card becomes a link to it.
 */
const SOON = [
  { name: "Simulator", Icon: ChartNoAxesColumnIncreasing },
  { name: "Fear Index", Icon: Gauge },
] as const;

export default function LobbyIntelligence() {
  return (
    <section className="vq-intel" aria-labelledby="vq-intel-title">
      <h2 className="vq-lobby-section-title" id="vq-intel-title">
        VQ Intelligence
      </h2>
      <ul className="vq-intel-list">
        {SOON.map(({ name, Icon }) => (
          <li key={name} className="vq-intel-card">
            <Icon className="vq-intel-icon" size={26} aria-hidden="true" />
            <span className="vq-intel-name">{name}</span>
            <span className="vq-intel-soon">
              Coming soon<span className="vq-intel-sr">, not available yet</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
