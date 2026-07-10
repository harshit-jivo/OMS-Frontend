import { useEffect, useMemo, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { saveAs } from "file-saver";
import {
  HiArrowDownTray,
  HiArrowPath,
  HiArrowUpTray,
  HiBanknotes,
  HiBeaker,
  HiCheckBadge,
  HiCheckCircle,
  HiChevronDown,
  HiCube,
  HiDocumentText,
  HiExclamationTriangle,
  HiInformationCircle,
  HiMinusCircle,
  HiShieldCheck,
  HiSparkles,
} from "react-icons/hi2";
import { apiFetch, apiUpload, resolveApiUrl } from "./SalesInvoice/useSalesInvoice";
import "../styles/Label_Checker.css";

/* ──────────────────────────────────────────────────────────────────────────
 * Label Checker (Legal)
 *
 * Upload a product-label PDF; the backend (/api/legal/upload/) rasterises it and
 * runs it through Gemini, returning the extracted statutory parameters. The page
 * presents those findings as a flat, full-width compliance report: a three-metric
 * summary, a single missing-declaration banner, category tabs, and the parameters
 * grouped into collapsible sections. The upload + API contract is unchanged.
 * ────────────────────────────────────────────────────────────────────────── */

const UPLOAD_URL = resolveApiUrl("/api/legal/upload/");
const ITEMS_URL = resolveApiUrl("/api/legal/item/");
const MAX_BYTES = 20 * 1024 * 1024;

type Confidence = "high" | "medium" | "low" | string;
type Status = "OK" | "MISSING" | "MISMATCH" | "NOT_APPLICABLE" | string;
type Parameter = { value: unknown; status?: Status; confidence?: Confidence; notes?: string };
type LegalResult = { file?: string; parameters?: Record<string, Parameter> };
type Entry = [string, Parameter];
type LegalItem = { id: number; item_name: string; created_at?: string };
type StatusKind = "ok" | "missing" | "mismatch" | "na";

/* ── Labels / formatting (sentence case) ──────────────────────────────────── */

const LABEL_OVERRIDES: Record<string, string> = {
  food_name: "Food name",
  product_category: "Product category",
  veg_nonveg: "Veg / non-veg mark",
  date_of_mfg: "Date of manufacture",
  expiry_date: "Expiry / use by",
  importer_country_of_origin: "Importer & country of origin",
  manufacturer_packer_details: "Manufacturer / packer details",
  batch_lot_number: "Batch / lot number",
  unit_sale_price: "Unit sale price",
  packaging_epr: "Packaging & EPR",
  illustration_disclaimer: "Illustration disclaimer",
  fssai_details: "FSSAI details",
  serving_details: "Serving details",
  nutritional_facts: "Nutritional facts",
  jivo_trademark: "Trademark",
  iso_certification: "ISO certification",
  cost_block: "Pricing & batch details",
  compliance_section: "Certifications & EPR",
  footnote_signs: "Footnote symbols",
};
const ACRONYMS = new Set(["mrp", "fssai", "epr", "iso", "mufa", "pufa", "usp"]);

const sentenceCase = (words: string[]): string =>
  words
    .filter(Boolean)
    .map((word, index) =>
      ACRONYMS.has(word.toLowerCase()) || /^[A-Z0-9]{2,}$/.test(word)
        ? word.toUpperCase()
        : index === 0
          ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          : word.toLowerCase(),
    )
    .join(" ");

const prettifyKey = (key: string): string => {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  if (/\s/.test(key)) return key; // already a human phrase
  return sentenceCase(key.split(/[_\s]+/));
};

// Sub-keys inside object values (e.g. cost_block) arrive as camelCase or
// snake_case ("PackagingDate", "EPR_Owner") — split both before sentence-casing.
const prettifySubKey = (key: string): string =>
  sentenceCase(key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[_\s]+/));

const confidenceKey = (value?: Confidence): "high" | "medium" | "low" | "na" => {
  const v = (value ?? "").toString().toLowerCase();
  if (v === "high") return "high";
  if (v === "medium" || v === "med") return "medium";
  if (v === "low") return "low";
  return "na";
};

