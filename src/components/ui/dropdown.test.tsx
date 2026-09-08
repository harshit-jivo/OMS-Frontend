/**
 * The two pickers — what the six hand-rolled copies got wrong, pinned.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MultiSelect, SearchSelect } from "./dropdown";

const GROUPS = [
  { value: 1, label: "North" },
  { value: 2, label: "South" },
  { value: 3, label: "East" },
];

const PARTIES = [
  { value: "C001", label: "Northern Traders", hint: "C001" },
  { value: "C002", label: "Southern Supply", hint: "C002" },
];

describe("MultiSelect", () => {
  it("is a group of real checkboxes, and toggles through onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiSelect value={[1]} onChange={onChange} options={GROUPS} placeholder="Pick" />);

    await user.click(screen.getByRole("button", { name: "North" }));
    const group = screen.getByRole("group");
    expect(within(group).getAllByRole("checkbox")).toHaveLength(4); // 3 + Select all

    await user.click(within(group).getByRole("checkbox", { name: "South" }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2]);

    await user.click(within(group).getByRole("checkbox", { name: "North" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("summarises the choice on the trigger", () => {
    const { rerender } = render(
      <MultiSelect value={[]} onChange={() => {}} options={GROUPS} placeholder="Pick a group" />,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Pick a group");

    rerender(<MultiSelect value={[2]} onChange={() => {}} options={GROUPS} />);
    expect(screen.getByRole("button")).toHaveTextContent("South");

    rerender(<MultiSelect value={[1, 2]} onChange={() => {}} options={GROUPS} />);
    expect(screen.getByRole("button")).toHaveTextContent("2 selected");

    rerender(<MultiSelect value={[1, 2, 3]} onChange={() => {}} options={GROUPS} />);
    expect(screen.getByRole("button")).toHaveTextContent("All (3)");
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    render(<MultiSelect value={[]} onChange={() => {}} options={GROUPS} />);

    const trigger = screen.getByRole("button");
    await user.click(trigger);
    expect(screen.getByRole("group")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on a click outside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MultiSelect value={[]} onChange={() => {}} options={GROUPS} />
        <p>elsewhere</p>
      </>,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("group")).toBeInTheDocument();
    await user.click(screen.getByText("elsewhere"));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});

describe("SearchSelect", () => {
  it("filters on the label AND the hint, and chooses by value", async () => {
    // A party is looked up by code as often as by name. The old Party
    // dropdown matched both; the old Variety one matched neither's hint.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchSelect value="" onChange={onChange} options={PARTIES} placeholder="All parties" />,
    );

    await user.click(screen.getByRole("button", { name: "All parties" }));
    await user.type(screen.getByRole("searchbox"), "c002");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Southern Supply");

    await user.click(options[0]);
    expect(onChange).toHaveBeenCalledWith("C002");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("offers the clear row only when asked, with a visible label", async () => {
    // Sales Report's Variety picker had an "all" row that was a <button> with
    // an aria-label and no text — an invisible click target.
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <SearchSelect value="C001" onChange={onChange} options={PARTIES} clearLabel="All parties" />,
    );

    await user.click(screen.getByRole("button", { name: /Northern Traders/ }));
    const clear = screen.getByRole("option", { name: "All parties" });
    expect(clear).toBeVisible();
    await user.click(clear);
    expect(onChange).toHaveBeenCalledWith("");

    rerender(<SearchSelect value="C001" onChange={onChange} options={PARTIES} />);
    await user.click(screen.getByRole("button", { name: /Northern Traders/ }));
    expect(screen.queryByRole("option", { name: "All parties" })).not.toBeInTheDocument();
  });

  it("marks the chosen option selected and says when nothing matches", async () => {
    const user = userEvent.setup();
    render(
      <SearchSelect value="C001" onChange={() => {}} options={PARTIES} emptyText="No parties" />,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("option", { name: /Northern Traders/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No parties")).toBeInTheDocument();
  });

  it("caps the rows at maxShown and says how many were left out", async () => {
    // The Scheme Manager's product picker faces a catalogue of thousands;
    // its own copy capped at 80 silently. Say so, so a missing product reads
    // as "type more", not "not in the list".
    const user = userEvent.setup();
    const many = Array.from({ length: 30 }, (_, i) => ({
      value: `FG${i}`,
      label: `Product ${i}`,
    }));
    render(<SearchSelect value="" onChange={() => {}} options={many} maxShown={5} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByText(/25 more/)).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "Product 2");
    // "Product 2", "Product 20".."Product 29" = 11 matches, still capped.
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByText(/6 more/)).toBeInTheDocument();
  });

  it("shows a value the options do not contain rather than the placeholder", () => {
    render(<SearchSelect value="FG-GONE" onChange={() => {}} options={PARTIES} placeholder="Pick" />);
    expect(screen.getByRole("button")).toHaveTextContent("FG-GONE");
  });

  it("does nothing while disabled", async () => {
    const user = userEvent.setup();
    render(<SearchSelect value="" onChange={() => {}} options={PARTIES} disabled />);
    await user.click(screen.getByRole("button"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

/**
 * The searchable MultiSelect, added when Page Permissions and Order Flow
 * Settings turned up two more hand-rolled pickers — over every user in the
 * company and every party in SAP respectively, which is why neither could use
 * the plain checkbox list.
 */
