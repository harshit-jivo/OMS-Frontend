/**
 * Small inline icons used across the Scheme Manager page. Split out of
 * `Scheme_Manager.tsx` (Phase 4) verbatim, with one hygiene fix: each is purely
 * decorative (the buttons that host them already carry their own accessible
 * name via text or `aria-label`/`title`), so each now carries `aria-hidden`
 * to stop screen readers announcing a redundant, unlabelled graphic.
 */

export const CaretIcon = () => (
  <svg className="sch-caret" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PencilIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

export const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4.5A1.5 1.5 0 019.5 3h5A1.5 1.5 0 0116 4.5V6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6" />
  </svg>
);

export const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4.6" stroke="#94a3b8" strokeWidth="1.5" />
    <path d="M10.5 10.5L14 14" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
