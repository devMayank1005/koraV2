export default async function IntegrationDetailPage({
  params,
}: PageProps<"/integrations/[clientId]/[integId]">) {
  const { clientId, integId } = await params;
  return (
    <div className="p-7 text-k-ink">
      Integration · {clientId} · {integId}
    </div>
  );
}
