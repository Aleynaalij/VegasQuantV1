export default function ZoneNav({ active = "Latest" }: { active?: string }) {
  return (
    <nav className="zone-views" aria-label="Zone views">
      {[
        ["Latest", "/feed"],
        ["Games", "/matchups"],
        ["Legs", "/feed?view=legs"],
        ["Injury watch", "/feed?view=injury"],
      ].map(([label, href]) => (
        <a
          key={label}
          href={href}
          aria-current={active === label ? "page" : undefined}
          className={active === label ? "selected" : ""}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
