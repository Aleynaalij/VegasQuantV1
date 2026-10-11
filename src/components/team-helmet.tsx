import { nflTeamCode } from "@/lib/nfl-teams";
const playerTeams: Record<string, string> = {
  "bhayshul tuten":"jax", "trevor lawrence":"jax", "brenton strange":"jax",
  "parker washington":"jax", "jakobi meyers":"jax", "brian thomas jr.":"jax",
  "dontayvion wicks":"phi", "darius cooper":"phi", "jalen hurts":"phi", "dallas goedert":"phi", "will shipley":"phi",
  "chris olave":"no", "juwan johnson":"no", "alvin kamara":"no",
  "drake london":"atl", "james cook":"buf", "james cook iii":"buf", "jaylen warren":"pit",
};
const colors: Record<string,string> = {jax:"#111820",phi:"#004c54",no:"#d3bc8d",atl:"#151515",buf:"#f4f6fa",pit:"#151515"};
export default function TeamHelmet({name}:{name:string}) {
  const code = playerTeams[name.trim().toLowerCase()] || nflTeamCode(name);
  return <svg className="team-helmet" viewBox="0 0 100 80" role="img" aria-label={code ? `${code.toUpperCase()} team helmet` : "Football helmet"}>
    <path d="M12 46C8 23 23 7 47 7c23 0 38 15 39 38L66 46l-7 19H28L14 55Z" fill={colors[code || ""] || "#64748b"} stroke="#8496b0" strokeWidth="2"/>
    <path d="M65 45h25v23H62m8-13h20M76 46v22M63 65l-6 8H39" fill="none" stroke="#a9b8cc" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M20 23c8-10 19-12 30-12" fill="none" stroke="#ffffff66" strokeWidth="3" strokeLinecap="round"/>
    {code && <image href={`https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`} x="25" y="22" width="35" height="30"/>}
  </svg>;
}
