import type { Alignment, Borders, Column, Worksheet } from "exceljs";

/**
 * Reusable Excel export service.
 *
 * Callers hand over raw values (real numbers, ISO date strings, booleans) and a
 * file name; column types, number formats, alignment and widths are inferred
 * from the header names and the values themselves. The output is a styled .xlsx
 * in which Excel treats dates as dates and numbers as numbers, so sorting,
 * SUM/AVERAGE and Pivot Tables work without any manual conversion.
 */

export type ExcelColumnType =
  | "text"
  | "integer"
  | "decimal"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "boolean"
  /** Numeric, but an identifier: no thousands grouping (order no., doc no.). */
  | "identifier";

export type ExcelAlign = "left" | "center" | "right";

export interface ExcelColumnConfig {
  /** Override the inferred type for this column. */
  type?: ExcelColumnType;
  /** Decimal places, for decimal/currency/percent. Inferred when omitted. */
  decimals?: number;
  /** Override the inferred alignment. */
  align?: ExcelAlign;
  /** Force text wrapping on. Inferred for long text when omitted. */
  wrap?: boolean;
  /** Fixed width in characters. Auto-fitted from content when omitted. */
  width?: number;
}

export interface ExcelTotalsRow {
  /** Headers to SUM. Each gets a real =SUM() formula, not a literal. */
  sum: string[];
  /** Header of the cell that carries the label (e.g. "Tax Rate"). */
  labelColumn?: string;
  /** Label text. Defaults to "TOTAL". */
  label?: string;
}

/** Formatting options for a single worksheet. */
export interface ExcelSheetOptions {
  /** Worksheet name. Sanitised to Excel's rules. Defaults to "Sheet1". */
  sheetName?: string;
  /** Per-header overrides. Everything not listed is inferred. */
  columns?: Record<string, ExcelColumnConfig>;
  /** Append a bold, SUM-formula totals row. */
  totalsRow?: ExcelTotalsRow;
  /**
   * How percent source values are scaled. "whole" means 18 renders as 18.00%
   * (the API convention here); "fraction" means 0.18 renders as 18.00%.
   */
  percentBasis?: "whole" | "fraction";
  /** Explicit column order. Defaults to key order across all rows. */
  headerOrder?: string[];
  /** Freeze the header row. Default true. */
  freezeHeader?: boolean;
  /** Auto filter dropdowns on every column. Default true. */
  autoFilter?: boolean;
}

export interface ExcelExportOptions extends ExcelSheetOptions {
  /** Output file name. ".xlsx" is appended when missing. */
  fileName: string;
}

/** One worksheet's data plus its options, for multi-sheet workbooks. */
export interface ExcelSheetInput extends ExcelSheetOptions {
  rows: ExcelRow[];
}

export type ExcelRow = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Theme                                                                      */
/* -------------------------------------------------------------------------- */

const HEADER_BG = "FF1E3A5F";
const HEADER_FG = "FFFFFFFF";
const BORDER_RGB = "FFD8DEE7";
const TOTALS_BG = "FFEEF2F7";

const MIN_WIDTH = 9;
const MAX_WIDTH = 48;
/** Beyond this, a text column gets wrapping instead of an ever-wider column. */
const WRAP_WIDTH = 38;

/* -------------------------------------------------------------------------- */
/* Number formats                                                             */
/* -------------------------------------------------------------------------- */

export const DATE_FORMAT = "dd-mm-yyyy";
export const DATETIME_FORMAT = "dd-mm-yyyy hh:mm";

/** Indian lakh/crore digit grouping: 12,34,567.00 */
const currencyFormat = (decimals: number) =>
  decimals > 0
    ? `[$₹-en-IN]#,##,##0.${"0".repeat(decimals)}`
    : "[$₹-en-IN]#,##,##0";

const decimalFormat = (decimals: number) =>
  decimals > 0 ? `#,##0.${"0".repeat(decimals)}` : "#,##0";

const percentFormat = (decimals: number) =>
  decimals > 0 ? `0.${"0".repeat(decimals)}%` : "0%";

