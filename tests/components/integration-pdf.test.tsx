// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { exportIntegrationPdf } from "@/lib/export/integration-pdf";
import { exportFilename, sanitizeFilePart, exportFileStamp } from "@/lib/export/download";
import { makeClients } from "../golden/fixtures";
import type { Client } from "@/lib/domain/types";

/**
 * Does the Integration Report actually generate?
 *
 * This is a STRUCTURAL check, and it says so rather than implying more. It
 * proves the generator runs end to end on real-shaped data, emits a valid PDF,
 * paginates, and never throws on the awkward inputs — a client with no
 * integrations, one with fifty, names full of characters a filesystem refuses.
 *
 * It does NOT prove the report is correct. Nothing that reads bytes can: the
 * numbers on the page are the thing that matters and they are checked by
 * opening the file against the screen it came from. What this catches is the
 * whole class of failure where an export silently stops working — a library
 * upgrade changing a call shape, a null reaching a text call, a page loop that
 * never terminates.
 *
 * The donut needs a real canvas, which jsdom has not got. `buildDonutDataUrl`
 * is called inside a try/catch for exactly that reason, so these run with the
 * chart absent — which is also the real degradation path in a locked-down
 * browser, and worth knowing does not take the report down with it.
 *
 * ── FAKE TIMERS MUST NOT BE ACTIVE DURING GENERATION ──
 * `blobToBase64` waits on a `FileReader`, and jsdom schedules that callback on
 * a task that `vi.useFakeTimers()` freezes — so the promise never settles and
 * the whole suite hangs with no output and no failure. The first version of
 * this file did exactly that and had to be killed. Time is frozen only long
 * enough to BUILD the fixtures, which is what needs determinism; generation
 * then runs on real timers.
 */

const FROZEN = new Date("2026-08-31T12:00:00.000Z");

/** jsPDF hands back a Blob; read its head to check the magic bytes. */
async function head(blob: Blob, n = 8): Promise<string> {
  const buf = await blob.arrayBuffer();
  return new TextDecoder().decode(new Uint8Array(buf).slice(0, n));
}

describe("Integration Report PDF", () => {
  let clients: Client[];

  beforeAll(() => {
    // Frozen only for fixture construction — see the note above.
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN);
    clients = makeClients(42, 40, FROZEN);
    vi.useRealTimers();
  });

  afterAll(() => vi.useRealTimers());

  it("produces a real PDF for a client with integrations", async () => {
    const c = clients.find((x) => (x.integrations ?? []).length > 3)!;
    const result = await exportIntegrationPdf(c, { returnBlob: true });

    expect(result).toBeDefined();
    expect(await head(result!.blob)).toMatch(/^%PDF-/);
    expect(result!.blob.size).toBeGreaterThan(5_000);
  });

  it("returns base64 with no data: prefix, ready for the email attachment", async () => {
    // `clientEmailSend.attachment.contentBase64` takes RAW base64. A `data:`
    // prefix would pass the zod string check and produce a corrupt attachment
    // on the client's side — a failure nobody would see until someone opened
    // the mail.
    const c = clients.find((x) => (x.integrations ?? []).length > 0)!;
    const result = await exportIntegrationPdf(c, { returnBlob: true });

    expect(result!.base64.startsWith("data:")).toBe(false);
    expect(result!.base64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // And it must decode back to the same PDF.
    expect(atob(result!.base64.slice(0, 8))).toMatch(/^%PDF-/);
  });

  it("stays under the 12MB encoded cap the email schema enforces", async () => {
    const c = clients.find((x) => (x.integrations ?? []).length > 3)!;
    const result = await exportIntegrationPdf(c, { returnBlob: true });
    expect(result!.base64.length).toBeLessThan(12 * 1024 * 1024);
  });

  it("survives a client with NO integrations", async () => {
    // The exec summary has a donut, a top-risks list and a milestone tally,
    // all of which divide by or index into an empty array.
    const empty: Client = { ...clients[0], integrations: [] };
    const result = await exportIntegrationPdf(empty, { returnBlob: true });
    expect(await head(result!.blob)).toMatch(/^%PDF-/);
  });

  it("survives an integration with no updates, no due date and no assignee", async () => {
    const bare: Client = {
      ...clients[0],
      integrations: [
        {
          id: "i_bare",
          name: "Bare",
          status: "Not Started",
          assignee: "",
          dueDate: "",
          description: "",
          nextAction: "",
          effortWeight: 0.5,
          timeline: [],
          milestones: [],
        },
      ],
    };
    const result = await exportIntegrationPdf(bare, { returnBlob: true });
    expect(await head(result!.blob)).toMatch(/^%PDF-/);
  });

  it("paginates rather than truncating when there are many integrations", async () => {
    // The appendix is one row per integration with full update history, so a
    // big client must spill onto extra pages. A generator that silently
    // produced a fixed page count would be dropping rows.
    const big = clients
      .filter((c) => (c.integrations ?? []).length > 0)
      .sort((a, b) => (b.integrations?.length ?? 0) - (a.integrations?.length ?? 0))[0];
    const small: Client = { ...big, integrations: (big.integrations ?? []).slice(0, 1) };

    const [bigPdf, smallPdf] = await Promise.all([
      exportIntegrationPdf(big, { returnBlob: true }),
      exportIntegrationPdf(small, { returnBlob: true }),
    ]);
    expect(bigPdf!.blob.size).toBeGreaterThan(smallPdf!.blob.size);
  });

  it("never throws across a wide spread of real-shaped clients", async () => {
    // The generator does a lot of arithmetic on optional fields. This is the
    // cheap broad net under all of it.
    for (const c of clients.slice(0, 12)) {
      await expect(
        exportIntegrationPdf(c, { returnBlob: true }),
      ).resolves.toBeDefined();
    }
  }, 30_000);

  it("names the file ClientName_ReportType_DDMonYYYY.pdf", async () => {
    const c = clients.find((x) => (x.integrations ?? []).length > 0)!;
    const result = await exportIntegrationPdf(c, { returnBlob: true });
    expect(result!.filename).toBe(
      `${sanitizeFilePart(c.name)}_Integration_Report_${exportFileStamp()}.pdf`,
    );
    expect(result!.filename).toMatch(/_Integration_Report_\d{2}[A-Z][a-z]{2}\d{4}\.pdf$/);
  });

  it("strips characters a filesystem refuses from the client name", () => {
    // Real client names in this system contain slashes — "Eternis Phase 2" is
    // tame, but "Data Migration / Production Migration" is a real phase name
    // and the same helper is used for those filenames.
    expect(exportFilename('A/B\\C:D*E?F"G<H>I|J', "Report", "pdf")).toBe(
      `A-B-C-D-E-F-G-H-I-J_Report_${exportFileStamp()}.pdf`,
    );
  });
});

