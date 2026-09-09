/**
 * The Scheme Manager page: a header, a filter bar, the scheme list, and the
 * three dialogs (editor, vendor check, the destructive confirm) on top of it.
 *
 * Everything else lives elsewhere — the state, data-fetching and handlers in
 * `useSchemeManager`, the list in `schemeManager/components/SchemeList`, the
 * 4-step editor in `SchemeEditorModal`, and the vendor-check panel in
 * `VendorCheck`. What is left here is composition.
 */
import { HiOutlineMagnifyingGlass, HiOutlinePlus } from "react-icons/hi2";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FilterBar,
  FilterCheckbox,
  FilterCount,
  FilterSearch,
  FilterSelect,
  FilterSpacer,
} from "@/components/ui/filter-bar";
import { Notice, Page, PageHeader } from "@/components/ui/page";

import SchemeEditorModal from "./schemeManager/components/SchemeEditorModal";
import SchemeList from "./schemeManager/components/SchemeList";
import VendorCheck from "./schemeManager/components/VendorCheck";
import { CATEGORIES } from "./schemeManager/schemeManagerHelpers";
import { useSchemeManager } from "./schemeManager/useSchemeManager";

export default function Scheme_Manager() {
  const sm = useSchemeManager();
  const {
    schemes,
    isLoading,
    loadError,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    includeInactive,
    setIncludeInactive,
    loadSchemes,
    notice,
    setNotice,
    itemOptions,
    itemNameOf,
    expandedId,
    setExpandedId,
    deactivate,
    deleteScheme,
    pending,
    setPending,
    confirmPending,
    isConfirming,
    checkOpen,
    setCheckOpen,
    openNew,
  } = sm;

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Schemes" }, { label: "Schemes" }]} />

      <PageHeader
        title="Schemes"
        description="An offer: what a vendor has to buy, and what they get free."
        actions={
          <>
            <Button variant="ghost" onClick={() => setCheckOpen(true)}>
              <HiOutlineMagnifyingGlass aria-hidden="true" /> Check a vendor
            </Button>
            <Button variant="primary" onClick={openNew}>
              <HiOutlinePlus aria-hidden="true" /> New scheme
            </Button>
          </>
        }
      />

      {notice ? (
        <Notice tone="ok" className="flex items-center justify-between gap-3">
          {notice}
          <Button variant="link" size="inline" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </Notice>
      ) : null}

      <FilterBar>
        <FilterSearch
          label="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void loadSchemes()}
          onBlur={() => void loadSchemes()}
          placeholder="Name or code"
          fieldClassName="min-w-[220px]"
        />
        <FilterSelect
          label="Category"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            void loadSchemes({ category: event.target.value });
          }}
          fieldClassName="max-w-[200px]"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterSelect>
        <FilterCheckbox
          label="Show turned-off"
          checked={includeInactive}
          onChange={(event) => {
            setIncludeInactive(event.target.checked);
            void loadSchemes({ includeInactive: event.target.checked });
          }}
        />
        <FilterSpacer />
        {!isLoading && !loadError ? (
          <FilterCount>
            {schemes.length} {schemes.length === 1 ? "scheme" : "schemes"}
          </FilterCount>
        ) : null}
      </FilterBar>

      <SchemeList
        schemes={schemes}
        isLoading={isLoading}
        loadError={loadError}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        itemNameOf={itemNameOf}
        openNew={openNew}
        openEdit={sm.openEdit}
        deleteScheme={deleteScheme}
        deactivate={deactivate}
        loadSchemes={() => void loadSchemes()}
      />

      <SchemeEditorModal sm={sm} />

      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent title="Check a vendor" size="lg">
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>Check a vendor</DialogTitle>
              <DialogDescription>
                What reaches them, and what a line would actually give. Nothing is saved.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody>
            <VendorCheck itemOptions={itemOptions} itemNameOf={itemNameOf} />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* The destructive confirm. Was `window.confirm`. */}
      <Dialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next && !isConfirming) setPending(null);
        }}
      >
        {pending ? (
          <DialogContent
            title={pending.kind === "delete" ? "Delete scheme" : "Turn scheme off"}
            size="sm"
          >
            <DialogHeader>
              <DialogTitle>
                {pending.kind === "delete" ? "Delete" : "Turn off"} {pending.scheme.name}?
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="m-0 text-[13px] text-body">
                {pending.kind === "delete"
                  ? "This cannot be undone. If any order has already used it, the server will refuse — turn it off instead."
                  : "It stops applying everywhere. You can turn it back on from the editor."}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setPending(null)} disabled={isConfirming}>
                Cancel
              </Button>
              <Button
                variant={pending.kind === "delete" ? "danger" : "primary"}
                onClick={() => void confirmPending()}
                disabled={isConfirming}
              >
                {isConfirming
                  ? "Working…"
                  : pending.kind === "delete"
                    ? "Delete scheme"
                    : "Turn off"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Page>
  );
}
