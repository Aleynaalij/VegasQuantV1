import { notFound } from "next/navigation";
import { CommandExperience } from "@/components/blackbox-command/experience";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "BLACKBOX / COMMAND · Design Preview",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.VERCEL_ENV !== "preview"
  )
    notFound();
  return <CommandExperience />;
}
