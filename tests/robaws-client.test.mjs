import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchAllRobawsApi,
  selectRobawsClientProjectValueOffers,
  selectRobawsProjectValueOffers,
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


test("ROBAWS project value excludes rejected sibling offers when an accepted offer exists", () => {
  const projects = [{ id: "46" }];
  const offers = [
    { id: "approved", projectId: "46", status: "goedgekeurd", totalInclVat: 27565.57 },
    { id: "rejected", projectId: "46", status: "afgekeurd", totalInclVat: 35848.67 },
  ];

  const projectOffers = selectRobawsProjectValueOffers("46", projects, offers);
  const clientOffers = selectRobawsClientProjectValueOffers(projects, offers);

  assert.deepEqual(projectOffers.map(row => row.id), ["approved"]);
  assert.deepEqual(clientOffers.map(row => row.id), ["approved"]);
});

test("ROBAWS client project value keeps accepted offers that cannot be allocated to a project", () => {
  const projects = [{ id: "39" }, { id: "40" }];
  const offers = [
    { id: "accepted-unlinked", projectId: null, status: "gefactureerd", totalInclVat: 11917.58 },
    { id: "rejected-linked", projectId: "39", status: "afgekeurd", totalInclVat: 5000 },
  ];

  assert.deepEqual(selectRobawsProjectValueOffers("39", projects, offers), []);
  assert.deepEqual(
    selectRobawsClientProjectValueOffers(projects, offers).map(row => row.id),
    ["accepted-unlinked"],
  );
});

test("ROBAWS single-project fallback never uses rejected-only offer value", () => {
  const projects = [{ id: "1" }];
  const offers = [{ id: "rejected", projectId: null, status: "afgekeurd", totalInclVat: 10000 }];

  assert.deepEqual(selectRobawsProjectValueOffers("1", projects, offers), []);
  assert.deepEqual(selectRobawsClientProjectValueOffers(projects, offers), []);
});