const numberFormatFor = (type: ExcelColumnType, decimals: number): string | undefined => {
  switch (type) {
    case "currency":
      return currencyFormat(decimals);
    case "percent":
      return percentFormat(decimals);
    case "decimal":
      return decimalFormat(decimals);
    case "integer":
      return "#,##0";
    case "identifier":
      return "0";
    case "date":
      return DATE_FORMAT;
    case "datetime":
      return DATETIME_FORMAT;
    default:
      return undefined;
  }
};

const NUMERIC_TYPES = new Set<ExcelColumnType>([
  "integer",
  "decimal",
  "currency",
  "percent",
]);

/** Types Excel can SUM. `identifier` is numeric but summing an ID is nonsense. */
const isNumericType = (type: ExcelColumnType): boolean => NUMERIC_TYPES.has(type);

const DEFAULT_ALIGN: Record<ExcelColumnType, ExcelAlign> = {
  text: "left",
  integer: "right",
  decimal: "right",
  currency: "right",
  percent: "right",
  identifier: "left",
  date: "center",
  datetime: "center",
  boolean: "center",
};

/* -------------------------------------------------------------------------- */
/* Header-name heuristics                                                     */
/* -------------------------------------------------------------------------- */

/** Units that make a "total"/"value" column a plain measure, not money. */
const UNIT_RE =
  /\b(ltrs?|liters?|litres?|qty|quantity|boxes|box|pcs|pieces|units?|kgs?|weight|pack|count|stock|days?|hours?)\b/i;

const IDENTIFIER_RE =
  /(^|\b)(id|ids|no|nos|code|codes|number|num|doc\s*no|invoice\s*no|ref|reference|gstin|pan|phone|mobile|pin\s*code|pincode)(\b|$)|\bno\.\b/i;

const PERCENT_RE = /(%|\bpercent(age)?\b|\btax\s*rate\b|\bdiscount\s*%|\brate\s*\(%\))/i;

const CURRENCY_RE =
  /\b(amount|price|total|value|cost|charge|charges|freight|discount|net|gross|mrp|rate|payable|paid|balance|due|subtotal|sub\s*total|grand\s*total|basic)\b/i;

const DATETIME_RE = /(created|updated|modified|cancelled|approved|submitted|timestamp|date\s*&?\s*time|datetime)|_at\b|\bat\b/i;

const DATE_RE = /\b(date|dob|expiry|expires|due|period|day)\b/i;

const LONG_TEXT_RE = /\b(address|remarks?|notes?|description|comments?|reason|bill\s*to|ship\s*to)\b/i;

/* -------------------------------------------------------------------------- */
/* Value coercion                                                             */
/* -------------------------------------------------------------------------- */

/**
 * NaN/Infinity count as blank: they come from arithmetic on missing fields, and
 * treating them as values would poison an otherwise numeric column into text
 * and emit a literal "NaN" cell. An empty cell is the honest rendering, and it
 * leaves SUM/AVERAGE over the rest of the column intact.
 */
const isBlank = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  v === "" ||
  v === "-" ||
  (typeof v === "number" && !Number.isFinite(v));

const BOOL_TRUE = new Set(["true", "yes", "y", "1"]);
const BOOL_FALSE = new Set(["false", "no", "n", "0"]);

const asBoolean = (v: unknown): boolean | null => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (BOOL_TRUE.has(s)) return true;
    if (BOOL_FALSE.has(s)) return false;
  }
  return null;
};

/**
 * Numeric strings only — a bare "0"/"1" stays ambiguous with booleans, which is
 * resolved by detection order (boolean is only chosen when the whole column is
 * boolean-like *and* includes a non-numeric token such as "Yes").
 */
const asNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim().replace(/[₹,\s]/g, "").replace(/%$/, "");
    if (s === "" || !/^[-+]?\d*\.?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
/** dd-mm-yyyy or dd/mm/yyyy, optionally followed by a time. */
const DMY_RE =
  /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i;
/** "15 Jul 2026, 02:30 pm" — the en-IN toLocaleString shape used across pages. */
const LOCALE_RE =
  /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const to24Hour = (hour: number, meridiem?: string): number => {
  if (!meridiem) return hour;
  const m = meridiem.toLowerCase();
  if (m === "pm") return hour === 12 ? 12 : hour + 12;
  return hour === 12 ? 0 : hour;
};

interface ParsedDate {
  date: Date;
  hasTime: boolean;
}

/**
 * Encodes a wall-clock reading as a Date whose UTC fields hold those figures.
 *
 * This is the crux of getting dates right. ExcelJS turns a Date into a serial
 * with `25569 + d.getTime() / 86400000` — pure UTC, with no local-offset
 * correction. So a Date built the ordinary (local) way is written to the sheet
 * shifted by the browser's offset: in IST (UTC+5:30) a 14:30 order timestamp
 * would render as 09:00, and anything after 18:30 would land on the day before.
 *
 * Excel serials carry no timezone — a cell means a wall-clock reading, nothing
 * more. So we pin the intended wall clock into the UTC fields, which is exactly
 * what ExcelJS then serialises. Every parse path below funnels through here.
 */
const wallClock = (
  y: number,
  month: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): Date => new Date(Date.UTC(y, month, d, h, mi, s));

/** ISO date with no time part — kept whole so the serial stays an integer. */
const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses the date shapes this app produces: ISO from the API, dd-mm-yyyy from
 * date inputs, and the "15 Jul 2026, 02:30 pm" en-IN locale string.
 *
 * Deliberately strict — `new Date(str)` is not used as a fallback because it
 * happily parses things like "Approved" into garbage on some engines.
 */
const parseDate = (v: unknown): ParsedDate | null => {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // Read the local fields: a Date means an instant, and the wall clock the
    // user saw for it is the local one.
    return {
      date: wallClock(
        v.getFullYear(),
        v.getMonth(),
        v.getDate(),
        v.getHours(),
        v.getMinutes(),
        v.getSeconds(),
      ),
      hasTime:
        v.getHours() !== 0 || v.getMinutes() !== 0 || v.getSeconds() !== 0,
    };
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;

  // Date-only ISO ("2026-07-15") is a calendar date, not an instant. Take the
  // fields verbatim: routing it through `new Date()` would read it as UTC
  // midnight and then shift it a day west of Greenwich.
  const isoDay = ISO_DATE_ONLY_RE.exec(s);
  if (isoDay) {
    return {
      date: wallClock(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3])),
      hasTime: false,
    };
  }

  if (ISO_RE.test(s)) {
    // A real instant (with Z or an offset). Convert to the viewer's local wall
    // clock so the sheet agrees with what the page showed.
    const date = new Date(s);
    if (Number.isNaN(date.getTime())) return null;
    return {
      date: wallClock(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
      ),
      hasTime: true,
    };
  }

  const dmy = DMY_RE.exec(s);
  if (dmy) {
    const [, d, mo, y, h, mi, sec, mer] = dmy;
    const month = Number(mo) - 1;
    if (month < 0 || month > 11 || Number(d) < 1 || Number(d) > 31) return null;
    const hasTime = h !== undefined;
    return {
      date: wallClock(
        Number(y),
        month,
        Number(d),
        hasTime ? to24Hour(Number(h), mer) : 0,
        hasTime ? Number(mi) : 0,
        sec ? Number(sec) : 0,
      ),
      hasTime,
    };
  }

  const loc = LOCALE_RE.exec(s);
  if (loc) {
    const [, d, monName, y, h, mi, sec, mer] = loc;
    const month = MONTHS[monName.slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    const hasTime = h !== undefined;
    return {
      date: wallClock(
        Number(y),
        month,
        Number(d),
        hasTime ? to24Hour(Number(h), mer) : 0,
        hasTime ? Number(mi) : 0,
        sec ? Number(sec) : 0,
      ),
      hasTime,
    };
  }

  return null;
};

/** Largest decimal place count that is meaningful, ignoring float noise. */
const MAX_DECIMALS = 4;
const FLOAT_EPSILON = 1e-9;

