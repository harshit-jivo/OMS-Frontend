/**
 * The employee master's two typed fields, checked before saving (user,
 * 2026-10-21): an employee was added with the code and the name swapped
 * ("MERAJ SIDDIQUE" as the code, "JWPL1409" as the name), and an advance for
 * them could then never find their SAP account. The server checks the same.
 */
/** Letters and digits, no spaces, with a digit — JWPL1409 (the server's `EMPLOYEE_CODE`). */
const EMPLOYEE_CODE = /^(?=[A-Z0-9]*[0-9])[A-Z0-9]{3,20}$/;
/** A name that is an employee code: a few letters, then three digits or more (`NAME_LIKE_CODE`). */
const NAME_LIKE_CODE = /^[A-Za-z]{2,6}[0-9]{3,}$/;

/** What is wrong with a typed code, or null — a name in the code box says so (2026-10-21). */
export function employeeCodeProblem(code: string): string | null {
  const value = code.trim().toUpperCase();
  if (!value || EMPLOYEE_CODE.test(value)) return null;
  return "An employee code is letters and digits only, no spaces, e.g. JWPL1409. Is the name in the code box?";
}

/** What is wrong with a typed name, or null — a code in the name box says so. */
export function employeeNameProblem(name: string): string | null {
  const value = name.trim().replace(/\s+/g, " ");
  if (!value || !NAME_LIKE_CODE.test(value)) return null;
  return `"${value}" is an employee code, not a name. Is the code in the name box?`;
}