/**
 * Characters the built-in PDF fonts cannot draw.
 *
 * Found by generating a real report and reading the text back out, not by
 * reasoning: `On Hold — Internal` came out as `On Hold  Internal` and
 * `Executive Summary’s` as `Executive Summarys`. jsPDF drops unmappable
 * characters silently, so nothing failed and nothing warned — the report just
 * quietly had holes in it, on four of the ten status names.
 */
describe("PDF text sanitising", () => {
  it("maps every character the standard fonts cannot render", async () => {
    const { pdfSafe } = await import("@/lib/export/pdf-doc");
    expect(pdfSafe("On Hold — Internal")).toBe("On Hold - Internal");
    expect(pdfSafe("en–dash")).toBe("en-dash");
    expect(pdfSafe("Summary’s ‘quoted’")).toBe("Summary's 'quoted'");
    expect(pdfSafe("“smart”")).toBe('"smart"');
    expect(pdfSafe("truncated…")).toBe("truncated...");
    expect(pdfSafe("a b")).toBe("a b");
    expect(pdfSafe("zero​width")).toBe("zerowidth");
  });

  it("leaves alone the non-ASCII characters WinAnsi DOES have", () => {
    // The middle dot is load-bearing — it separates the RAG reason's clauses
    // and the donut legend's count from its percentage. Mapping it to ASCII
    // would be a regression, so the sanitiser must be a fixed list rather than
    // a blanket strip-non-ASCII.
    return import("@/lib/export/pdf-doc").then(({ pdfSafe }) => {
      expect(pdfSafe("3 overdue · 2 stale")).toBe("3 overdue · 2 stale");
      expect(pdfSafe("₹1,200")).toBe("₹1,200");
    });
  });

  it("a generated report carries the REPLACEMENTS, not gaps", async () => {
    // The real guard. Wrapping doc.text covers autoTable's own drawing too,
    // which is the half that would otherwise be missed — its cells never pass
    // through our call sites.
    // Its own fixture rather than the shared one: this block is a sibling
    // describe, and it needs a client that DEFINITELY carries every character
    // in question rather than whichever the generator happened to produce.
    const withDash: Client = {
      id: "c_dash",
      name: "Client — Dash",
      description: "",
      currency: "INR",
      masterAssignee: null,
      manDayRate: null,
      totalAvailableHours: null,
      integrations: [
        {
          id: "i1",
          name: "Integration — one",
          status: "On Hold — Internal",
          assignee: "A",
          dueDate: "2026-08-01",
          description: "",
          nextAction: "Chase — urgently, it’s late",
          effortWeight: 0.5,
          timeline: [
            { date: "2026-07-01", update: "Started — “kickoff” held…", by: "A" },
          ],
          milestones: [],
        },
      ],
    } as unknown as Client;
    const result = await exportIntegrationPdf(withDash, { returnBlob: true });
    const text = new TextDecoder("latin1").decode(await result!.blob.arrayBuffer());

    // ASSERT THE POSITIVE. The first version of this test asserted the em dash
    // was ABSENT from the bytes — which passed with the sanitiser removed,
    // because jsPDF drops the character rather than writing it. Absence is
    // exactly what the bug looks like. What distinguishes fixed from broken is
    // whether the REPLACEMENT is there.
    expect(text).toContain("On Hold - Internal");
    expect(text).toContain("Chase - urgently, it's late");
    expect(text).toContain("Started - \"kickoff\" held...");

    // And the raw characters must not have survived either.
    for (const ch of ["\u2014", "\u2019", "\u201C", "\u2026"]) {
      expect(text.includes(ch), `raw ${JSON.stringify(ch)} reached the PDF`).toBe(false);
    }
  });
});
