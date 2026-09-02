/**
 * Dialog — the modal primitive, and the one that fixes behaviour rather than
 * looks.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE HAND-ROLLED MODALS GET WRONG
 * ─────────────────────────────────────────────────────────────────────────
 * There are 44 of them across 39 files, and they are all the same six lines:
 *
 *     <div className="x-modal-overlay" onClick={close}>
 *       <div className="x-modal" onClick={(e) => e.stopPropagation()}>
 *
 * That gives you a backdrop and a click-outside. It does not give you:
 *
 *   * **Escape.** Seven of the 39 files listen for it. The other 32 leave a
 *     keyboard user with no way out of the dialog but the mouse.
 *   * **Focus trapping.** Tab walks straight out of the dialog and into the
 *     page behind it — which is still there, still scrollable, still
 *     clickable to a screen reader. Nothing announces the dialog at all.
 *   * **Focus restoration.** Close the dialog and focus lands back on
 *     `<body>`, so the next Tab starts from the top of the sidebar.
 *   * **Scroll lock.** The page behind scrolls under the overlay.
 *   * **`aria-modal` / labelling.** A screen reader is told nothing: not that
 *     a dialog opened, not what it is for.
 *
 * Each of those is a few lines to write and easy to write subtly wrong — the
 * focus trap especially, which has to handle Shift+Tab, elements that become
 * focusable while the dialog is open, and nested dialogs. This wraps
 * `@radix-ui/react-dialog`, which does all of it and is the runtime shadcn's
 * own Dialog uses, rather than making that mistake a 45th time.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE PARTS ARE SHAPED LIKE THIS
 * ─────────────────────────────────────────────────────────────────────────
 * `DialogHeader` / `DialogBody` / `DialogFooter` mirror the head/body/foot
 * split that 13 of the tracker modals and most of the rest already use, so a
 * conversion is a tag rename rather than a re-layout. `DialogBody` is the only
 * scrolling part; the header and footer stay put, which is what the sticky
 * positioning in `Tracker.css` was hand-building.
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { LuX } from "react-icons/lu";

import { cn } from "@/lib/utils";

/*
 * Wrappers, not `export const Dialog = DialogPrimitive.Root`.
 *
 * Identical at runtime — every prop is forwarded, and under React 19 `ref` is
 * one of those props — but a re-exported member expression is not statically a
 * component, so Fast Refresh could not hot-update this module and
 * `react-refresh/only-export-components` reported all four. Same shape as
 * `DialogOverlay` and `DialogContent` below.
 */
export function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />;
}

export function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />;
}

/**
 * Sizes are the ones already in the CSS, not invented: `max-width: 640px` is
 * the tracker modals, 480px the confirm boxes, 960px the line-item pickers.
 */
/**
 * `variant: "bare"` exists for the conversion, not for new code.
 *
 * 44 modals are being moved onto this primitive, and most of them have a panel
 * stylesheet of their own — `.ir-modal`, `.db-sales-modal`, `.ao-track-modal`
 * — that already sets the width, padding, radius and inner layout. Imposing
 * `flex flex-col` on markup written for a block container reflows it, and
 * imposing `max-h-[88vh]` on a panel that manages its own scrolling gives it
 * two scroll containers.
 *
 * So `bare` keeps ONLY what Radix needs to place the panel — the centring —
 * and leaves everything else to the existing class. The behaviour that Phase
 * 2.3 is actually for (focus trap, Escape, scroll lock, an accessible name) is
 * a property of `Dialog`, not of these classes, so a bare conversion still
 * gets all of it. `panel` is what new dialogs should use.
 */
const contentVariants = cva(
  [
    "fixed left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2",
    "focus:outline-none",
    // The open animation is a plain keyframe in tailwind.css rather than the
    // `animate-in` utilities: those come from `tailwindcss-animate`, which is
    // not installed, so writing them here would emit nothing and read as if
    // it did. Playwright disables animations, so this cannot flake a baseline.
    "motion-safe:animate-[dialog-pop_0.16s_cubic-bezier(0.2,0.9,0.3,1.2)]",
  ],
  {
    variants: {
      variant: {
        panel: [
          "flex max-h-[88vh] w-[calc(100%-2rem)] flex-col",
          "rounded-2xl bg-white shadow-panel",
        ],
        bare: "",
      },
      size: {
        sm: "max-w-[480px]",
        md: "max-w-[640px]",
        lg: "max-w-[820px]",
        xl: "max-w-[960px]",
        /** The legacy class decides — used with `variant="bare"`. */
        auto: "",
      },
    },
    defaultVariants: { variant: "panel", size: "md" },
  },
);

export type DialogSize = NonNullable<VariantProps<typeof contentVariants>["size"]>;

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-[1000] bg-ink/50 backdrop-blur-[2px]", className)}
      {...props}
    />
  );
}

/**
 * `title` is required, and it is ALWAYS the accessible name — rendered once,
 * screen-reader-only, before anything the caller passes.
 *
 * The alternative (let the visible heading be the accessible name) is what
 * shadcn does, and it makes the name a property of whatever markup the header
 * happens to contain: a heading with a badge and a count in it announces
 * "Invoice timeline PENDING 3". Splitting them means the name is one plain
 * string the caller states outright, and the visible header can be as
 * elaborate as the design needs. `DialogTitle` below is therefore a styled
 * `h3`, not a second source of the name.
 */
export function DialogContent({
  className,
  children,
  size,
  variant,
  title,
  description,
  showClose = true,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof contentVariants> & {
    title: string;
    description?: string;
    showClose?: boolean;
    /**
     * Styling for the backdrop, for the same reason `variant="bare"` exists:
     * some legacy overlays are not decoration. The busy overlays on the order
     * pages use a heavier, blurred backdrop deliberately — it is how the screen
     * says "you are blocked while this posts to SAP" — and flattening them to
     * the default would weaken a signal the design was making on purpose.
     */
    overlayClassName?: string;
  }) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(contentVariants({ variant, size }), className)}
        {...props}
      >
        {/*
          asChild + a span, because Radix's Title renders `Primitive.h2`. Without
          it every dialog that ALSO shows a visible heading puts two headings with
          the same text in the accessibility tree, and a screen-reader user walking
          by heading hears the title twice. The element only has to carry the
          `aria-labelledby` target — it does not have to be a heading to do that.
        */}
        <DialogPrimitive.Title asChild>
          <span className="sr-only">{title}</span>
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Close"
            className={cn(
              "absolute right-4 top-4 rounded-md p-1.5 text-subtle",
              "transition-colors hover:bg-surface-strong hover:text-ink",
              "focus-visible:outline-none focus-visible:shadow-focus",
            )}
          >
            <LuX aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * The visible heading. Separate from `DialogContent`'s `title` prop because a
 * dialog may want a heading plus a subtitle, a badge or a row of actions
 * beside it — which most of these do — while the accessible name stays one
 * plain string.
 */
export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 items-center justify-between gap-3",
        "border-b border-line px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}

/** The VISIBLE heading. The accessible name is `DialogContent`'s `title`. */
export function DialogTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="dialog-title"
      className={cn("text-[17px] font-bold text-ink", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-[13px] text-subtle", className)}
      {...props}
    />
  );
}

/** The only scrolling part — the header and footer stay put. */
export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 items-center justify-end gap-2.5",
        "border-t border-line px-6 py-3.5",
        className,
      )}
      {...props}
    />
  );
}
