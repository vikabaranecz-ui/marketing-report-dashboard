import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ensureWebsiteFormsCredential,
  verifyWebsiteFormsSignature,
} from "../src/lib/integrations/website-forms.ts";

const secret = "a-secure-signing-secret-that-is-at-least-32-bytes";
const body = JSON.stringify({ company: "reno-rangers", name: "Test Lead" });
const now = Date.parse("2026-09-16T12:00:00.000Z");
const timestamp = String(now / 1000);

function signedHeaders(signingSecret = secret, requestTimestamp = timestamp) {
  const signature = createHmac("sha256", signingSecret)
    .update(`${requestTimestamp}.${body}`)
    .digest("hex");

  return new Headers({
    "x-lead-timestamp": requestTimestamp,
    "x-lead-signature": `sha256=${signature}`,
    "x-idempotency-key": "lead-1",
  });
}

test("accepts a valid Website Forms HMAC", async () => {
  assert.deepEqual(
    await verifyWebsiteFormsSignature({
      body,
      headers: signedHeaders(),
      secret,
      now,
    }),
    { ok: true },
  );
});

test("rejects an invalid Website Forms HMAC", async () => {
  assert.deepEqual(
    await verifyWebsiteFormsSignature({
      body,
      headers: signedHeaders("a-different-secret-that-is-at-least-32-bytes"),
      secret,
      now,
    }),
    { ok: false, error: "Invalid request signature.", status: 401 },
  );
});

test("rejects an expired Website Forms timestamp", async () => {
  const expiredTimestamp = String((now - 5 * 60 * 1000 - 1) / 1000);

  assert.deepEqual(
    await verifyWebsiteFormsSignature({
      body,
      headers: signedHeaders(secret, expiredTimestamp),
      secret,
      now,
    }),
    {
      ok: false,
      error: "The request timestamp is invalid or expired.",
      status: 401,
    },
  );
});

test("returns unavailable when the Vault credential is missing", async () => {
  assert.deepEqual(
    await verifyWebsiteFormsSignature({
      body,
      headers: signedHeaders(),
      secret: null,
      now,
    }),
    {
      ok: false,
      error: "Lead ingestion is not configured for this company.",
      status: 503,
    },
  );
});

test("reconnect keeps the existing Website Forms secret", async () => {
  let writes = 0;
  const store = {
    async read() {
      return { accessToken: secret, scopes: [] };
    },
    async write() {
      writes += 1;
    },
  };

  const result = await ensureWebsiteFormsCredential(
    "connection-1",
    store,
    () => {
      throw new Error("A reconnect must not generate a new secret.");
    },
  );

  assert.deepEqual(result, { created: false });
  assert.equal(writes, 0);
});

test("Website Forms no longer depends on LEAD_INGEST_SECRETS_JSON", async () => {
  const [catalog, ingest] = await Promise.all([
    readFile(new URL("../src/lib/integrations/catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/leads/ingest/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(catalog.includes("LEAD_INGEST_SECRETS_JSON"), false);
  assert.equal(ingest.includes("LEAD_INGEST_SECRETS_JSON"), false);
});