const confidenceScore = (value?: Confidence): number =>
  ({ high: 0.97, medium: 0.8, low: 0.6, na: 0 })[confidenceKey(value)];

const confidencePct = (value?: Confidence): number => Math.round(confidenceScore(value) * 100);

// Per-row confidence is shown only on hover, via this tooltip string.
const confidenceLabel = (value?: Confidence): string | undefined => {
  const key = confidenceKey(value);
  if (key === "na") return undefined;
  return `${key.charAt(0).toUpperCase()}${key.slice(1)} confidence · ${confidencePct(value)}%`;
};

const isBlank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

// The backend now classifies each parameter with an explicit status. Fall back to
// the value (blank ⇒ missing) for older payloads that don't send one.
const statusKind = (param: Parameter): StatusKind => {
  const s = (param.status ?? "").toString().toUpperCase().replace(/[\s/]+/g, "_");
  if (s === "OK" || s === "PASS") return "ok";
  if (s === "MISSING") return "missing";
  if (s === "MISMATCH") return "mismatch";
  if (s === "NOT_APPLICABLE" || s === "NA" || s === "N_A") return "na";
  if (s) return "ok"; // unknown but present status → treat as an informational pass
  return isBlank(param.value) ? "missing" : "ok";
};

const isIssue = (kind: StatusKind): boolean => kind === "missing" || kind === "mismatch";

