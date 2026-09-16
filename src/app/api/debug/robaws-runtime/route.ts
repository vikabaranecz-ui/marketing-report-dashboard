import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { requireIntegrationConnection } from "@/lib/integrations/access";

export const runtime = "nodejs";

const ROBAWS_CLIENTS_URL =
  "https://app.robaws.com/api/v2/clients?page=0&size=1";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";

  if (!companyId) {
    return json({ error: "companyId is required." }, 400);
  }

  const access = await requireIntegrationConnection(companyId, "robaws");

  if ("error" in access) {
    return json({ error: access.error }, access.status);
  }

  const key = process.env.ROBAWS_API_KEY ?? "";
  const secret = process.env.ROBAWS_API_SECRET ?? "";
  let robawsHttpStatus: number | null = null;
  let robawsOk = false;

  try {
    const response = await fetch(ROBAWS_CLIENTS_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      },
      cache: "no-store",
    });

    robawsHttpStatus = response.status;
    robawsOk = response.ok;
  } catch {
    // Network failures intentionally expose no detail that could include credentials.
  }

  return json({
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    keyPresent: key.length > 0,
    keyLength: key.length,
    keySha256Prefix: sha256Prefix(key),
    secretPresent: secret.length > 0,
    secretLength: secret.length,
    secretSha256Prefix: sha256Prefix(secret),
    robawsHttpStatus,
    robawsOk,
  });
}

function sha256Prefix(value: string) {
  return value
    ? createHash("sha256").update(value).digest("hex").slice(0, 12)
    : null;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
