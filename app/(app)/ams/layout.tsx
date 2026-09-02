import { TrackerShell } from "@/components/tracker-shell";

export default function AMSSupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TrackerShell domain="ams">{children}</TrackerShell>;
}
