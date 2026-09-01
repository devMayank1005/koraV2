export default async function AmsClientPage({
  params,
}: PageProps<"/ams/[clientId]">) {
  const { clientId } = await params;
  return <div className="p-7 text-k-ink">AMS · {clientId}</div>;
}
