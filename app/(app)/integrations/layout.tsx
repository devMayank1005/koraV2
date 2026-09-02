import { TrackerShell } from "@/components/tracker-shell";

export default function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TrackerShell domain="integrations">{children}</TrackerShell>;
}
