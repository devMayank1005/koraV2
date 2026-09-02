import { AmsClientView } from "@/components/ams/client-view";

export default async function AmsClientPage({
  params,
}: PageProps<"/ams/[clientId]">) {
  const { clientId } = await params;
  return <AmsClientView clientId={clientId} />;
}