/**
 * Decimal places the data actually carries.
 *
 * Measured by finding the shortest rounding that reproduces the value, rather
 * than counting characters in `String(n)`: a computed 1234.5600000000002 is
 * float noise for 2dp, and character-counting would widen the whole column to
 * `#,##0.0000`.
 */
const decimalsIn = (values: unknown[]): number => {
  let max = 0;
  for (const v of values) {
    const n = asNumber(v);
    if (n === null || Number.isInteger(n)) continue;
    for (let dp = 1; dp <= MAX_DECIMALS; dp++) {
      if (Math.abs(n - Number(n.toFixed(dp))) < FLOAT_EPSILON) {
        max = Math.max(max, dp);
        break;
      }
      if (dp === MAX_DECIMALS) max = MAX_DECIMALS;
    }
    if (max >= MAX_DECIMALS) break;
  }
  return max;
};

/**
 * True when converting to a number would lose information — a leading zero on a
 * SAP item code ("0012345"), or a phone's "+91" prefix. Such identifiers must
 * stay text even though they parse as numbers.
 */
const isLossyAsNumber = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  const s = v.trim();
  const n = asNumber(s);
  return n === null ? false : String(n) !== s;
};

/* -------------------------------------------------------------------------- */
/* Type inference                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every non-blank value in the column is examined, not a sample: a column is
 * only given a numeric type if *all* of it is numeric. Sampling the first N
 * rows would let a stray "N/A" deep in a large export slip into a numeric
 * column as text, where Excel's SUM would skip it and quietly under-report the
 * total. The scans below short-circuit on the first mismatch, so a text column
 * costs one check rather than a full pass.
 */
const inferType = (header: string, values: unknown[]): ExcelColumnType => {
  const present = values.filter((v) => !isBlank(v));
  if (present.length === 0) return "text";

  // Boolean: every value is boolean-like AND at least one is a real bool or a
  // word like "Yes", so a column of 0/1 quantities is not misread as boolean.
  if (
    present.every((v) => asBoolean(v) !== null) &&
    present.some(
      (v) =>
        typeof v === "boolean" ||
        (typeof v === "string" && !/^[01]$/.test(v.trim())),
    )
  ) {
    return "boolean";
  }

  // Dates: every value must parse into one of the known shapes. The header name
  // only decides date vs datetime when the values carry no time component.
  let allDates = true;
  let anyTime = false;
  for (const v of present) {
    const parsed = parseDate(v);
    if (!parsed) {
      allDates = false;
      break;
    }
    if (parsed.hasTime) anyTime = true;
  }
  if (allDates) {
    if (anyTime) return "datetime";
    return DATETIME_RE.test(header) && !DATE_RE.test(header) ? "datetime" : "date";
  }

  if (present.every((v) => asNumber(v) !== null)) {
    if (PERCENT_RE.test(header)) return "percent";
    if (IDENTIFIER_RE.test(header)) {
      // An identifier that would not survive the round trip through Number
      // (leading zeros, a "+" prefix) has to stay text.
      return present.some(isLossyAsNumber) ? "text" : "identifier";
    }
    if (CURRENCY_RE.test(header) && !UNIT_RE.test(header)) return "currency";
    return decimalsIn(present) > 0 ? "decimal" : "integer";
  }

  return "text";
};

const inferDecimals = (type: ExcelColumnType, values: unknown[]): number => {
  switch (type) {
    case "currency":
      return 2;
    case "percent":
      return 2;
    case "decimal":
      return Math.max(decimalsIn(values), 2);
    default:
      return 0;
  }
};

/* -------------------------------------------------------------------------- */
/* Cell value coercion                                                        */
/* -------------------------------------------------------------------------- */

