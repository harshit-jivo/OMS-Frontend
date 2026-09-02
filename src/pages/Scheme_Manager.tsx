/**
 * The Scheme Manager page: a header, a toolbar, the scheme list, and the two
 * modals (editor, vendor check) that sit on top of it.
 *
 * Everything else moved out in Phase 4 — the state, data-fetching and
 * handlers into `useSchemeManager`, the list row markup (now virtualized)
 * into `schemeManager/components/SchemeList`, the 4-step editor into
 * `SchemeEditorModal`, and the vendor-check panel into `VendorCheck`. What is
 * left here is composition: the page chrome that belongs to none of them.
 */
import SchemeEditorModal from "./schemeManager/components/SchemeEditorModal";
import SchemeList from "./schemeManager/components/SchemeList";
import { SearchIcon } from "./schemeManager/components/icons";
import VendorCheck from "./schemeManager/components/VendorCheck";
import { CATEGORIES } from "./schemeManager/schemeManagerHelpers";
import { useSchemeManager } from "./schemeManager/useSchemeManager";
import "../styles/Scheme_Manager.css";

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
    products,
    itemNameOf,
    expandedId,
    setExpandedId,
    deactivate,
    deleteScheme,
    checkOpen,
    setCheckOpen,
    editingId,
    openNew,
  } = sm;

  return (
    <div className="sch-page app-page">
      {/* ---- header -------------------------------------------------- */}
      <header className="sch-head">
        <h1>Schemes</h1>
        <div className="sch-head-actions">
          <button type="button" className="sch-btn" onClick={() => setCheckOpen(true)}>
            Check a vendor
          </button>
          <button type="button" className="sch-btn-primary" onClick={openNew}>
            + New scheme
          </button>
        </div>
      </header>

      {notice && (
        <div className={`sch-notice ${notice.tone}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {/* ---- toolbar ------------------------------------------------- */}
      <div className="sch-toolbar">
        <div className="sch-search">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && loadSchemes()}
            onBlur={() => loadSchemes()}
            placeholder="Search schemes..."
            aria-label="Search schemes"
          />
        </div>
        <select
          className="sch-select sch-toolbar-select"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            void loadSchemes({ category: event.target.value });
          }}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="sch-check">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => {
              setIncludeInactive(event.target.checked);
              void loadSchemes({ includeInactive: event.target.checked });
            }}
          />
          Show turned-off
        </label>
      </div>

      {/* ---- list ---------------------------------------------------- */}
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

      {/* ---- editor modal -------------------------------------------- */}
      {editingId !== null && <SchemeEditorModal sm={sm} />}

      {/* ---- vendor check modal -------------------------------------- */}
      {checkOpen && (
        <>
          <div className="sch-scrim" onClick={() => setCheckOpen(false)} />
          <div className="sch-modal" role="dialog" aria-modal="true" aria-labelledby="sch-vendor-check-title">
            <div className="sch-modal-head">
              <div>
                <h2 id="sch-vendor-check-title">Check a vendor</h2>
                <p>What reaches them, and what a line would actually give. Nothing is saved.</p>
              </div>
              <button
                type="button"
                className="sch-x"
                onClick={() => setCheckOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="sch-modal-body">
              <VendorCheck products={products} itemNameOf={itemNameOf} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
