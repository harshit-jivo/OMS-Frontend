import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { Card, CardHeader, CardTitle, Page, PageHeader, Stat, StatRow } from "./page";

/**
 * The page shell.
 *
 * What is pinned here is mostly semantics rather than looks: the title is the
 * page's `h1`, the actions are a slot that cannot be reordered into the title
 * block, and a `Stat` colours only its number.
 */

describe("PageHeader", () => {
  it("renders the title as the page heading", () => {
    render(<PageHeader title="View Orders" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "View Orders" }),
    ).toBeInTheDocument();
  });

  it("renders description and eyebrow when given", () => {
    render(
      <PageHeader
        eyebrow="Orders"
        title="View Orders"
        description="Browse, review and export your order history."
      />,
    );

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText(/Browse, review and export/)).toBeInTheDocument();
  });

  it("omits the description and eyebrow entirely when not given", () => {
    // Not an empty <p> holding a gap open.
    const { container } = render(<PageHeader title="Bare" />);

    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("keeps actions out of the title block", () => {
    render(
      <PageHeader
        title="View Orders"
        actions={<Button variant="primary">New order</Button>}
      />,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    const action = screen.getByRole("button", { name: "New order" });
    expect(heading.contains(action)).toBe(false);
  });

  it("runs its actions at the chrome height, whatever size the caller asked", () => {
    // `ui/button`'s default is 40px because that is the app's FIELD height —
    // a button beside an input has to line up with it. A page header has no
    // inputs, and four 40px buttons with icons read as a toolbar of tiles.
    //
    // Imposed by the header rather than left to `size="xs"` at every call
    // site, so converting the next page cannot forget it. It is the same
    // `--spacing-control-xs` the filter bar uses, so a page's furniture is
    // one height throughout.
    const { container } = render(
      <PageHeader title="Order" actions={<Button variant="primary">Approve</Button>} />,
    );

    const row = container.querySelector("[data-slot='button']")?.parentElement;
    expect(row?.className).toContain("[&_[data-slot=button]]:h-control-xs");
  });
});

describe("Stat", () => {
  it("shows its label and value", () => {
    render(<Stat label="Total orders" value={128} />);

    expect(screen.getByText("Total orders")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
  });

  it("is neutral unless a tone is asked for", () => {
    // A row of six coloured cards is a chart nobody asked for.
    const { container } = render(<Stat label="Total" value={1} />);

    expect(container.querySelector("[data-slot='stat']")).toHaveAttribute(
      "data-tone",
      "neutral",
    );
  });

  it("colours the number, never the card", () => {
    const { container } = render(<Stat label="Failed" value={3} tone="bad" />);

    const card = container.querySelector("[data-slot='stat']") as HTMLElement;
    expect(card.className).not.toContain("bg-bad");
    expect(screen.getByText("3").className).toContain("text-bad");
  });

  it("renders an optional hint", () => {
    render(<Stat label="Pending" value={4} hint="awaiting approval" />);

    expect(screen.getByText("awaiting approval")).toBeInTheDocument();
  });

  it("puts the icon in a tinted chip matching the tone", () => {
    // EXIM's SummaryCard shape: the chip is most of what makes a KPI row look
    // considered rather than bare.
    const Icon = (props: { className?: string }) => <svg {...props} />;
    const { container } = render(
      <Stat label="Rejected" value={3} tone="bad" icon={Icon} />,
    );

    const chip = container.querySelector("span.grid") as HTMLElement;
    expect(chip.className).toContain("bg-red-50");
    expect(chip.querySelector("svg")).toBeInTheDocument();
  });

  it("renders without an icon, so a page need not invent one", () => {
    // A row of arbitrary glyphs is worse than none.
    const { container } = render(<Stat label="Orders" value={7} />);

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows a placeholder while the number is loading", () => {
    const { container } = render(<Stat label="Orders" value={0} loading />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("StatRow", () => {
  it("lays its stats out in one auto-fitting row", () => {
    const { container } = render(
      <StatRow>
        <Stat label="A" value={1} />
        <Stat label="B" value={2} />
        <Stat label="C" value={3} />
      </StatRow>,
    );

    const row = container.querySelector("[data-slot='stat-row']") as HTMLElement;
    // auto-fit, so three KPIs and six both look deliberate with no media query.
    expect(row.className).toContain("auto-fit");
    expect(container.querySelectorAll("[data-slot='stat']")).toHaveLength(3);
  });
});

describe("Card", () => {
  it("renders a titled section", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <p>body</p>
      </Card>,
    );

    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("uses the light card elevation, not the heavy panel shadow", () => {
    // `--shadow-panel` is the old page-header slab (18px blur); a grid of six
    // cards wearing it looks like six floating panels.
    const { container } = render(<Card>lifted</Card>);

    const card = container.querySelector("[data-slot='card']") as HTMLElement;
    expect(card.className).toContain("border-line");
    expect(card.className).toContain("shadow-card");
    expect(card.className).not.toContain("shadow-panel");
  });
});

describe("Page", () => {
  it("carries the converted-page reset, or every control renders at 18px", () => {
    // `index.css` sets `button, input, select, textarea { font: inherit }`
    // UNLAYERED, and `inherit` resolves to `:root { font: 18px/145% }`.
    // Unlayered CSS beats every cascade layer regardless of specificity, so
    // that rule outranks `text-[13px]` and every control on a converted page
    // rendered at eighteen pixels — the utility in the DOM, doing nothing.
    //
    // `.tw-page` reverts those declarations to the layer below, which is
    // where the utilities live. `styles/tailwind.css` has shipped the fix
    // since Phase 1; `Page` is the root it is meant to go on, and for four
    // pages it was simply never added. Measured, not guessed:
    // `getComputedStyle` on a header button returned `fontSize: 18px`.
    const { container } = render(<Page>body</Page>);

    expect(container.firstElementChild?.className).toContain("tw-page");
  });

  it("carries the shared page frame so a stylesheet does not have to", () => {
    const { container } = render(<Page>content</Page>);

    const page = container.querySelector("[data-slot='page']") as HTMLElement;
    expect(page.className).toContain("min-h-[calc(100svh-64px)]");
    expect(page.className).toContain("space-y-4");
  });

  it("is transparent, because the app shell paints the background", () => {
    // `.content-area` (Sidebar.css) has `background: white` and 75px of
    // navbar padding. A page that paints its own canvas leaves that padding
    // showing as a white band across the top of the screen — which is exactly
    // what happened. The shell paints instead, via a `:has()` rule.
    const { container } = render(<Page>content</Page>);

    const page = container.querySelector("[data-slot='page']") as HTMLElement;
    expect(page.className).toContain("bg-transparent");
    expect(page.className).not.toContain("bg-canvas");
  });

  it("carries the data-slot the shell's :has() rule keys on", () => {
    // If this attribute is renamed, the background silently stops being
    // painted and the white band comes back.
    const { container } = render(<Page>content</Page>);

    expect(container.querySelector("[data-slot='page']")).toBeInTheDocument();
  });
});

/**
 * The Card must not clip what a control inside it opens.
 *
 * `shimmer-hover` used to set `overflow: hidden` so its sweep could be clipped
 * by the card. `Card` carries `shimmer-hover` on every instance, so that made
 * EVERY card in the app a clipping box — and a `SearchSelect` or
 * `MultiSelect` opened inside one had its panel cut off at the card's edge.
 * The picker looked broken; the cause was a decoration in `tailwind.css`.
 *
 * The sweep is animated with `background-position` now and never leaves its
 * own box, so nothing needs clipping. This asserts the class is still applied
 * (the effect is intact) and that a stylesheet change cannot quietly bring the
 * clipping back.
 */
describe("Card clipping", () => {
  it("keeps the shimmer, and never sets overflow-hidden itself", () => {
    render(<Card data-testid="c">body</Card>);
    const card = screen.getByTestId("c");
    expect(card.className).toContain("shimmer-hover");
    expect(card.className).not.toContain("overflow-hidden");
  });

  it("lets a call site opt INTO clipping, for a table's rounded corners", () => {
    render(
      <Card className="overflow-hidden p-0" data-testid="c">
        body
      </Card>,
    );
    expect(screen.getByTestId("c").className).toContain("overflow-hidden");
  });
});

/**
 * The source of the bug above, pinned where it lives.
 *
 * Reading the stylesheet as text is the only way to assert this: jsdom applies
 * no Tailwind, so `getComputedStyle` on a rendered Card says nothing about
 * what `.shimmer-hover` declares.
 */
/**
 * `index.css` carries an UNLAYERED `p { margin: 0 }`, and unlayered CSS beats
 * every cascade layer — so `mb-4` on a paragraph inside a converted page
 * computed to 0px. 166 margin utilities across 42 files sat in the DOM doing
 * nothing, every one written by someone who expected a gap.
 *
 * `.tw-page p { margin: revert-layer }` is the fix, and it is the same
 * mechanism the headings above it use. Asserted against the stylesheet text
 * because jsdom applies no Tailwind and no cascade layers.
 */
describe("the converted-page reset covers <p>", () => {
  it("hands paragraph margins back to the utilities layer", () => {
    const css = readFileSync(join(__dirname, "../../styles/tailwind.css"), "utf8");
    const start = css.indexOf(".tw-page p {");
    expect(start, ".tw-page p not found — margin utilities on <p> are inert without it").toBeGreaterThan(-1);
    expect(css.slice(start, css.indexOf("}", start))).toContain("margin: revert-layer");
  });

  it("still resets headings and controls", () => {
    // The rule above was ADDED beside these, not instead of them.
    const css = readFileSync(join(__dirname, "../../styles/tailwind.css"), "utf8");
    expect(css).toContain(".tw-page :is(h1, h2, h3, h4, h5, h6)");
    expect(css).toContain(".tw-page :is(input, select, button, textarea)");
  });
});

describe("the shimmer utility", () => {
  it("does not clip its host, because every Card wears it", () => {
    const css = readFileSync(join(__dirname, "../../styles/tailwind.css"), "utf8");
    const start = css.indexOf(".shimmer-hover {");
    expect(start, ".shimmer-hover not found — did it move?").toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toContain("position: relative");
    expect(block).not.toContain("overflow: hidden");
  });
});