const coerce = (
  value: unknown,
  type: ExcelColumnType,
  percentBasis: "whole" | "fraction",
): string | number | Date | boolean | null => {
  if (isBlank(value)) return null;

  switch (type) {
    case "boolean": {
      const b = asBoolean(value);
      // Fall back to text rather than null: an unrecognised value would
      // otherwise be silently dropped into an empty cell.
      return b === null ? String(value) : b;
    }
    case "date":
    case "datetime": {
      const p = parseDate(value);
      return p ? p.date : String(value);
    }
    case "percent": {
      const n = asNumber(value);
      if (n === null) return String(value);
      return percentBasis === "whole" ? n / 100 : n;
    }
    case "identifier": {
      // Never let Number() shave a leading zero off a code.
      if (isLossyAsNumber(value)) return String(value).trim();
      const n = asNumber(value);
      return n === null ? String(value) : n;
    }
    case "currency":
    case "decimal":
    case "integer": {
      const n = asNumber(value);
      // Fall back to text so a "TOTAL" marker in a numeric column survives.
      return n === null ? String(value) : n;
    }
    default:
      return typeof value === "string" ? value : String(value);
  }
};

/* -------------------------------------------------------------------------- */
/* Sheet name / file name                                                     */
/* -------------------------------------------------------------------------- */

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 chars. */
const sanitizeSheetName = (name: string): string => {
  const cleaned = name.replace(/[\\/*?:[\]]/g, "-").trim();
  return cleaned.slice(0, 31) || "Sheet1";
};

const withXlsxExtension = (name: string): string =>
  /\.xlsx$/i.test(name) ? name : `${name}.xlsx`;

/* -------------------------------------------------------------------------- */
/* Column resolution                                                          */
/* -------------------------------------------------------------------------- */

interface ResolvedColumn {
  header: string;
  type: ExcelColumnType;
  numFmt?: string;
  align: ExcelAlign;
  wrap: boolean;
  width: number;
}

const displayWidth = (
  value: unknown,
  type: ExcelColumnType,
  decimals: number,
): number => {
  if (isBlank(value)) return 0;
  switch (type) {
    case "date":
      return 10; // dd-mm-yyyy
    case "datetime":
      return 16; // dd-mm-yyyy hh:mm
    case "boolean":
      return 5;
    case "currency": {
      const n = asNumber(value);
      if (n === null) return String(value).length;
      // digits + Indian grouping commas + decimals + symbol
      const digits = Math.floor(Math.abs(n)).toString().length;
      const commas = digits > 3 ? Math.ceil((digits - 3) / 2) : 0;
      return digits + commas + (decimals ? decimals + 1 : 0) + 2;
    }
    case "percent":
      return decimals + 5;
    default:
      return String(value).length;
  }
};

const resolveColumns = (
  headers: string[],
  rows: ExcelRow[],
  overrides: Record<string, ExcelColumnConfig>,
): ResolvedColumn[] =>
  headers.map((header) => {
    const values = rows.map((r) => r[header]);
    const override = overrides[header] ?? {};
    const type = override.type ?? inferType(header, values);
    const decimals = override.decimals ?? inferDecimals(type, values);

    const contentWidth = values.reduce<number>(
      (max, v) => Math.max(max, displayWidth(v, type, decimals)),
      header.length,
    );
    const fitted = Math.min(Math.max(contentWidth + 2, MIN_WIDTH), MAX_WIDTH);
    const wrap =
      override.wrap ?? (type === "text" && (contentWidth > WRAP_WIDTH || LONG_TEXT_RE.test(header)));

    return {
      header,
      type,
      numFmt: numberFormatFor(type, decimals),
      align: override.align ?? DEFAULT_ALIGN[type],
      wrap,
      width: override.width ?? fitted,
    };
  });

const collectHeaders = (rows: ExcelRow[], order?: string[]): string[] => {
  if (order?.length) return order;
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
};

/* -------------------------------------------------------------------------- */
/* Styling                                                                    */
/* -------------------------------------------------------------------------- */

const thinBorder: Partial<Borders> = {
  top: { style: "thin", color: { argb: BORDER_RGB } },
  left: { style: "thin", color: { argb: BORDER_RGB } },
  bottom: { style: "thin", color: { argb: BORDER_RGB } },
  right: { style: "thin", color: { argb: BORDER_RGB } },
};

const styleHeader = (sheet: Worksheet, columns: ResolvedColumn[]) => {
  const header = sheet.getRow(1);
  header.height = 22;
  header.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  header.border = thinBorder;
  header.eachCell((cell, col) => {
    cell.alignment = {
      vertical: "middle",
      horizontal: columns[col - 1]?.align ?? "left",
      wrapText: true,
    };
  });
  header.commit();
};

const styleTotals = (sheet: Worksheet, rowNumber: number) => {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTALS_BG } };
    cell.border = {
      ...thinBorder,
      top: { style: "double", color: { argb: BORDER_RGB } },
    };
  });
  row.commit();
};

