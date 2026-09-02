import { IntegrationDetailView } from "@/components/integrations/detail-view";

export default async function IntegrationDetailPage({
  params,
}: PageProps<"/integrations/[clientId]/[integId]">) {
  const { clientId, integId } = await params;
  return <IntegrationDetailView clientId={clientId} integId={integId} />;
}
