import Membership from "@/components/membership";
import { blackboxEnabled } from "@/lib/blackbox";
export default function MembershipPage() {
  return <Membership stagingMfaEnrollment={blackboxEnabled()} />;
}