/** A1-style column letter: 1 -> A, 27 -> AA. */
const columnLetter = (index: number): string => {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

type ExcelJSModule = typeof import("exceljs");

/**
 * ExcelJS is published as CommonJS, so the shape of a dynamic import differs by
 * environment: Vite's esbuild interop exposes `Workbook` as a named export,
 * while Node puts the whole module under `default`. Normalise both.
 */
const loadExcelJS = async (): Promise<ExcelJSModule> => {
  const mod = (await import("exceljs")) as ExcelJSModule & {
    default?: ExcelJSModule;
  };
  return mod.Workbook ? mod : (mod.default as ExcelJSModule);
};

/** Fills one worksheet: columns, typed values, styling, totals, filter. */
const writeSheet = (
  workbook: import("exceljs").Workbook,
  rows: ExcelRow[],
  options: ExcelSheetOptions,
): void => {
  const {
    sheetName = "Sheet1",
    columns: overrides = {},
    totalsRow,
    percentBasis = "whole",
    headerOrder,
    freezeHeader = true,
    autoFilter = true,
  } = options;

  const headers = collectHeaders(rows, headerOrder);
  if (headers.length === 0) {
    throw new Error(
      `exportToExcel: nothing to export — sheet "${sheetName}" has no columns.`,
    );
  }

  const resolved = resolveColumns(headers, rows, overrides);

  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName), {
    views: freezeHeader ? [{ state: "frozen", ySplit: 1 }] : undefined,
  });

  sheet.columns = resolved.map<Partial<Column>>((col, i) => ({
    header: col.header,
    key: String(i),
    width: col.width,
  }));

  // Body. addRows in one call is markedly faster than per-row addRow for large
  // exports, and values are pre-coerced so ExcelJS never has to guess a type.
  sheet.addRows(
    rows.map((row) =>
      resolved.map((col) => coerce(row[col.header], col.type, percentBasis)),
    ),
  );

  // Per-column style. The alignment object is hoisted out of the cell loop so
  // every cell in a column shares one instance instead of allocating its own.
  resolved.forEach((col, i) => {
    const column = sheet.getColumn(i + 1);
    const alignment: Partial<Alignment> = {
      horizontal: col.align,
      vertical: col.wrap ? "top" : "middle",
      wrapText: col.wrap,
    };
    column.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber === 1) return; // header keeps its own style
      cell.alignment = alignment;
      cell.border = thinBorder;
      if (col.numFmt) cell.numFmt = col.numFmt;
    });
  });

  styleHeader(sheet, resolved);

  const lastDataRow = rows.length + 1;

  if (totalsRow && rows.length > 0) {
    // Only sum columns that really are numeric. SUM() over a text column
    // evaluates to 0, which reads as a genuine total and hides the problem.
    const summable = new Set(
      resolved
        .filter((col) => totalsRow.sum.includes(col.header) && isNumericType(col.type))
        .map((col) => col.header),
    );

    // Nothing to total (e.g. an order with no line items, so the amount columns
    // never appear) — skip the row rather than emit a blank shaded strip.
    if (summable.size > 0) {
      const values: (string | number | { formula: string } | null)[] = resolved.map(
        (col, i) => {
          if (summable.has(col.header)) {
            const letter = columnLetter(i + 1);
            return { formula: `SUM(${letter}2:${letter}${lastDataRow})` };
          }
          if (col.header === totalsRow.labelColumn) return totalsRow.label ?? "TOTAL";
          return null;
        },
      );

      const added = sheet.addRow(values);
      resolved.forEach((col, i) => {
        const cell = added.getCell(i + 1);
        if (summable.has(col.header) && col.numFmt) cell.numFmt = col.numFmt;
        cell.alignment = { horizontal: col.align, vertical: "middle" };
      });
      styleTotals(sheet, added.number);
    }
  }

  if (autoFilter) {
    // Filter spans the data only — a totals row inside the range would be
    // dragged into every filter result and pollute the dropdown values.
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(lastDataRow, 1), column: resolved.length },
    };
  }
};

