import { describe, it, expect } from "vitest";
import { pickLanding } from "@/lib/domain/integrations";

/**
 * `pickLanding` decides what a tracker opens on when nothing was asked for.
 *
 * It is four lines and it is tested because the interesting case is the one
 * nobody hits in development: the remembered id points at something that has
 * since been archived. On a fresh seed the remembered id is always valid, so a
 * version that simply trusted it would look perfect locally and land a real
 * user on an empty screen weeks later.
 */
describe("pickLanding", () => {
  const ids = ["c3", "c1", "c2"];

  it("returns where you were when it is still there", () => {
    expect(pickLanding("c2", ids)).toBe("c2");
  });

  it("falls back to the first when the remembered row has gone", () => {
    // The archived-client case. NOT sorted — the caller decides the order, and
    // the integrations table is deliberately worst-first, not alphabetical.
    expect(pickLanding("c9", ids)).toBe("c3");
  });

  it("falls back to the first when nothing was remembered", () => {
    expect(pickLanding(undefined, ids)).toBe("c3");
  });

  it("returns undefined when there is nothing to select", () => {
    // A client with no integrations, or a tracker with no clients. The caller
    // must render an empty state rather than a panel.
    expect(pickLanding("c1", [])).toBeUndefined();
    expect(pickLanding(undefined, [])).toBeUndefined();
  });

  it("does not treat an empty string as a selection", () => {
    expect(pickLanding("", ids)).toBe("c3");
  });
});
