import { getDesk } from "@/lib/data";
import DeskApp from "@/components/desk";
export const dynamic = "force-dynamic";
export default async function PerformancePage() {
  return <DeskApp initial={await getDesk()} page="performance" />;
}
