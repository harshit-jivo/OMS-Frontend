/**
 * The table primitive, checked on the things a screenshot cannot check.
 *
 * The visual suite (`e2e/routes.visual.spec.ts`) already covers what it LOOKS
 * like, and does it better than any assertion here could. So these tests cover
 * what it MEANS: that the density prop reaches the cells, that the empty state
 * keeps the header, that a caller's class survives the merge.
 *
 * The one thing deliberately not asserted is a padding value. Padding here
 * comes from a Tailwind utility, and jsdom loads no stylesheet — so a test
 * asserting `padding: 16px` would be asserting the class name twice over while
 * proving nothing about the rendered result. That question was settled in the
 * browser instead, and the wrong answer it gave the first time is now guarded
 * by `styles/tailwind.test.ts`.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

function renderTable(props: React.ComponentProps<typeof Table> = {}) {
  return render(
    <Table {...props}>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Amit Kumar</TableCell>
          <TableCell>Active</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("density", () => {
  it("is comfortable unless asked otherwise", () => {
    renderTable();
    expect(screen.getByRole("table")).toHaveAttribute("data-density", "comfortable");
  });

  it("reaches the cells, not just the table element", () => {
    // The cells read density off a context rather than a CSS descendant
    // selector, so that a table nested inside an expanded row can be compact
    // while its parent is not. If the context ever stops being provided the
    // table would still say `data-density="compact"` and every cell would
    // quietly render at the comfortable padding — hence asserting on a cell.
    renderTable({ density: "compact" });

    const cell = screen.getByText("Amit Kumar");
    expect(cell.className).toContain("px-3.5");
    expect(cell.className).not.toContain("px-5");

    const head = screen.getByText("Name");
    expect(head.className).toContain("px-3.5");
  });

  it("gives a nested table its own density", () => {
    render(
      <Table density="comfortable">
        <TableBody>
          <TableRow>
            <TableCell>outer</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Table density="compact">
                <TableBody>
                  <TableRow>
                    <TableCell>inner</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("outer").className).toContain("px-5");
    expect(screen.getByText("inner").className).toContain("px-3.5");
  });
});

describe("the empty state", () => {
  it("keeps the column headers", () => {
    // The reason it lives inside the table at all. Every page this replaces
    // rendered "no records" as a sibling div INSTEAD of the `<table>`, so the
    // headers vanished with the rows — the reader lost the columns at exactly
    // the moment they were trying to work out what was missing.
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty colSpan={2}>No users match your search</TableEmpty>
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("No users match your search")).toBeInTheDocument();
  });

  it("spans the columns it is given", () => {
    render(
      <table>
        <tbody>
          <TableEmpty colSpan={9} />
        </tbody>
      </table>,
    );
    expect(screen.getByRole("cell")).toHaveAttribute("colspan", "9");
  });
});

describe("composition", () => {
  it("keeps a caller's class alongside its own", () => {
    // Pages carry page-specific classes onto cells (`au-name`, `au-muted`)
    // while the primitive owns the layout. `cn()` is tailwind-merge, which
    // drops CONFLICTING utilities — the risk is that it drops something it
    // does not recognise, which is most of this codebase's class names.
    render(
      <table>
        <tbody>
          <tr>
            <TableCell className="au-name">Amit</TableCell>
          </tr>
        </tbody>
      </table>,
    );

    const cell = screen.getByText("Amit");
    expect(cell.className).toContain("au-name");
    expect(cell.className).toContain("align-middle");
  });

  it("lets a caller override a padding it disagrees with", () => {
    // tailwind-merge should keep the LAST conflicting utility. A cell that
    // wants no padding (a nested table, a full-bleed image) has to be able to
    // say so without `!important`.
    render(
      <table>
        <tbody>
          <tr>
            <TableCell className="p-0">Amit</TableCell>
          </tr>
        </tbody>
      </table>,
    );

    const cell = screen.getByText("Amit");
    expect(cell.className).toContain("p-0");
    expect(cell.className).not.toContain("px-5");
    expect(cell.className).not.toContain("py-4");
  });

  it("puts the scroll container around the table, not inside it", () => {
    // 28 of the tables being replaced sit in a hand-written `*-table-wrap` div
    // that exists only for this, and the ones that forgot it scroll the whole
    // page sideways. Owning it here is what lets those wrappers be deleted.
    renderTable();
    const container = screen.getByRole("table").parentElement!;
    expect(container).toHaveAttribute("data-slot", "table-container");
    expect(container.className).toContain("overflow-x-auto");
  });
});

describe("semantics", () => {
  it("renders real table elements, so assistive tech still sees a table", () => {
    // Worth stating: a div-based "table" is the common way a component library
    // loses this, and it is invisible to every other test here.
    renderTable();
    const table = screen.getByRole("table");
    expect(table.tagName).toBe("TABLE");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });
});
