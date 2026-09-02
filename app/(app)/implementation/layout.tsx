import { TrackerShell } from "@/components/tracker-shell";

export default function ImplementationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TrackerShell domain="implementation">{children}</TrackerShell>;
}
