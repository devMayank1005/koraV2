import { IntegrationsClientView } from "@/components/integrations/client-view";

export default async function IntegrationsClientPage({
  params,
}: PageProps<"/integrations/[clientId]">) {
  const { clientId } = await params;
  return <IntegrationsClientView clientId={clientId} />;
}