/**
 * Builds the formatted workbook and returns the raw .xlsx bytes.
 *
 * Exported separately from {@link exportToExcel} so a buffer can be produced
 * without touching the DOM — for uploading, mailing, or testing.
 *
 * ExcelJS is ~250KB gzipped and only needed at the moment of export, so it is
 * pulled in via a dynamic import to keep it out of the initial bundle.
 */
export const buildExcelBuffer = async (
  rows: ExcelRow[],
  options: ExcelExportOptions,
): Promise<ArrayBuffer> => buildWorkbookBuffer([{ ...options, rows }]);

const buildWorkbookBuffer = async (
  sheets: ExcelSheetInput[],
): Promise<ArrayBuffer> => {
  const workbook = new (await loadExcelJS()).Workbook();
  workbook.creator = "OMS";
  workbook.created = new Date();

  for (const { rows, ...options } of sheets) {
    writeSheet(workbook, rows, options);
  }

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
};

/**
 * Builds a formatted .xlsx from `rows` and triggers a browser download.
 *
 * Pass raw values — real numbers, ISO date strings, booleans. Types, number
 * formats, alignment and widths are inferred per column; `options.columns` is
 * only needed to override an inference that gets something wrong.
 */
export const exportToExcel = async (
  rows: ExcelRow[],
  options: ExcelExportOptions,
): Promise<void> => {
  const buffer = await buildExcelBuffer(rows, options);
  await downloadBuffer(buffer, options.fileName);
};

/**
 * Fire-and-forget wrapper for synchronous click handlers.
 *
 * `void exportToExcel(...)` would discard the promise, so a failure (a missing
 * ExcelJS chunk after a redeploy, an out-of-memory on a huge export) would
 * leave the user pressing Download to no effect and no message. The old
 * synchronous SheetJS code threw visibly; this keeps that property.
 */
export const startExcelExport = (
  rows: ExcelRow[],
  options: ExcelExportOptions,
): void => {
  exportToExcel(rows, options).catch((error: unknown) => {
    console.error("Excel export failed:", error);
    window.alert("Sorry, the Excel export failed. Please try again.");
  });
};

/**
 * Same as {@link exportToExcel}, but writes several formatted sheets into one
 * workbook. Each sheet is typed and styled independently.
 */
export const exportSheetsToExcel = async (
  sheets: ExcelSheetInput[],
  fileName: string,
): Promise<void> => {
  if (sheets.length === 0) {
    throw new Error("exportSheetsToExcel: no sheets to export.");
  }
  const buffer = await buildWorkbookBuffer(sheets);
  await downloadBuffer(buffer, fileName);
};

/** {@link startExcelExport} for the multi-sheet path. */
export const startSheetsExport = (
  sheets: ExcelSheetInput[],
  fileName: string,
): void => {
  exportSheetsToExcel(sheets, fileName).catch((error: unknown) => {
    console.error("Excel export failed:", error);
    window.alert("Sorry, the Excel export failed. Please try again.");
  });
};

const downloadBuffer = async (buffer: ArrayBuffer, fileName: string) => {
  // Imported dynamically, not statically: file-saver touches `window` at module
  // scope and throws outside a browser, which would make buildExcelBuffer
  // unusable in tests/SSR. Vite warns this import can't be split into its own
  // chunk (Label_Checker imports it statically) — that's fine and expected, the
  // goal here is deferring evaluation, not code-splitting a 2KB module.
  const { saveAs } = await import("file-saver");
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    withXlsxExtension(fileName),
  );
};

/**
 * `YYYY-MM-DD` stamp for file names, matching the existing convention.
 *
 * Built from local fields, not `toISOString()`: east of Greenwich the UTC date
 * is still yesterday early in the morning, which would stamp a report run at
 * 01:00 IST with the previous day.
 */
export const exportDateStamp = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
