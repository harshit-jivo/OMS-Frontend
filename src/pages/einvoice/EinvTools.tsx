import { useState } from "react";
import { HiHeart, HiKey, HiServerStack, HiIdentification } from "react-icons/hi2";
import { einvoiceService } from "../../services/einvoiceService";
import { NicField, JsonView, StatusBadge, ErrorAlert } from "../../components/NicUI";
import { messageFrom } from "@/lib/apiError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, CardTitle } from "@/components/ui/page";

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
      <Card>
        <CardHeader>
          <CardTitle>Connection & Auth</CardTitle>
        </CardHeader>
        <p className="text-[12.5px] leading-relaxed text-subtle">Check configuration and the NIC handshake without generating anything.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button disabled={!!busy}
            onClick={() => void call("health", "Health", einvoiceService.health)}>
            <HiServerStack aria-hidden="true" />
            {busy === "health" ? "…" : "Health"}
          </Button>
          <Button disabled={!!busy}
            onClick={() => void call("token", "Auth Token", einvoiceService.token)}>
            <HiKey aria-hidden="true" />
            {busy === "token" ? "…" : "Get Token"}
          </Button>
          <Button disabled={!!busy}
            onClick={() => void call("hb", "Heartbeat", einvoiceService.heartbeat)}>
            <HiHeart aria-hidden="true" />
            {busy === "hb" ? "…" : "Heartbeat"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GSTIN Master</CardTitle>
        </CardHeader>
        <div className="grid gap-x-5 gap-y-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <NicField label="GSTIN" full>
            <Input className="font-mono" value={gstin} onChange={(e) => setGstin(e.target.value)}
              placeholder="06AACCJ4223F1Z0" />
          </NicField>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button disabled={!!busy || !gstin.trim()}
            onClick={() => void call("gstin", "GSTIN Details", () => einvoiceService.getGstin(gstin.trim()))}>
            <HiIdentification aria-hidden="true" />
            {busy === "gstin" ? "…" : "Get Details"}
          </Button>
          <Button disabled={!!busy || !gstin.trim()}
            onClick={() => void call("sync", "GSTIN Sync", () => einvoiceService.syncGstin(gstin.trim()))}>
            {busy === "sync" ? "…" : "Force Sync"}
          </Button>
        </div>
      </Card>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      {out ? (
        <Card>
          <CardHeader>
            <CardTitle>{out.title}</CardTitle>
            {isOk(out.data) !== null ? (
              <StatusBadge tone={isOk(out.data) ? "ok" : "err"}>{isOk(out.data) ? "OK" : "Not OK"}</StatusBadge>
            ) : null}
          </CardHeader>
          <JsonView data={out.data} title="Response" open />
        </Card>
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
