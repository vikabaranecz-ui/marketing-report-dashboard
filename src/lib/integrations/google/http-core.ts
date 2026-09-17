export type GoogleApiContext = {
  apiName: string;
  resource?: string;
  retryQuota?: boolean;
  quotaHelp?: string;
};

type GoogleJsonRequest = {
  request?: RequestInit;
  headers?: Record<string, string>;
  context: GoogleApiContext;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  maxRetries?: number;
};

export async function requestGoogleJson<T>(
  url: string | URL,
  accessToken: string,
  options: GoogleJsonRequest,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetchImpl(url, {
      ...options.request,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.request?.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
        ...(options.request?.headers ?? {}),
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.ok) return body as T;

    const parsed = parseGoogleApiError(response.status, body, options.context);
    const quotaFailure = response.status === 429 || parsed.canonicalStatus === "RESOURCE_EXHAUSTED";
    if (!options.context.retryQuota || !quotaFailure || attempt === maxRetries) {
      throw new Error(formatGoogleApiError(parsed, options.context, quotaFailure && attempt === maxRetries, maxRetries));
    }

    await sleep(retryDelayMilliseconds(response.headers.get("retry-after"), attempt, random));
  }

  throw new Error(`${options.context.apiName} failed after quota retries.`);
}

export function parseGoogleApiError(
  httpStatus: number,
  body: Record<string, unknown>,
  context: GoogleApiContext,
) {
  const error = record(body.error);
  const canonicalStatus = text(error.status);
  const message = text(error.message) || `Request failed for ${context.resource ?? "the selected resource"}.`;
  return { httpStatus, canonicalStatus, message };
}

export function retryDelayMilliseconds(
  retryAfter: string | null,
  retryIndex: number,
  random: () => number = Math.random,
) {
  const seconds = Number(retryAfter);
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  if (retryAfter) {
    const absolute = Date.parse(retryAfter);
    if (Number.isFinite(absolute)) return Math.max(0, absolute - Date.now());
  }
  const base = 500 * 2 ** retryIndex;
  return base + Math.floor(random() * base);
}

function formatGoogleApiError(
  error: ReturnType<typeof parseGoogleApiError>,
  context: GoogleApiContext,
  exhausted: boolean,
  maxRetries: number,
) {
  const status = [String(error.httpStatus), error.canonicalStatus].filter(Boolean).join(" ");
  const resource = context.resource ? ` [${context.resource}]` : "";
  const suffix = exhausted
    ? ` Quota remained exhausted after ${maxRetries} retries.${context.quotaHelp ? ` ${context.quotaHelp}` : ""}`
    : "";
  return `${context.apiName} failed: HTTP ${status} — ${error.message.replace(/[.\s]+$/, "")}${resource}.${suffix}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
