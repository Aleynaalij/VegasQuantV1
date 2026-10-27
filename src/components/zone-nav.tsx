import Link from "next/link";
export default function ZoneNav({ active = "Latest" }: { active?: string }) {
  return (
    <nav className="zone-views" aria-label="Zone views" data-swipe-tabs>
      {[
        ["Latest", "/community"],
        ["VIP Lays", "/community?view=vip"],
        ["Injuries", "/feed?view=injury"],
      ].map(([label, href]) => (
        <Link
          key={label}
          href={href}
          aria-current={
            active === label ||
            (label === "Injuries" && active === "Injury watch") ||
            (label === "VIP Lays" && active === "Contributors")
              ? "page"
              : undefined
          }
          className={
            active === label ||
            (label === "Injuries" && active === "Injury watch") ||
            (label === "VIP Lays" && active === "Contributors")
              ? "selected"
              : ""
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
