import { PageSkeleton } from "@/components/ui/page-skeleton";

/** The index screen: a grid of client cards. */
export default function Loading() {
  return <PageSkeleton shape="cards" rows={9} />;
}
