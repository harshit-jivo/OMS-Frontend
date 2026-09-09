/**
 * Load SheetJS on demand — Phase 5.2 of the frontend plan.
 *
 * `xlsx` is 422 kB minified. Three pages imported it statically, so every user
 * who opened Party Assignment, Party & Product Assignment or Tracker Reports
 * downloaded a spreadsheet parser before seeing a single row — whether or not
 * they ever imported or exported a file. Most visits to those pages never
 * touch a workbook at all.
 *
 * Loading it at click time moves the cost onto the action that needs it. The
 * import resolves from cache on every subsequent use in the session, so a user
 * who imports twice pays once.
 *
 * The type import is separate and free: `import type` is erased at compile
 * time, so annotating a `WorkBook` parameter costs nothing at runtime. That is
 * what lets the module-level helpers keep their real types while the library
 * itself stays out of the initial chunk.
 */
export type { WorkBook, WorkSheet } from "xlsx";

/** The SheetJS module, fetched on first use. */
export type XlsxModule = typeof import("xlsx");

export const loadXlsx = (): Promise<XlsxModule> => import("xlsx");
