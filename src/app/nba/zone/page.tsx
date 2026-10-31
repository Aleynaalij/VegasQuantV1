import { permanentRedirect } from "next/navigation";

// One Zone across every sport (#166): the NBA Zone is the shared feed filtered to NBA.
export default function Page() {
  permanentRedirect("/community?sport=nba");
}
