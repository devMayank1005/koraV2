import { ImplementationMatrixView } from "@/components/implementation/matrix-view";

export default async function ImplementationClientPage({
  params,
}: PageProps<"/implementation/[clientId]">) {
  const { clientId } = await params;
  return <ImplementationMatrixView clientId={clientId} />;
}
