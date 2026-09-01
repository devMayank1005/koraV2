export default async function IntegrationsClientPage({
  params,
}: PageProps<"/integrations/[clientId]">) {
  const { clientId } = await params;
  return <div className="p-7 text-k-ink">Integrations · {clientId}</div>;
}
