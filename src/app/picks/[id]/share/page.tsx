import AdminShare from "@/components/admin-share";
export const dynamic = "force-dynamic";
export default async function Share({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AdminShare id={(await params).id} />;
}
