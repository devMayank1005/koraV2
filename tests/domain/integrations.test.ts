import { describe, it, expect } from "vitest";
import {
  pickLanding,
  sortIntegrations,
  sortIntegWorstFirst,
  effortLabel,
} from "@/lib/domain/integrations";
import type { Integration } from "@/lib/domain/types";

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

/**
 * `sortIntegrations` — the list's order under the sort control.
 *
 * The cases worth writing down are the ones a naive implementation gets wrong:
 * undated rows in a date sort, and ties. Ties matter more than they look: a
 * sort that leaves equal rows to the engine is stable per run but not per
 * dataset, so re-filtering would reshuffle them under the reader's cursor.
 */
describe("sortIntegrations", () => {
  const integ = (over: Partial<Integration> & { name: string }): Integration =>
    ({ id: over.name, status: "Not Started", ...over }) as Integration;

  const rows: Integration[] = [
    integ({ name: "Zulu", status: "Completed", dueDate: "2026-01-01" }),
    integ({ name: "Alpha", status: "In Progress" }),
    integ({ name: "Mike", status: "In Progress", dueDate: "2026-03-01" }),
    integ({ name: "Bravo", status: "Not Started", dueDate: "2026-02-01" }),
  ];

  const names = (mode: Parameters<typeof sortIntegrations>[1]) =>
    sortIntegrations(rows, mode).map((i) => i.name);

  it("sorts by name", () => {
    expect(names("name")).toEqual(["Alpha", "Bravo", "Mike", "Zulu"]);
  });

  it("sorts by due date, soonest first, with undated rows LAST", () => {
    // Not first. An empty date sorting as the epoch would stack every undated
    // row at the top of a list whose whole job is "what needs attention".
    expect(names("due")).toEqual(["Zulu", "Bravo", "Mike", "Alpha"]);
  });

  it("sorts by status in STATUSES order, not alphabetically", () => {
    // Alphabetically "Completed" would come first; canonically it is last.
    expect(names("status")).toEqual(["Bravo", "Alpha", "Mike", "Zulu"]);
  });

  it("breaks every tie on name, so the order is total", () => {
    const tied = [
      integ({ name: "Beta", status: "In Progress" }),
      integ({ name: "Alpha", status: "In Progress" }),
    ];
    expect(sortIntegrations(tied, "status").map((i) => i.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(sortIntegrations(tied, "due").map((i) => i.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("delegates `worst` rather than reimplementing the ranking", () => {
    const now = new Date("2026-02-15T00:00:00Z");
    expect(sortIntegrations(rows, "worst", now)).toEqual(
      sortIntegWorstFirst(rows, now),
    );
  });

  it("does not mutate the array it is given", () => {
    const before = rows.map((i) => i.name);
    sortIntegrations(rows, "name");
    expect(rows.map((i) => i.name)).toEqual(before);
  });
});

/** The effort scale the panel offers. */
describe("effortLabel", () => {
  it("names the four steps", () => {
    expect(effortLabel(0.25)).toBe("Light — 0.25");
    expect(effortLabel(0.5)).toBe("Medium — 0.5");
    expect(effortLabel(1)).toBe("Heavy — 1");
    expect(effortLabel(2)).toBe("Very heavy — 2");
  });

  it("shows an unlisted weight as itself rather than snapping it", () => {
    // Nothing constrains the column, so rows outside the four exist. Rounding
    // one to the nearest step would silently move someone's capacity numbers.
    expect(effortLabel(0.75)).toBe("0.75");
  });

  it("renders an absent weight as a dash", () => {
    expect(effortLabel(undefined)).toBe("—");
  });
});
