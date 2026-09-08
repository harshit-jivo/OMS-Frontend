/**
 * Generic master-data screen: lists every value from a DB dropdown table and
 * lets the user add a new one. Input is forced to CAPITAL letters as you type,
 * matching how the values are stored.
 */
import { useEffect, useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/page";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { type HaisOption } from "../../services/haisService";

type Props = {
  /** Plural title, e.g. "Departments". */
  title: string;
  /** Singular label, e.g. "Department". */
  singular: string;
  /** Load all rows from the DB master. */
  load: () => Promise<HaisOption[]>;
  /** Create a new row (name is stored in CAPITALS by the service). */
  create: (name: string) => Promise<HaisOption>;
};

export default function OptionManager({ title, singular, load, create }: Props) {
  const [rows, setRows] = useState<HaisOption[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    load()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setLoadError(`Could not load ${title} from the server.`))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, title]);

  const add = async () => {
    const value = name.trim().toUpperCase();
    setError("");
    if (!value) {
      setError(`${singular} name is required.`);
      return;
    }
    if (rows.some((r) => r.name.toUpperCase() === value)) {
      setError(`"${value}" already exists.`);
      return;
    }
    setBusy(true);
    try {
      await create(value);
      setName("");
      showToast({ title: `${singular} added`, message: value });
      setRows(await load());
    } catch (err) {
      showToast({
        title: `Could not add the ${singular.toLowerCase()}`,
        message: messageFrom(err, "The server refused the request."),
      });
    } finally {
      setBusy(false);
    }
  };

  const example =
    singular === "Department" ? "ACCOUNTS" : singular === "Storage Type" ? "SSD" : "LAPTOP";

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Field
            label={`Add ${singular.toLowerCase()}`}
            hint={error ? undefined : "Stored in CAPITAL letters"}
            error={error || undefined}
            className="min-w-[240px] max-w-[420px] flex-1"
          >
            {(c) => (
              <Input
                {...c}
                value={name}
                // Force uppercase as the user types.
                onChange={(e) => setName(e.target.value.toUpperCase())}
                placeholder={`e.g. ${example}`}
                autoComplete="off"
              />
            )}
          </Field>
          {/* The field always has a line under it (hint or error), so the
              button sits on the control, not the caption. */}
          <Button type="submit" variant="primary" disabled={busy} className="mb-[21px]">
            <HiOutlinePlus aria-hidden="true" /> {busy ? "Adding…" : `Add ${singular.toLowerCase()}`}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader className="mb-0 border-b border-line px-4 py-3">
          <CardTitle>
            {title}{" "}
            <span className="font-medium text-subtle">{loading ? "" : `(${rows.length})`}</span>
          </CardTitle>
        </CardHeader>
        {loading ? (
          <TableSkeleton rows={4} columns={2} />
        ) : loadError ? (
          <EmptyState title={`Could not load ${title.toLowerCase()}`} hint={loadError} />
        ) : rows.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} hint="Add one above." />
        ) : (
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>{singular}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-subtle">{i + 1}</TableCell>
                  <TableCell className="font-medium text-ink">{r.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