describe("MultiSelect, searchable", () => {
  const USERS = [
    { value: 1, label: "Asha Nair", hint: "anair", keywords: "billing" },
    { value: 2, label: "Ravi Kumar", hint: "rkumar", keywords: "auditor" },
    { value: 3, label: "Sunil Rao", hint: "srao", keywords: "billing" },
  ];

  it("matches on the label, the hint and the hidden keywords", async () => {
    const user = userEvent.setup();
    render(<MultiSelect value={[]} onChange={() => {}} options={USERS} searchable />);
    await user.click(screen.getByRole("button"));

    const search = screen.getByRole("searchbox");
    const group = () => screen.getByRole("group");

    await user.type(search, "asha");
    expect(within(group()).getAllByRole("checkbox")).toHaveLength(1);

    // The hint — a username nobody would guess from the display name.
    await user.clear(search);
    await user.type(search, "rkumar");
    expect(within(group()).getByRole("checkbox", { name: /Ravi Kumar/ })).toBeInTheDocument();

    // `keywords` is matched but never rendered: a role, here.
    await user.clear(search);
    await user.type(search, "billing");
    expect(within(group()).getAllByRole("checkbox")).toHaveLength(3); // 2 + Select all
    expect(group()).not.toHaveTextContent("billing");
  });

  /*
   * The rule worth pinning. "Select all" over a FILTERED list must apply to
   * the matches, not to every option — a picker filtered to one party whose
   * select-all quietly chose four thousand would be the worst control in the
   * app. The label says which set it means, too.
   */
  it("selects all MATCHES, not all options, while a search is active", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiSelect value={[]} onChange={onChange} options={USERS} searchable />);
    await user.click(screen.getByRole("button"));

    await user.type(screen.getByRole("searchbox"), "billing");
    const selectAll = screen.getByRole("checkbox", { name: /Select all 2 matches/ });
    await user.click(selectAll);

    // Asha and Sunil — NOT Ravi, who the search excluded.
    expect(onChange).toHaveBeenLastCalledWith([1, 3]);
  });

  it("unticking select-all leaves non-matching choices alone", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // Ravi (2) is already chosen and is NOT a match for "billing".
    render(<MultiSelect value={[1, 2, 3]} onChange={onChange} options={USERS} searchable />);
    await user.click(screen.getByRole("button"));

    await user.type(screen.getByRole("searchbox"), "billing");
    await user.click(screen.getByRole("checkbox", { name: /Select all 2 matches/ }));

    expect(onChange).toHaveBeenLastCalledWith([2]);
  });

  it("caps the list at maxShown and says how many it left out", async () => {
    const user = userEvent.setup();
    render(<MultiSelect value={[]} onChange={() => {}} options={USERS} searchable maxShown={2} />);
    await user.click(screen.getByRole("button"));

    expect(within(screen.getByRole("group")).getAllByRole("checkbox")).toHaveLength(3); // 2 + all
    expect(screen.getByText(/1 more — type to narrow the list/)).toBeInTheDocument();
  });

  it("has no search box unless asked for one", async () => {
    const user = userEvent.setup();
    render(<MultiSelect value={[]} onChange={() => {}} options={USERS} />);
    await user.click(screen.getByRole("button"));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});

/**
 * Where a call site's `className` lands, and why it matters.
 *
 * The panel is `absolute` with `min-w-full`, which resolves against its
 * CONTAINING BLOCK — the root div. `className` used to be merged into the
 * trigger instead, and the trigger is `w-full` inside that root. So
 * `max-w-[420px]` shrank the button and left the root at its parent's full
 * width, and the panel opened as wide as the whole card, left-aligned to the
 * card rather than to the control it hangs from. It looked like the dropdown
 * was overflowing the page.
 */
describe("dropdown width", () => {
  const OPTS = [{ value: "a", label: "Alpha" }];

  it("puts a call site's className on the positioned root, not the trigger", async () => {
    const user = userEvent.setup();
    render(<SearchSelect value="" onChange={() => {}} options={OPTS} className="max-w-[420px]" />);

    const trigger = screen.getByRole("button");
    expect(trigger.className).not.toContain("max-w-[420px]");

    // The root is the trigger's parent AND the panel's offset parent, so
    // constraining it constrains both.
    const root = trigger.parentElement!;
    expect(root.className).toContain("max-w-[420px]");
    expect(root.className).toContain("relative");

    await user.click(trigger);
    expect(screen.getByRole("listbox").closest("div.absolute")?.parentElement).toBe(root);
  });

  it("does the same for MultiSelect", () => {
    render(<MultiSelect value={[]} onChange={() => {}} options={OPTS} className="w-[300px]" />);
    const trigger = screen.getByRole("button");
    expect(trigger.className).not.toContain("w-[300px]");
    expect(trigger.parentElement!.className).toContain("w-[300px]");
  });

  it("gives the panel a width, so a long label cannot widen it past the trigger", async () => {
    const user = userEvent.setup();
    render(
      <SearchSelect
        value=""
        onChange={() => {}}
        options={[{ value: "x", label: "A ludicrously long option label ".repeat(6) }]}
      />,
    );
    await user.click(screen.getByRole("button"));
    // `w-full` pins it to the root; `min-w-full` alone left it shrink-to-fit.
    const panel = screen.getByRole("listbox").closest("div.absolute")!;
    expect(panel.className).toContain("w-full");
  });
});
