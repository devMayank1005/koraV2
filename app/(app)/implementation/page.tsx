import { TrackerIndex } from "@/components/tracker-index";
import { Hydrate, clientTreesQuery } from "@/lib/query/prefetch";

export default function Page() {
  return (
    <Hydrate queries={[clientTreesQuery()]}>
      <TrackerIndex domain="implementation" />
    </Hydrate>
  );
}
