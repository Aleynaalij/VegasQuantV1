import { permanentRedirect } from "next/navigation";

// NBA is live again (owner, Oct 31 2026, #166): the research tab's old links open the NBA desk.
export default function Page() {
  permanentRedirect("/nba");
}
