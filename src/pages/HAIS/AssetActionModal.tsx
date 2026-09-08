/**
 * Handover / Update-Configuration — the two things that change a device's
 * history without editing the record itself.
 */
import { useState } from "react";

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
import { Checkbox, Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Notice, SectionHeading } from "@/components/ui/page";
import { messageFrom } from "@/lib/apiError";
import DateInput from "../../components/DateInput";
import {
  haisService,
  configSummary,
  type Asset,
  type ConfigFields,
} from "../../services/haisService";

import { MONO } from "./assetTone";
import { useHaisOptions } from "./useHaisOptions";

type Mode = "handover" | "config";

type Props = {
  asset: Asset;
  mode: Mode;
  onClose: () => void;
  onDone: (updated: Asset) => void;
};

const pickConfig = (a: Asset): ConfigFields => ({
  processor: a.processor ?? "",
  memory: a.memory ?? "",
  operating_system: a.operating_system ?? "",
  storage_type: a.storage_type ?? "",
  storage: a.storage ?? "",
});

export default function AssetActionModal({ asset, mode, onClose, onDone }: Props) {
  const isHandover = mode === "handover";
  // Dropdown values, loaded from the DB masters.
  const { departments, storageTypes } = useHaisOptions();

  // Handover fields
  const [toUserId, setToUserId] = useState("");
  const [toUserName, setToUserName] = useState("");
  const [department, setDepartment] = useState(asset.department ?? "");
  const [location, setLocation] = useState(asset.current_location ?? "");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [alsoUpgrade, setAlsoUpgrade] = useState(false);

  // Config fields (shared: handover-upgrade + config-only update)
  const [config, setConfig] = useState<ConfigFields>(pickConfig(asset));
  const setCfg = (k: keyof ConfigFields) => (v: string) => setConfig((c) => ({ ...c, [k]: v }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Emp ID is optional here, but if entered it is auto-prefixed with the company
  // code (JWPL) and uppercased — same rule as the Add form.
  const setEmpId = (raw: string) => {
    const code = raw.toUpperCase().replace(/\s+/g, "").replace(/^(JWPL)+/, "");
    setToUserId(code ? `JWPL${code}` : "");
  };

  const submit = async () => {
    setError("");
    if (isHandover && !toUserName.trim()) {
      setError("New user's Name is required.");
      return;
    }
    if (!isHandover && !reason.trim()) {
      setError("Please describe what changed (reason).");
      return;
    }
    setBusy(true);
    try {
      const updated = isHandover
        ? await haisService.handover(asset.asset_id, {
            to_user_id: toUserId.trim(),
            to_user_name: toUserName.trim() || undefined,
            department: department || undefined,
            location: location || undefined,
            handover_date: date || undefined,
            reason: reason.trim() || undefined,
            config: alsoUpgrade ? config : undefined,
          })
        : await haisService.updateConfig(asset.asset_id, {
            config,
            service_date: date || undefined,
            reason: reason.trim() || undefined,
          });
      onDone(updated);
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  const configInputs = (
    <FormGrid>
      <Field label="Processor">
        {(c) => (
          <Input {...c} value={config.processor ?? ""} onChange={(e) => setCfg("processor")(e.target.value)} />
        )}
      </Field>
      <Field label="Memory (RAM)">
        {(c) => (
          <Input {...c} value={config.memory ?? ""} onChange={(e) => setCfg("memory")(e.target.value)} placeholder="e.g. 16 GB" />
        )}
      </Field>
      <Field label="Operating system">
        {(c) => (
          <Input {...c} value={config.operating_system ?? ""} onChange={(e) => setCfg("operating_system")(e.target.value)} />
        )}
      </Field>
      <Field label="Storage type">
        {(c) => (
          <Select {...c} value={config.storage_type ?? ""} onChange={(e) => setCfg("storage_type")(e.target.value)}>
            <option value="">— Select —</option>
            {storageTypes.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Storage">
        {(c) => (
          <Input {...c} value={config.storage ?? ""} onChange={(e) => setCfg("storage")(e.target.value)} placeholder="e.g. 512 GB" />
        )}
      </Field>
    </FormGrid>
  );

  const title = isHandover ? "Handover" : "Update configuration";

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent title={`${title} — ${asset.asset_id}`} size="lg">
        <DialogHeader className="items-start">
          <div className="min-w-0">
            <DialogTitle>
              {title} — <span className={MONO}>{asset.asset_id}</span>
            </DialogTitle>
            <DialogDescription>
              Currently with{" "}
              <strong className="font-semibold text-ink">
                {asset.current_user_name || asset.current_user_id || "—"}
              </strong>
              {" · "}Config: {configSummary(asset) || "—"}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {isHandover ? (
            <>
              <section className="space-y-3">
                <SectionHeading>New holder</SectionHeading>
                <FormGrid>
                  <Field label="New user name" required>
                    {(c) => (
                      <Input {...c} value={toUserName} onChange={(e) => setToUserName(e.target.value.toUpperCase())} placeholder="e.g. PRIYA NAIR" />
                    )}
                  </Field>
                  <Field label="New user ID (Emp ID)" hint="Auto-prefixed with JWPL">
                    {(c) => (
                      <Input {...c} className={MONO} value={toUserId} onChange={(e) => setEmpId(e.target.value)} placeholder="JWPL0001" />
                    )}
                  </Field>
                  <Field label="Department">
                    {(c) => (
                      <Select {...c} value={department} onChange={(e) => setDepartment(e.target.value)}>
                        <option value="">— Select —</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Location">
                    {(c) => <Input {...c} value={location} onChange={(e) => setLocation(e.target.value)} />}
                  </Field>
                  <Field label="Handover date">
                    {() => <DateInput value={date} onChange={setDate} />}
                  </Field>
                  <Field label="Reason" span="full">
                    {(c) => (
                      <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Previous user left / role change" />
                    )}
                  </Field>
                </FormGrid>
              </section>

              <Checkbox
                label="Also change configuration for the new user"
                hint="e.g. the hardware team increases RAM at handover."
                checked={alsoUpgrade}
                onChange={(e) => setAlsoUpgrade(e.target.checked)}
              />
              {alsoUpgrade && (
                <section className="space-y-3">
                  <SectionHeading>New configuration</SectionHeading>
                  {configInputs}
                </section>
              )}
            </>
          ) : (
            <>
              <Notice tone="info">
                Use this when only the hardware changed (no new user). The before → after
                change is saved in the device history.
              </Notice>
              <section className="space-y-3">
                <SectionHeading>New configuration</SectionHeading>
                {configInputs}
              </section>
              <FormGrid>
                <Field label="Change / service date">
                  {() => <DateInput value={date} onChange={setDate} />}
                </Field>
                <Field label="Reason / note" required span="full">
                  {(c) => (
                    <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. RAM upgraded on user request" />
                  )}
                </Field>
              </FormGrid>
            </>
          )}

          {error && <Notice tone="bad">{error}</Notice>}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : isHandover ? "Confirm handover" : "Save change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
