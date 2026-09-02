// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InlineText, InlineSelect } from "@/components/ui/inline";
import { keys } from "@/lib/query/keys";
import type { ClientTree } from "@/lib/db/queries/clients";

/**
 * Inline editing.
 *
 * The cases worth pinning are the ones where doing nothing is the correct
 * behaviour and is easy to get wrong: a field that blurs unedited, and Escape.
 * Both would otherwise send a write — the first a 400 for an empty patch, the
 * second the very edit the user just abandoned.
 */

const TREE = {
  id: "c1",
  name: "Aster Retail",
  _v: "2026-09-01T10:00:00.000000Z",
  integrations: [
    {
      id: "i1",
      name: "Payroll sync",
      status: "In Progress",
      assignee: "Kavya",
      _v: "2026-09-01T10:00:00.000000Z",
    },
  ],
} as unknown as ClientTree;

const TARGET = {
  kind: "integration" as const,
  clientId: "c1",
  id: "i1",
  path: "/api/integrations/i1",
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(keys.clients.one("c1"), TREE);
  qc.setQueryData(keys.clients.tree(), [TREE]);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const integ = TREE.integrations![0];

function ok(body: object = { id: "i1" }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
});
afterEach(() => vi.restoreAllMocks());

describe("InlineText", () => {
  const field = (
    <InlineText
      target={TARGET}
      field="assignee"
      label="Assignee"
      value="Kavya"
      version={integ._v}
      before={integ}
    />
  );

  it("shows the value, and swaps to an input when clicked", () => {
    wrap(field);
    fireEvent.click(screen.getByRole("button", { name: /Assignee: Kavya/ }));
    expect(screen.getByRole("textbox")).toHaveValue("Kavya");
  });

  it("saves on Enter", async () => {
    wrap(field);
    fireEvent.click(screen.getByRole("button", { name: /Assignee/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Priya" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ assignee: "Priya" });
    expect((init?.headers as Record<string, string>)["if-match"]).toBe(integ._v);
  });

  it("sends NOTHING when the field blurs unedited", async () => {
    // An empty PATCH body is a 400 from the server, not a no-op. Clicking into
    // a field and back out must not produce a request at all.
    wrap(field);
    fireEvent.click(screen.getByRole("button", { name: /Assignee/ }));
    fireEvent.blur(screen.getByRole("textbox"));

    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("abandons on Escape and restores the original value", async () => {
    // NOTE ON WHAT THIS DOES AND DOES NOT COVER. `commit` also carries a ref
    // guard against a `blur` arriving after Escape has closed the field, which
    // would save the edit Escape just discarded. That guard is NOT exercised
    // here: closing the field unmounts the input, so a dispatched blur never
    // reaches React and the assertion passes with or without it — verified by
    // removing the guard and re-running. It is kept as cheap insurance in a
    // real browser, and this test claims only what it checks.
    wrap(field);
    fireEvent.click(screen.getByRole("button", { name: /Assignee/ }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Someone else" } });
    fireEvent.keyDown(input, { key: "Escape" });

    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Assignee: Kavya/ })).toBeInTheDocument();
  });

  it("clears to null rather than empty string when nullable", async () => {
    wrap(
      <InlineText
        target={TARGET}
        field="assignee"
        label="Assignee"
        value="Kavya"
        version={integ._v}
        before={integ}
        nullable
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Assignee/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  " } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ assignee: null });
  });
});

describe("InlineSelect", () => {
  it("saves the moment it changes", async () => {
    wrap(
      <InlineSelect
        target={TARGET}
        field="status"
        label="Status"
        value="In Progress"
        options={["In Progress", "Completed"]}
        version={integ._v}
        before={integ}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Completed" },
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      status: "Completed",
    });
  });

  it("is disabled when the row arrived without a version", () => {
    // Without `_v` the write would 428. Disabling says so quietly rather than
    // letting someone make an edit that cannot land.
    wrap(
      <InlineSelect
        target={TARGET}
        field="status"
        label="Status"
        value="In Progress"
        options={["In Progress", "Completed"]}
        version={undefined}
        before={integ}
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("offers a value that matches no option, rather than showing the wrong one", () => {
    // A <select> whose value is absent from its options displays the FIRST
    // option instead — the row would calmly report the wrong owner. Production
    // has two such assignees today ("Himanshu", "Nisha").
    wrap(
      <InlineSelect
        target={TARGET}
        field="assignee"
        label="Assignee"
        value="Himanshu"
        options={["", "Arjun Mehta", "Meera"]}
        version={integ._v}
        before={integ}
        emptyLabel="Unassigned"
      />,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("Himanshu");
    expect(
      screen.getByRole("option", { name: /Himanshu \(not a current user\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unassigned" })).toBeInTheDocument();
  });
});
