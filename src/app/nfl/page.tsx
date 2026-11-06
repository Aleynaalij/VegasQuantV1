import { getDeskOrEmpty } from "@/lib/data";
import DeskApp from "@/components/desk";
export const dynamic = "force-dynamic";
export const metadata = { title: "NFL desk | Vegas Quant" };
/** The NFL desk (formerly the root page). "/" is the neutral lobby. */
export default async function NflDesk() {
  return <DeskApp initial={await getDeskOrEmpty()} page="home" />;
}
