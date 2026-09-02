import { useEffect, useState } from "react";
import { HiPlusCircle } from "react-icons/hi2";
import { NicField, ErrorAlert, SuccessAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import { type HaisOption } from "../../services/haisService";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

/**
 * Generic master-data screen: lists every value from a DB dropdown table and
 * lets the user add a new one. Input is forced to CAPITAL letters as you type,
 * matching how the values are stored.
 */
export default function OptionManager({ title, singular, load, create }: Props) {
  const [rows, setRows] = useState<HaisOption[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let alive = true;
    load()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError(`Could not load ${title} from the server.`))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, title]);

  const add = async () => {
    const value = name.trim().toUpperCase();
    setError("");
    setSuccess("");
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
      setSuccess(`${singular} "${value}" added.`);
      setRows(await load());
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ofs-card ofs-card--wide">
      <div className="ofs-card-head">
        <span className="ofs-card-mark" />
        <h2>{title}</h2>
      </div>

      {/* Add row */}
      <div className="nic-form-grid">
        <NicField label={`Add ${singular}`} hint="Stored in CAPITAL letters">
          <input
            className="nic-input"
            value={name}
            // Force uppercase as the user types.
            onChange={(e) => setName(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            placeholder={`e.g. ${singular === "Department" ? "ACCOUNTS" : singular === "Storage Type" ? "SSD" : "LAPTOP"}`}
          />
        </NicField>
      </div>

      <div className="nic-actions-row">
        <button className="ofs-primary" onClick={() => void add()} disabled={busy}>
          <HiPlusCircle className="nic-icon-lead" />
          {busy ? "Adding…" : `Add ${singular}`}
        </button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      <SuccessAlert>{success}</SuccessAlert>

      {/* List */}
      <div className="nic-table-wrap nic-table-wrap--offset">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead className="nic-col-tiny">#</TableHead>
              <TableHead>{singular}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={2} className="nic-note">Loading…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="nic-note">No {title.toLowerCase()} yet — add one above.</TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{r.name}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
