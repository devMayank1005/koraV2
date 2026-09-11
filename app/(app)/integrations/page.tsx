import { TrackerIndex } from "@/components/tracker-index";
import { IntegrationsLanding } from "@/components/integrations/landing";

/**
 * NO `clientTreesQuery()` PREFETCH HERE, unlike the other two trackers.
 *
 * On a desktop `IntegrationsLanding` redirects away from this route before the
 * index ever renders, so server-rendering the 95 kB client tree would mean
 * every landing paid for a payload it throws away. The index still needs it
 * below 768px, where it is the only client picker, and fetches it itself when
 * it actually renders.
 */
export default function Page() {
  return (
    <IntegrationsLanding>
      <TrackerIndex domain="integrations" />
    </IntegrationsLanding>
  );
}
