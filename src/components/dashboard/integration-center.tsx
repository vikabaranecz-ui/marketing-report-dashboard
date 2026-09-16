"use client";

import { useState } from "react";
import { Cable, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import type { Integration } from "@/lib/data/types";
import { Card, StatusPill } from "./ui";

export function IntegrationCenter({ companyId, integrations }: { companyId: string; integrations: Integration[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  async function run(item: Integration, action: "authorize" | "sync" | "disconnect") {
    setPending(item.id);
    setMessages((current) => ({ ...current, [item.id]: "" }));
    try {
      const url = action === "authorize"
        ? `/api/integrations/${item.provider}/authorize?companyId=${encodeURIComponent(companyId)}`
        : `/api/integrations/${item.provider}/${action}`;
      const response = await fetch(url, action === "authorize" ? undefined : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const result = await response.json() as { authorizationUrl?: string; error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "The integration request failed.");
      if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
      else setMessages((current) => ({ ...current, [item.id]: result.message ?? "Request completed." }));
    } catch (error) {
      setMessages((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : "The integration request failed." }));
    } finally {
      setPending(null);
    }
  }

  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{integrations.map((item) => {
    const isConnected = item.status === "Connected";
    const isBusy = pending === item.id || item.status === "Connecting";
    const message = messages[item.id] || item.errorMessage;
    return <Card className="p-5" key={item.id}>
      <div className="flex items-start justify-between"><div className="grid h-10 w-10 place-items-center bg-[var(--surface)]"><Cable size={18}/></div><StatusPill tone={isConnected?"good":item.status==="Error"?"bad":"neutral"}>{item.status}</StatusPill></div>
      <h3 className="mt-5 font-semibold">{item.name}</h3>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Selected resource</dt><dd className="max-w-[55%] truncate text-right" title={item.resource}>{item.resource}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Last successful sync</dt><dd>{formatTimestamp(item.lastSuccess)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Last attempted</dt><dd>{formatTimestamp(item.lastAttempt)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Records imported</dt><dd>{item.records}</dd></div>
      </dl>
      {message && <p className={`mt-4 p-3 text-sm leading-5 ${item.status==="Error"||messages[item.id]?"bg-amber-50 text-amber-900":"bg-[var(--surface)] text-[var(--muted)]"}`}>{message}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="button-primary" disabled={!isConnected || isBusy} onClick={() => run(item,"sync")}><RefreshCw size={14}/>{isBusy?"Working…":"Sync now"}</button>
        <button className="button-secondary" disabled={isBusy} onClick={() => run(item,"authorize")}>{isConnected?"Reconnect":"Connect"}<ExternalLink size={13}/></button>
        <button className="button-secondary" disabled={!isConnected || isBusy} onClick={() => setMessages((current) => ({ ...current, [item.id]: "Resource selection is available after provider authorization returns the accessible accounts, properties, locations, or boards." }))}>Configure</button>
        {isConnected && <button className="button-secondary" disabled={isBusy} onClick={() => run(item,"disconnect")}><Unplug size={13}/>Disconnect</button>}
      </div>
    </Card>;
  })}</div>;
}

function formatTimestamp(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
