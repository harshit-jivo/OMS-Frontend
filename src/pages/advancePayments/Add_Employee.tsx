/**
 * Add Employee: the employee master, for administrators.
 *
 * Adds a person to OMS's employee master (`advance_payment.Employee`, via
 * `/advance-payments/employee-master/`) with their role: HOD, Sub-HOD or
 * Executive. The list under the form is everyone already there, so a code is
 * not added twice.
 *
 * Admins only, on both sides: the route is `adminOnly` (auth/routeAccess.ts)
 * and the endpoint is `IsAdminRole`.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineUserPlus } from "react-icons/hi2";

import { Badge } from "../../components/ui/badge";
import { Breadcrumbs } from "../../components/ui/breadcrumbs";
import { Button } from "../../components/ui/button";
import { Checkbox, Field, FormActions, FormGrid, Input, Select } from "../../components/ui/form";
import { Card, CardHeader, CardTitle, Notice, Page, PageHeader } from "../../components/ui/page";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  advancePaymentError,
  advancePaymentService,
  type MasterEmployee,
  type NewMasterEmployee,
} from "../../services/advancePaymentService";

import { formatDateTime } from "./requestLabels";

const ROLES = [
  { value: "1", label: "HOD" },
  { value: "2", label: "Sub-HOD" },
  { value: "3", label: "Executive" },
] as const;

interface FormState {
  employeeCode: string;
  employeeName: string;
  role: string;
  designation: string;
  email: string;
  phone: string;
  gender: "" | "M" | "F";
  employeeId: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  employeeCode: "",
  employeeName: "",
  role: "3",
  designation: "",
  email: "",
  phone: "",
  gender: "",
  employeeId: "",
  isActive: true,
};

const QUERY_KEY = ["advance-payments", "employee-master"] as const;

/** The server's field errors, by field; its message otherwise. */
function saveError(err: unknown): { message: string; fields: Record<string, string> } {
  const data = (err as { response?: { data?: { message?: string; errors?: Record<string, unknown> } } })
    ?.response?.data;
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(data?.errors ?? {})) {
    fields[name] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return { message: data?.message || advancePaymentError(err), fields };
}

