import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchAllRobawsApi,
  validateRobawsApi,
} from "../src/lib/integrations/robaws-client-core.ts";

const credentials = { key: "test-key", secret: "test-secret" };

test("ROBAWS validation checks every required read endpoint with Basic auth", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), authorization: init.headers.Authorization });
    return Response.json({ items: [], totalPages: 1 });
  };

  await validateRobawsApi({ credentials, fetchImpl });

  assert.equal(requests.length, 4);
  assert.deepEqual(
    requests.map(request => new URL(request.url).pathname).sort(),
    ["/api/v2/clients", "/api/v2/offers", "/api/v2/projects", "/api/v2/sales-invoices"],
  );
  assert.ok(requests.every(request => request.authorization === "Basic dGVzdC1rZXk6dGVzdC1zZWNyZXQ="));
  assert.ok(requests.every(request => new URL(request.url).searchParams.get("size") === "1"));
});

test("ROBAWS validation surfaces the failing endpoint and HTTP 401", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    return path.endsWith("/sales-invoices")
      ? Response.json({ message: "Unauthorized" }, { status: 401 })
      : Response.json({ items: [], totalPages: 1 });
  };

  await assert.rejects(
    validateRobawsApi({ credentials, fetchImpl }),
    /ROBAWS sales-invoices: HTTP 401 — Unauthorized/,
  );
});

test("ROBAWS pagination returns each source record once", async () => {
  const fetchImpl = async (url) => {
    const page = Number(new URL(url).searchParams.get("page"));
    return Response.json({ items: [{ id: `row-${page}` }], totalPages: 2 });
  };

  const rows = await fetchAllRobawsApi("offers", {}, { credentials, fetchImpl });
  assert.deepEqual(rows, [{ id: "row-0" }, { id: "row-1" }]);
});
