type RobawsPage<T> = {
  items?: T[];
  totalPages?: number;
  message?: string;
};

export type RobawsApiOptions = {
  credentials: {
    key: string;
    secret: string;
  };
  fetchImpl?: typeof fetch;
};

const baseUrl = "https://app.robaws.com/api/v2/";

type RobawsProjectRef = { id:string };
type RobawsOfferRef = { id:string; projectId?:string|null; status?:string|null };

const projectAcceptedStatuses=new Set(["goedgekeurd","gefactureerd","deelfactuur"]);
const projectRejectedStatuses=new Set(["afgekeurd"]);

function normalizedStatus(value:unknown){
  return String(value??"").trim().toLowerCase();
}

export function selectRobawsProjectValueOffers<T extends RobawsOfferRef>(
  projectId:string,
  clientProjects:RobawsProjectRef[],
  clientOffers:T[],
):T[]{
  const linked=clientOffers.filter(offer=>offer.projectId===projectId);
  const linkedAccepted=linked.filter(offer=>projectAcceptedStatuses.has(normalizedStatus(offer.status)));
  if(linkedAccepted.length)return linkedAccepted;

  const linkedNonRejected=linked.filter(offer=>!projectRejectedStatuses.has(normalizedStatus(offer.status)));
  if(linkedNonRejected.length)return linkedNonRejected;

  if(clientProjects.length===1){
    const accepted=clientOffers.filter(offer=>projectAcceptedStatuses.has(normalizedStatus(offer.status)));
    if(accepted.length)return accepted;
    return clientOffers.filter(offer=>!projectRejectedStatuses.has(normalizedStatus(offer.status)));
  }

  return [];
}

export function selectRobawsClientProjectValueOffers<T extends RobawsOfferRef>(
  clientProjects:RobawsProjectRef[],
  clientOffers:T[],
):T[]{
  const selected=clientProjects.flatMap(project=>selectRobawsProjectValueOffers(project.id,clientProjects,clientOffers));
  const selectedIds=new Set(selected.map(offer=>offer.id));
  const unallocatedAccepted=clientOffers.filter(
    offer=>projectAcceptedStatuses.has(normalizedStatus(offer.status))&&!selectedIds.has(offer.id),
  );
  return [...new Map([...selected,...unallocatedAccepted].map(offer=>[offer.id,offer])).values()];
}

export async function validateRobawsApi(options: RobawsApiOptions) {
  await Promise.all(
    ["clients", "offers", "projects", "sales-invoices"].map(
      path => robawsPage(path, { page: "0", size: "1" }, options),
    ),
  );
}

export async function fetchAllRobawsApi<T>(
  path: string,
  params: Record<string, string>,
  options: RobawsApiOptions,
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;
  let totalPages = 1;

  do {
    const result = await robawsPage<T>(
      path,
      { ...params, page: String(page), size: "100" },
      options,
    );

    all.push(...(result.items ?? []));
    totalPages = Math.max(1, Number(result.totalPages ?? 1));
    page += 1;
  } while (page < totalPages);

  return all;
}

async function robawsPage<T = unknown>(
  path: string,
  params: Record<string, string>,
  options: RobawsApiOptions,
) {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const { key, secret } = options.credentials;
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = parsePayload<T>(text);

  if (!response.ok) {
    const providerMessage =
      typeof payload.message === "string" && payload.message.trim()
        ? ` — ${sanitizeMessage(payload.message)}`
        : "";

    throw new Error(
      `ROBAWS ${path}: HTTP ${response.status}${providerMessage}`,
    );
  }

  return payload;
}

function parsePayload<T>(text: string): RobawsPage<T> {
  if (!text) return {};

  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object"
      ? value as RobawsPage<T>
      : {};
  } catch {
    return { message: sanitizeMessage(text) };
  }
}

function sanitizeMessage(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}
