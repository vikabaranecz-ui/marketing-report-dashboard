"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cable, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import type { Integration } from "@/lib/data/types";
import { Card, StatusPill } from "./ui";

type Action = "authorize" | "sync" | "disconnect";
type RequestResult = {
  authorizationUrl?: string;
  error?: string;
  message?: string;
  recordsImported?: number;
  leadsImported?: number;
  leadsMatched?: number;
  dealsImported?: number;
  quotesImported?: number;
  projectsImported?: number;
  invoicesImported?: number;
  revenueImported?: number;
  startedAt?: string;
  completedAt?: string;
};

export function IntegrationCenter({ companyId, integrations }: { companyId: string; integrations: Integration[] }) {
  const router = useRouter();
  const requestInFlight = useRef(false);
  const [pending, setPending] = useState<{ id: string; action: Action } | null>(null);
  const [messages, setMessages] = useState<Record<string, { text: string; tone: "success" | "error" | "info" }>>({});
  const [overrides, setOverrides] = useState<Record<string, Partial<Integration>>>({});

  async function run(item: Integration, action: Action) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending({ id: item.id, action });
    setMessages((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    try {
      const url = action === "authorize"
        ? `/api/integrations/${item.provider}/authorize?companyId=${encodeURIComponent(companyId)}`
        : `/api/integrations/${item.provider}/${action}`;
      const response = await fetch(url, {
        method: action === "authorize" ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: action === "authorize" ? undefined : { "content-type": "application/json" },
        body: action === "authorize" ? undefined : JSON.stringify({ companyId }),
      });
      const result = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          result.error ??
          result.message ??
          `Integration request failed: HTTP ${response.status} ${response.statusText}`.trim(),
        );
      }

      if (result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }

      const completedAt = result.completedAt ?? new Date().toISOString();
      setMessages((current) => ({
        ...current,
        [item.id]: {
          text: result.message ?? "Request completed.",
          tone: "success",
        },
      }));
      if (action === "authorize" || action === "sync") {
        setOverrides((current) => ({
          ...current,
          [item.id]: {
            ...current[item.id],
            status: "Connected",
            lastAttempt: action === "sync" ? result.startedAt ?? completedAt : current[item.id]?.lastAttempt,
            lastSuccess: action === "sync" ? completedAt : current[item.id]?.lastSuccess,
            records: action === "sync" && result.recordsImported !== undefined ? result.recordsImported : current[item.id]?.records,
            errorMessage: null,
          },
        }));
      }
      router.refresh();
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [item.id]: {
          text: error instanceof Error ? error.message : "The integration request failed.",
          tone: "error",
        },
      }));
      router.refresh();
    } finally {
      requestInFlight.current = false;
      setPending(null);
    }
  }

  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{integrations.map((item) => {
    const displayed = { ...item, ...overrides[item.id] };
    const isConnected = displayed.status === "Connected";
    const isBusy = pending?.id === item.id || displayed.status === "Connecting";
    const message = messages[item.id] ?? (displayed.errorMessage ? { text: displayed.errorMessage, tone: "error" as const } : null);
    const pendingAction = pending?.id === item.id ? pending.action : null;
    return <Card className="p-5" key={item.id}>
      <div className="flex items-start justify-between"><div className="grid h-10 w-10 place-items-center bg-[var(--surface)]"><Cable size={18}/></div><StatusPill tone={isConnected?"good":displayed.status==="Error"?"bad":"neutral"}>{displayed.status}</StatusPill></div>
      <h3 className="mt-5 font-semibold">{item.name}</h3>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Selected resource</dt><dd className="max-w-[55%] truncate text-right" title={displayed.resource}>{displayed.resource}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Last successful sync</dt><dd>{formatTimestamp(displayed.lastSuccess)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Last attempted</dt><dd>{formatTimestamp(displayed.lastAttempt)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Records imported</dt><dd>{displayed.records}</dd></div>
      </dl>
      {message && <p aria-live="polite" className={`mt-4 p-3 text-sm leading-5 ${message.tone === "error" ? "bg-rose-50 text-rose-900" : message.tone === "success" ? "bg-lime-50 text-[#344500]" : "bg-[var(--surface)] text-[var(--muted)]"}`}>{message.text}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="button-primary" disabled={!isConnected || isBusy} onClick={() => run(item,"sync")}><RefreshCw size={14}/>{pendingAction === "sync" ? "Syncing…" : "Sync now"}</button>
        <button className="button-secondary" disabled={isBusy} onClick={() => run(item,"authorize")}>{pendingAction === "authorize" ? "Connecting…" : isConnected ? "Reconnect" : "Connect"}<ExternalLink size={13}/></button>
        <button className="button-secondary" disabled={!isConnected || isBusy} onClick={() => setMessages((current) => ({ ...current, [item.id]: { text: "Resource selection is available after provider authorization returns the accessible accounts, properties, locations, or boards.", tone: "info" } }))}>Configure</button>
        {isConnected && <button className="button-secondary" disabled={isBusy} onClick={() => run(item,"disconnect")}><Unplug size={13}/>Disconnect</button>}
      </div>
    </Card>;
  })}</div>;
}

async function readResponse(response: Response): Promise<RequestResult> {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text) as RequestResult;
  } catch {
    return {
      error: `Integration endpoint returned HTTP ${response.status} with a non-JSON response: ${text.replace(/\s+/g, " ").trim().slice(0, 240)}`,
    };
  }
}

function formatTimestamp(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
