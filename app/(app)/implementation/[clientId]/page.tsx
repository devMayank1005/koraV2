export default async function ImplementationClientPage({
  params,
}: PageProps<"/implementation/[clientId]">) {
  const { clientId } = await params;
  return <div className="p-7 text-k-ink">Implementation · {clientId}</div>;
}
