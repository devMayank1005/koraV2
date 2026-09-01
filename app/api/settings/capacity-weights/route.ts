import { withAuth, json } from "@/lib/api/handler";
import { getCapacityWeights } from "@/lib/db/queries/misc";

export const runtime = "nodejs";

/** Any signed-in user: the dashboard tile that uses these renders for everyone. */
export const GET = withAuth({}, async ({ db }) =>
  json({ capacityWeights: await getCapacityWeights(db) }),
);
