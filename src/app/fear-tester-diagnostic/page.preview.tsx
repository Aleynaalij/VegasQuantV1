import { notFound } from "next/navigation";
import FearTesterDiagnostic from "@/preview/fear-tester-diagnostic";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Fear tester diagnostic",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VQ_FEAR_TESTER_DIAGNOSTIC !== "1"
  )
    notFound();
  return <FearTesterDiagnostic />;
}