export default function Add_Employee() {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [search, setSearch] = React.useState("");
  const [added, setAdded] = React.useState<MasterEmployee | null>(null);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const employees = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => advancePaymentService.masterEmployees(),
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: (payload: NewMasterEmployee) => advancePaymentService.addMasterEmployee(payload),
    onSuccess: (employee) => {
      setAdded(employee);
      setForm(EMPTY);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  const error = save.error ? saveError(save.error) : null;

  const missing = !form.employeeCode.trim() || !form.employeeName.trim();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (missing) return;
    setAdded(null);
    save.mutate({
      employee_code: form.employeeCode.trim(),
      employee_name: form.employeeName.trim(),
      role: Number(form.role) as 1 | 2 | 3,
      designation: form.designation.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      gender: form.gender || null,
      employee_id: form.employeeId.trim() ? Number(form.employeeId) : null,
      is_active: form.isActive,
    });
  };

  const rows = React.useMemo(() => {
    const all = employees.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (e) =>
        e.employee_code.toLowerCase().includes(q) ||
        e.employee_name.toLowerCase().includes(q) ||
        (e.designation ?? "").toLowerCase().includes(q),
    );
  }, [employees.data, search]);

  return (
    <Page>
      <Breadcrumbs items={[{ label: "Administration" }, { label: "Add Employee" }]} />
      <PageHeader
        eyebrow="Administration"
        title="Add Employee"
        description="Add a person to the employee master, with their role: HOD, Sub-HOD or Executive."
      />

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>New Employee</CardTitle>
        </CardHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {added ? (
            <Notice tone="ok" title="Employee added">
              {added.employee_code} {added.employee_name} ({added.role_label}) is in the employee master.
            </Notice>
          ) : null}
          {error && !Object.keys(error.fields).length ? (
            <Notice tone="bad" title="Could not add the employee">
              {error.message}
            </Notice>
          ) : null}

          <FormGrid>
            <Field label="Employee Code" required error={error?.fields.employee_code} hint="e.g. JWPL3100">
              {(f) => (
                <Input
                  {...f}
                  value={form.employeeCode}
                  maxLength={20}
                  onChange={(e) => set({ employeeCode: e.target.value.toUpperCase() })}
                />
              )}
            </Field>
            <Field label="Employee Name" required error={error?.fields.employee_name}>
              {(f) => (
                <Input
                  {...f}
                  value={form.employeeName}
                  maxLength={150}
                  onChange={(e) => set({ employeeName: e.target.value })}
                />
              )}
            </Field>
            <Field label="Role" required error={error?.fields.role}>
              {(f) => (
                <Select {...f} value={form.role} onChange={(e) => set({ role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Designation" error={error?.fields.designation}>
              {(f) => (
                <Input
                  {...f}
                  value={form.designation}
                  maxLength={100}
                  onChange={(e) => set({ designation: e.target.value })}
                />
              )}
            </Field>
            <Field label="Email" error={error?.fields.email}>
              {(f) => (
                <Input
                  {...f}
                  type="email"
                  value={form.email}
                  maxLength={254}
                  onChange={(e) => set({ email: e.target.value })}
                />
              )}
            </Field>
            <Field label="Phone" error={error?.fields.phone}>
              {(f) => (
                <Input
                  {...f}
                  type="tel"
                  value={form.phone}
                  maxLength={20}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              )}
            </Field>
            <Field label="Gender" error={error?.fields.gender}>
              {(f) => (
                <Select
                  {...f}
                  value={form.gender}
                  onChange={(e) => set({ gender: e.target.value as FormState["gender"] })}
                >
                  <option value="">Not given</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </Select>
              )}
            </Field>
            <Field
              label="JSAP Employee ID"
              error={error?.fields.employee_id}
              hint="Only if the person is already in JSAP."
            >
              {(f) => (
                <Input
                  {...f}
                  inputMode="numeric"
                  value={form.employeeId}
                  onChange={(e) => set({ employeeId: e.target.value.replace(/\D/g, "") })}
                />
              )}
            </Field>
          </FormGrid>

          <Checkbox
            label="Active"
            checked={form.isActive}
            onChange={(e) => set({ isActive: e.target.checked })}
          />

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => setForm(EMPTY)} disabled={save.isPending}>
              Clear
            </Button>
            <Button type="submit" variant="primary" disabled={missing || save.isPending}>
              <HiOutlineUserPlus className="size-4" aria-hidden="true" />
              {save.isPending ? "Adding…" : "Add Employee"}
            </Button>
          </FormActions>
        </form>
      </Card>

      <Card className="p-4 md:p-5">
        <CardHeader>
          <CardTitle>Employees ({employees.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <div className="mb-3 max-w-sm">
          <Field label="Search">
            {(f) => (
              <Input
                {...f}
                placeholder="Code, name or designation"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </Field>
        </div>
        {employees.isError ? (
          <Notice tone="bad" title="Could not load the employees">
            {advancePaymentError(employees.error)}
          </Notice>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.isPending ? (
                <TableEmpty colSpan={6}>Loading…</TableEmpty>
              ) : rows.length === 0 ? (
                <TableEmpty colSpan={6}>{search ? "No employee matches that search." : "No employees yet."}</TableEmpty>
              ) : (
                rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium text-ink">{e.employee_code}</TableCell>
                    <TableCell>{e.employee_name}</TableCell>
                    <TableCell>{e.role_label}</TableCell>
                    <TableCell>{e.designation ?? "—"}</TableCell>
                    <TableCell>
                      <Badge tone={e.is_active ? "ok" : "neutral"}>{e.is_active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="text-subtle">{formatDateTime(e.created_on)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
