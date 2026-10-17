import Link from "next/link";
export default function ZoneNav({ active = "Latest" }: { active?: string }) {
  return (
    <nav className="zone-views" aria-label="Zone views" data-swipe-tabs>
      {[
        ["Latest", "/feed"],
        ["Parlays", "/feed?view=parlays"],
        ["Legs", "/feed?view=legs"],
        ["Wins", "/feed?view=wins"],
        ["Games", "/matchups"],
        ["Injury watch", "/feed?view=injury"],
      ].map(([label, href]) => (
        <Link
          key={label}
          href={href}
          aria-current={active === label ? "page" : undefined}
          className={active === label ? "selected" : ""}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
