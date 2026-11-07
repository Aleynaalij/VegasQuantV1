import { notFound } from "next/navigation";
import FearTesterDiagnostic from "@/preview/fear-tester-diagnostic";
import { isFearTesterDiagnosticPreview } from "@/preview/fear-tester-diagnostic-environment";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Fear tester diagnostic",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (!isFearTesterDiagnosticPreview()) notFound();
  return <FearTesterDiagnostic />;
}
