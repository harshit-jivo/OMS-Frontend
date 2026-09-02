import { useState } from "react";
import { HiHeart, HiKey, HiServerStack, HiIdentification } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import { NicField, JsonView, StatusBadge, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";

export default function EinvTools() {
  const [gstin, setGstin] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [out, setOut] = useState<{ title: string; data: unknown } | null>(null);

  const call = async (key: string, title: string, fn: () => Promise<unknown>) => {
    setError(""); setOut(null); setBusy(key);
    try {
      setOut({ title, data: await fn() });
    } catch (err) {
      setError(messageFrom(err, "Request failed"));
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <section className="ofs-card">
        <div className="ofs-card-head">
          <span className="ofs-card-mark" />
          <h2>Connection & Auth</h2>
        </div>
        <p className="nic-note">Check configuration and the NIC handshake without generating anything.</p>
        <div className="nic-actions-row">
          <button className="ofs-secondary" disabled={!!busy}
            onClick={() => void call("health", "Health", einvoiceService.health)}>
            <HiServerStack className="nic-icon-lead" />
            {busy === "health" ? "…" : "Health"}
          </button>
          <button className="ofs-secondary" disabled={!!busy}
            onClick={() => void call("token", "Auth Token", einvoiceService.token)}>
            <HiKey className="nic-icon-lead" />
            {busy === "token" ? "…" : "Get Token"}
          </button>
          <button className="ofs-secondary" disabled={!!busy}
            onClick={() => void call("hb", "Heartbeat", einvoiceService.heartbeat)}>
            <HiHeart className="nic-icon-lead" />
            {busy === "hb" ? "…" : "Heartbeat"}
          </button>
        </div>
      </section>

      <section className="ofs-card">
        <div className="ofs-card-head">
          <span className="ofs-card-mark" />
          <h2>GSTIN Master</h2>
        </div>
        <div className="nic-form-grid">
          <NicField label="GSTIN" full>
            <input className="nic-input nic-mono" value={gstin} onChange={(e) => setGstin(e.target.value)}
              placeholder="06AACCJ4223F1Z0" />
          </NicField>
        </div>
        <div className="nic-actions-row">
          <button className="ofs-secondary" disabled={!!busy || !gstin.trim()}
            onClick={() => void call("gstin", "GSTIN Details", () => einvoiceService.getGstin(gstin.trim()))}>
            <HiIdentification className="nic-icon-lead" />
            {busy === "gstin" ? "…" : "Get Details"}
          </button>
          <button className="ofs-secondary" disabled={!!busy || !gstin.trim()}
            onClick={() => void call("sync", "GSTIN Sync", () => einvoiceService.syncGstin(gstin.trim()))}>
            {busy === "sync" ? "…" : "Force Sync"}
          </button>
        </div>
      </section>

      {error ? <div className="ofs-card ofs-card--wide"><ErrorAlert>{error}</ErrorAlert></div> : null}
      {out ? (
        <section className="ofs-card ofs-card--wide">
          <div className="ofs-card-head">
            <span className="ofs-card-mark" />
            <h2>{out.title}</h2>
            {isOk(out.data) !== null ? (
              <StatusBadge tone={isOk(out.data) ? "ok" : "err"}>{isOk(out.data) ? "OK" : "Not OK"}</StatusBadge>
            ) : null}
          </div>
          <JsonView data={out.data} title="Response" open />
        </section>
      ) : null}
    </>
  );
}

function isOk(data: unknown): boolean | null {
  if (data && typeof data === "object" && "ok" in (data as Record<string, unknown>)) {
    return Boolean((data as { ok?: unknown }).ok);
  }
  return null;
}