const STATUS_PILL: Record<StatusKind, { label: string; cls: string } | null> = {
  ok: null,
  missing: { label: "Missing", cls: "lc-pill-warn" },
  mismatch: { label: "Mismatch", cls: "lc-pill-warn" },
  na: { label: "Not applicable", cls: "lc-pill-muted" },
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;
const isPdf = (file: File): boolean => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
const slug = (title: string): string => `lc-sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

const SECTION_DEFS: { title: string; icon: IconType; keys: string[] }[] = [
  { title: "Product information", icon: HiCube, keys: ["food_name", "product_category", "veg_nonveg", "barcode"] },
  { title: "Ingredients & nutrition", icon: HiBeaker, keys: ["ingredients", "serving_details", "nutritional_facts"] },
  {
    title: "Regulatory compliance",
    icon: HiShieldCheck,
    keys: ["fssai_details", "manufacturer_packer_details", "importer_country_of_origin", "packaging_epr"],
  },
  {
    title: "Commercial information",
    icon: HiBanknotes,
    keys: ["cost_block", "mrp", "unit_sale_price", "batch_lot_number", "date_of_mfg", "expiry_date"],
  },
  {
    title: "Additional claims",
    icon: HiCheckBadge,
    keys: [
      "compliance_section",
      "iso_certification",
      "jivo_trademark",
      "illustration_disclaimer",
      "footnote_signs",
    ],
  },
];

const TABS: { label: string; section: string }[] = [
  { label: "Product info", section: "Product information" },
  { label: "Ingredients & nutrition", section: "Ingredients & nutrition" },
  { label: "Regulatory", section: "Regulatory compliance" },
  { label: "Claims", section: "Additional claims" },
];

const ANALYSING_STEPS = [
  "Converting PDF pages to images…",
  "Reading the label artwork…",
  "Extracting statutory declarations…",
  "Checking nutritional information…",
  "Compiling the compliance report…",
];

/* ── Value + rows ─────────────────────────────────────────────────────────── */

function FieldValue({ value }: { value: unknown }) {
  if (isBlank(value)) {
    return <span className="lc-value lc-value-missing">Not declared on label</span>;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
    return <span className="lc-value">{`${value.length} entries`}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <div className="lc-chips">
        {value.map((entry, index) => (
          <span className="lc-chip" key={index}>
            {String(entry)}
          </span>
        ))}
      </div>
    );
  }
  // Object value (e.g. cost_block, compliance_section) → key/value list.
  if (typeof value === "object" && value !== null) {
    return (
      <dl className="lc-kv">
        {Object.entries(value as Record<string, unknown>).map(([subKey, subValue]) => (
          <div key={subKey}>
            <dt>{prettifySubKey(subKey)}</dt>
            <dd>{isBlank(subValue) ? "—" : String(subValue)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="lc-value">{String(value)}</span>;
}

const ROW_ICON: Record<StatusKind, { cls: string; icon: IconType }> = {
  ok: { cls: "ok", icon: HiCheckCircle },
  missing: { cls: "warn", icon: HiExclamationTriangle },
  mismatch: { cls: "warn", icon: HiExclamationTriangle },
  na: { cls: "na", icon: HiMinusCircle },
};

function InfoRow({ fieldKey, param }: { fieldKey: string; param: Parameter }) {
  const kind = statusKind(param);
  const { cls, icon: Icon } = ROW_ICON[kind];
  const pill = STATUS_PILL[kind];
  return (
    <div className={`lc-row${kind !== "ok" ? ` is-${kind}` : ""}`} title={confidenceLabel(param.confidence)}>
      <span className={`lc-row-icon lc-row-icon-${cls}`} aria-hidden="true">
        <Icon />
      </span>
      <div className="lc-row-text">
        <span className="lc-row-label">
          {prettifyKey(fieldKey)}
          {pill && <span className={`lc-pill ${pill.cls}`}>{pill.label}</span>}
        </span>
        <FieldValue value={param.value} />
        {param.notes && <span className="lc-row-note">{param.notes}</span>}
      </div>
    </div>
  );
}

// Render a numeric nutrition cell; a negative DB value is the backend's sentinel
// for "no reference figure", so show it as a dash rather than "-1".
const nutriNum = (value: unknown): string => {
  if (isBlank(value)) return "—";
  if (typeof value === "number") return value < 0 ? "—" : String(value);
  return String(value);
};

// Read the first present, non-blank key from a row (0 counts as present).
const pickField = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) if (key in row && !isBlank(row[key])) return row[key];
  return undefined;
};

function NutritionTable({ param }: { param: Parameter }) {
  const rows = (Array.isArray(param.value) ? param.value : []) as Array<Record<string, unknown>>;
  // Rows now compare the label's figures against a reference database. Show the
  // comparison columns when DB figures are present; otherwise fall back to a
  // plain label-only table for older payloads.
  const hasDb = rows.some((row) => "db_per_100g" in row || "db_per_serving" in row);
  const columns: { head: string; get: (row: Record<string, unknown>) => string }[] = hasDb
    ? [
        { head: "Nutrient", get: (row) => String(pickField(row, ["nutrition_name", "nutrient", "name"]) ?? "—") },
        { head: "Label / 100g", get: (row) => nutriNum(pickField(row, ["label_per_100g", "per_100g", "per100g"])) },
        { head: "DB / 100g", get: (row) => nutriNum(pickField(row, ["db_per_100g"])) },
        { head: "Label / serving", get: (row) => nutriNum(pickField(row, ["label_per_serving", "per_serving"])) },
        { head: "DB / serving", get: (row) => nutriNum(pickField(row, ["db_per_serving"])) },
      ]
    : [
        { head: "Nutrient", get: (row) => String(pickField(row, ["nutrition_name", "nutrient", "name"]) ?? "—") },
        { head: "Per serving", get: (row) => nutriNum(pickField(row, ["label_per_serving", "per_serving"])) },
        { head: "Per 100g", get: (row) => nutriNum(pickField(row, ["label_per_100g", "per_100g", "per100g"])) },
      ];
  const hasStatus = rows.some((row) => "status" in row);
  const kind = statusKind(param);
  const { cls, icon: Icon } = ROW_ICON[kind];
  return (
    <div className={`lc-row lc-row-nutrition${kind !== "ok" ? ` is-${kind}` : ""}`}>
      <span className={`lc-row-icon lc-row-icon-${cls}`} aria-hidden="true">
        <Icon />
      </span>
      <div className="lc-row-text">
        <span className="lc-row-label">
          Nutritional facts
          {STATUS_PILL[kind] && <span className={`lc-pill ${STATUS_PILL[kind]!.cls}`}>{STATUS_PILL[kind]!.label}</span>}
        </span>
        <div className="lc-nutri-wrap">
          <table className="lc-nutri">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.head}>{col.head}</th>
                ))}
                {hasStatus && <th>Status</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowKind = statusKind({ value: row.nutrition_name, status: row.status as Status });
                const rowPill = STATUS_PILL[rowKind];
                return (
                  <tr key={index} className={rowKind === "mismatch" ? "is-mismatch" : undefined} title={String(row.notes ?? "")}>
                    {columns.map((col) => (
                      <td key={col.head}>{col.get(row)}</td>
                    ))}
                    {hasStatus && (
                      <td>
                        <span className={`lc-nutri-flag lc-flag-${rowKind}`}>{rowPill ? rowPill.label : "Pass"}</span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {param.notes && <span className="lc-row-note">{param.notes}</span>}
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  entries,
  open,
  onToggle,
}: {
  title: string;
  icon: IconType;
  entries: Entry[];
  open: boolean;
  onToggle: () => void;
}) {
  const kinds = entries.map(([, param]) => statusKind(param));
  const issues = kinds.filter(isIssue).length;
  const applicable = kinds.filter((kind) => kind !== "na").length;
  const passed = kinds.filter((kind) => kind === "ok").length;
  return (
    <section className={`lc-section${open ? " is-open" : ""}`} id={slug(title)}>
      <button type="button" className="lc-section-head" onClick={onToggle} aria-expanded={open}>
        <span className="lc-section-name">
          <span className="lc-section-icon" aria-hidden="true">
            <Icon />
          </span>
          {title}
        </span>
        <span className="lc-section-right">
          <span className={`lc-badge ${issues > 0 ? "lc-badge-warn" : "lc-badge-ok"}`}>
            {issues > 0 ? `${issues} ${issues === 1 ? "issue" : "issues"}` : `${passed} / ${applicable} passed`}
          </span>
          <HiChevronDown className="lc-section-caret" aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="lc-section-body">
          {entries.map(([key, param]) =>
            key === "nutritional_facts" ? (
              <NutritionTable key={key} param={param} />
            ) : (
              <InfoRow key={key} fieldKey={key} param={param} />
            ),
          )}
        </div>
      )}
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function LabelChecker() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "analysing" | "done" | "error">("idle");
  const [result, setResult] = useState<LegalResult | null>(null);
  const [error, setError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("");
  const [items, setItems] = useState<LegalItem[]>([]);
  const [itemId, setItemId] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isAnalysing = status === "analysing";

  useEffect(() => {
    if (status !== "analysing") return;
    setStepIndex(0);
    const timer = setInterval(() => setStepIndex((prev) => (prev + 1) % ANALYSING_STEPS.length), 2500);
    return () => clearInterval(timer);
  }, [status]);

  // Load the list of items the label can be checked against.
  useEffect(() => {
    let cancelled = false;
    const loadItems = async () => {
      setItemsLoading(true);
      setItemsError("");
      try {
        const data = await apiFetch<LegalItem[]>(ITEMS_URL);
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setItemsError(err instanceof Error ? err.message : "Could not load the item list.");
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    };
    loadItems();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Derived data ─────────────────────────────────────────────────────── */

  const params = useMemo<Entry[]>(() => (result?.parameters ? Object.entries(result.parameters) : []), [result]);
  const missingEntries = params.filter(([, param]) => statusKind(param) === "missing");
  const mismatchEntries = params.filter(([, param]) => statusKind(param) === "mismatch");
  const issueEntries = params.filter(([, param]) => isIssue(statusKind(param)));
  const total = params.length;
  const issues = issueEntries.length;
  const passed = params.filter(([, param]) => statusKind(param) === "ok").length;
  const avgConfidence = useMemo(() => {
    const scored = params.filter(([, param]) => param.confidence);
    if (!scored.length) return 0;
    return Math.round((scored.reduce((sum, [, param]) => sum + confidenceScore(param.confidence), 0) / scored.length) * 100);
  }, [params]);

  const sections = useMemo(() => {
    if (!result?.parameters) return [] as { title: string; icon: IconType; entries: Entry[] }[];
    const map = result.parameters;
    const used = new Set(SECTION_DEFS.flatMap((section) => section.keys));
    const built = SECTION_DEFS.map((section) => ({
      title: section.title,
      icon: section.icon,
      entries: section.keys.filter((key) => key in map).map((key) => [key, map[key]] as Entry),
    }));
    const other = Object.keys(map)
      .filter((key) => !used.has(key))
      .map((key) => [key, map[key]] as Entry);
    if (other.length) built.push({ title: "Other details", icon: HiInformationCircle, entries: other });
    return built.filter((section) => section.entries.length > 0);
  }, [result]);

  const availableTabs = TABS.filter((tab) => sections.some((section) => section.title === tab.section));
  const currentTab = activeTab || availableTabs[0]?.label || "";

  // Open only the first section once results land.
  useEffect(() => {
    if (status === "done" && sections.length) setOpenSections(new Set([sections[0].title]));
  }, [status, sections]);

  const fileLabel = result?.file ? baseName(result.file) : file?.name ?? "label.pdf";
  const missingNames = missingEntries.map(([key]) => prettifyKey(key)).join(", ");
  const mismatchNames = mismatchEntries.map(([key]) => prettifyKey(key)).join(", ");

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const browse = () => inputRef.current?.click();

  const pickFile = (next: File | null) => {
    setError("");
    if (!next) return;
    if (!isPdf(next)) {
      setError("Please choose a PDF file — that's the format the label checker reads.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(`That file is ${formatBytes(next.size)}. Please upload a label PDF under 20 MB.`);
      return;
    }
    setFile(next);
    setStatus("idle");
    setResult(null);
    setActiveTab("");
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!isAnalysing) pickFile(event.dataTransfer.files?.[0] ?? null);
  };

  const analyse = async () => {
    if (!file) return;
    if (!itemId) {
      setError("Please select the item this label belongs to before analysing.");
      setStatus("error");
      return;
    }
    setStatus("analysing");
    setError("");
    setResult(null);
    try {
      const body = new FormData();
      body.append("label_file", file);
      body.append("item_id", itemId);
      const data = await apiUpload<LegalResult>(UPLOAD_URL, body, "POST");
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong while analysing the label.");
      setStatus("error");
    }
  };

  const toggleSection = (title: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const goToTab = (tab: { label: string; section: string }) => {
    setActiveTab(tab.label);
    setOpenSections((prev) => new Set(prev).add(tab.section));
    requestAnimationFrame(() => {
      document.getElementById(slug(tab.section))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const exportJson = () => {
    if (!result) return;
    saveAs(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
      `${fileLabel.replace(/\.pdf$/i, "")}-label.json`,
    );
  };

  /* ── Empty state ──────────────────────────────────────────────────────── */

  if (!file) {
    return (
      <div className="lc-page app-page">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="lc-file-input"
          onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
        />
        <div className="lc-empty">
          <span className="lc-empty-badge">
            <HiShieldCheck aria-hidden="true" /> AI document review
          </span>
          <h1 className="lc-empty-title">Label compliance checker</h1>

          <div
            className={`lc-drop${dragging ? " is-dragging" : ""}`}
            role="button"
            tabIndex={0}
            onClick={browse}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                browse();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="lc-drop-icon" aria-hidden="true">
              <HiArrowUpTray />
            </span>
            <p className="lc-drop-title">Drop your PDF here, or click to browse</p>
            <p className="lc-drop-hint">PDF · up to 20 MB</p>
          </div>

          <button type="button" className="lc-btn lc-btn-primary" onClick={browse}>
            Choose PDF
          </button>

          {error && (
            <p className="lc-error" role="alert">
              <HiExclamationTriangle aria-hidden="true" /> {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ── Report ───────────────────────────────────────────────────────────── */

  return (
    <div className="lc-page app-page">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="lc-file-input"
        onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
      />

      {/* Slim top bar */}
      <div className="lc-topbar">
        <div className="lc-topbar-file">
          <span className="lc-topbar-icon" aria-hidden="true">
            <HiDocumentText />
          </span>
          <strong title={file.name}>{file.name}</strong>
          <span className="lc-topbar-size">{formatBytes(file.size)}</span>
        </div>
        <label className="lc-topbar-item">
          <span className="lc-topbar-item-label">Item</span>
          <select
            className="lc-select"
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            disabled={isAnalysing || itemsLoading || !!itemsError}
          >
            <option value="">
              {itemsLoading ? "Loading items…" : itemsError ? "Couldn’t load items" : "Select an item…"}
            </option>
            {items.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.item_name}
              </option>
            ))}
          </select>
        </label>
        <div className="lc-topbar-actions">
          {status === "done" ? (
            <button type="button" className="lc-btn lc-btn-ghost" onClick={analyse}>
              <HiArrowPath aria-hidden="true" /> Reanalyze
            </button>
          ) : (
            <button
              type="button"
              className="lc-btn lc-btn-primary"
              onClick={analyse}
              disabled={isAnalysing || !itemId}
            >
              {isAnalysing ? (
                <>
                  <span className="lc-spinner" aria-hidden="true" /> Analysing…
                </>
              ) : (
                <>
                  <HiSparkles aria-hidden="true" /> Analyse
                </>
              )}
            </button>
          )}
          {status === "done" && (
            <button type="button" className="lc-btn lc-btn-ghost" onClick={exportJson}>
              <HiArrowDownTray aria-hidden="true" /> Export JSON
            </button>
          )}
          <button type="button" className="lc-btn lc-btn-ghost" onClick={browse} disabled={isAnalysing}>
            <HiArrowUpTray aria-hidden="true" /> Replace
          </button>
        </div>
      </div>

      {error && status === "error" && (
        <p className="lc-error lc-error-bar" role="alert">
          <HiExclamationTriangle aria-hidden="true" /> {error}
        </p>
      )}

      {status === "idle" && (
        <div className="lc-state">
          <HiSparkles aria-hidden="true" />
          <h2>Ready to analyse</h2>
          <p>
            {itemId
              ? "Click “Analyse” and the assistant will read every panel and extract the declarations."
              : "Select the item this label belongs to, then click “Analyse”."}
          </p>
        </div>
      )}

      {isAnalysing && (
        <div className="lc-state" role="status" aria-live="polite">
          <span className="lc-spinner lc-spinner-lg" aria-hidden="true" />
          <h2>Reviewing your label…</h2>
          <p>{ANALYSING_STEPS[stepIndex]}</p>
        </div>
      )}

      {status === "done" && (
        <div className="lc-report">
          {/* Summary metrics */}
          <div className="lc-metrics">
            <div className="lc-metric">
              <span className="lc-metric-num">{total}</span>
              <span className="lc-metric-label">Declarations checked</span>
            </div>
            <div className="lc-metric">
              <span className="lc-metric-num lc-num-ok">{passed}</span>
              <span className="lc-metric-label">Passed</span>
              <span className="lc-metric-sub">{avgConfidence}% confidence</span>
            </div>
            <div className="lc-metric">
              <span className="lc-metric-num lc-num-warn">{issues}</span>
              <span className="lc-metric-label">Issues found</span>
            </div>
          </div>

          {/* Single warning banner */}
          {issues > 0 && (
            <div className="lc-banner" role="alert">
              <HiExclamationTriangle className="lc-banner-icon" aria-hidden="true" />
              <div className="lc-banner-text">
                {missingEntries.length > 0 && (
                  <strong>
                    Missing: {missingNames}
                  </strong>
                )}
                {mismatchEntries.length > 0 && (
                  <strong>
                    Mismatched: {mismatchNames}
                  </strong>
                )}
                <span>
                  {missingEntries.length > 0 && "Missing declarations are required under FSSAI packaging rules. "}
                  {mismatchEntries.length > 0 && "Mismatched values differ from the reference database — review them against the label."}
                </span>
              </div>
            </div>
          )}

          {/* Category tabs */}
          {availableTabs.length > 0 && (
            <div className="lc-tabs" role="tablist" aria-label="Jump to category">
              {availableTabs.map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  role="tab"
                  aria-selected={currentTab === tab.label}
                  className={`lc-tab${currentTab === tab.label ? " is-active" : ""}`}
                  onClick={() => goToTab(tab)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Collapsible sections */}
          <div className="lc-sections">
            {sections.map((section) => (
              <Section
                key={section.title}
                title={section.title}
                icon={section.icon}
                entries={section.entries}
                open={openSections.has(section.title)}
                onToggle={() => toggleSection(section.title)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
