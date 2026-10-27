import { getDeskOrEmpty } from "@/lib/data";
import DeskApp from "@/components/desk";
export const dynamic = "force-dynamic";
export default async function History() {
  return <DeskApp initial={await getDeskOrEmpty()} page="history" />;
}
