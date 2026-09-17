import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseGoogleAppConfig } from "../src/lib/integrations/google/app-config-core.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Google app configuration validates a complete Vault payload", () => {
  const config = parseGoogleAppConfig(JSON.stringify({
    clientId: "client-id",
    clientSecret: "client-secret",
    projectId: "project-id",
  }));

  assert.deepEqual(config, {
    clientId: "client-id",
    clientSecret: "client-secret",
    projectId: "project-id",
  });
  assert.deepEqual(Object.keys(config).sort(), ["clientId", "clientSecret", "projectId"]);
});

test("missing Google app configuration fails closed", () => {
  assert.throws(
    () => parseGoogleAppConfig({ clientId: "client-id" }),
    /incomplete/,
  );
});

test("Google runtime code has no Google credential environment dependency", async () => {
  const sources = await Promise.all([
    read("src/lib/integrations/oauth.ts"),
    read("src/lib/integrations/google/client.ts"),
    read("src/lib/integrations/catalog.ts"),
  ]);
  const combined = sources.join("\n");

  assert.doesNotMatch(combined, /GOOGLE_OAUTH_CLIENT_ID/);
  assert.doesNotMatch(combined, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.doesNotMatch(combined, /GOOGLE_ADS_DEVELOPER_TOKEN/);
  assert.doesNotMatch(combined, /GOOGLE_CLOUD_PROJECT_ID/);
});

test("Google app config stays server-only and OAuth tokens stay in credentialStore", async () => {
  const appConfig = await read("src/lib/integrations/google/app-config.ts");
  const googleClient = await read("src/lib/integrations/google/client.ts");
  const callback = await read("src/app/api/integrations/[provider]/callback/route.ts");

  assert.match(appConfig, /^import "server-only";/);
  assert.match(appConfig, /reporting_get_app_integration_secret/);
  assert.match(googleClient, /credentialStore\.read\(connectionId, provider\)/);
  assert.match(googleClient, /credentialStore\.write\(connectionId, provider, refreshed\)/);
  assert.match(callback, /credentialStore\.write/);
});

test("Google Ads uses Cloud project access without a developer token header", async () => {
  const googleClient = await read("src/lib/integrations/google/client.ts");
  const appConfigCore = await read("src/lib/integrations/google/app-config-core.ts");
  const obsoleteConfigField = ["ads", "Developer", "Token"].join("");
  const obsoleteHeader = ["developer", "token"].join("-");

  assert.match(appConfigCore, /projectId: string/);
  assert.equal(appConfigCore.includes(obsoleteConfigField), false);
  assert.equal(googleClient.includes(obsoleteConfigField), false);
  assert.equal(googleClient.includes(obsoleteHeader), false);
  assert.match(googleClient, /const config = await getGoogleAppConfig\(\);[\s\S]*credentialStore\.read/);
});

test("resource and configuration APIs never return Google app secrets", async () => {
  const sources = await Promise.all([
    read("src/app/api/integrations/[provider]/resources/route.ts"),
    read("src/app/api/integrations/[provider]/configuration/route.ts"),
  ]);
  const combined = sources.join("\n");
  const obsoleteConfigField = ["ads", "Developer", "Token"].join("");

  assert.doesNotMatch(combined, /clientSecret/);
  assert.equal(combined.includes(obsoleteConfigField), false);
  assert.doesNotMatch(combined, /reporting_get_app_integration_secret/);
});
