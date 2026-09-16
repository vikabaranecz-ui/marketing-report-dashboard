import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IntegrationProvider } from "./types";

type OAuthState = {
  companyId: string;
  provider: IntegrationProvider;
  userId: string;
  issuedAt: number;
  nonce: string;
};

export function createOAuthState(input: Omit<OAuthState, "issuedAt" | "nonce">) {
  const payload: OAuthState = { ...input, issuedAt: Date.now(), nonce: randomBytes(16).toString("hex") };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyOAuthState(value: string): OAuthState {
  const [encoded, supplied] = value.split(".");
  if (!encoded || !supplied) throw new Error("Invalid OAuth state.");
  const expected = signature(encoded);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) throw new Error("Invalid OAuth state.");
  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
  if (Date.now() - parsed.issuedAt > 10 * 60 * 1000) throw new Error("OAuth state has expired.");
  return parsed;
}

function signature(payload: string) {
  const secret = process.env.INTEGRATION_STATE_SECRET;
  if (!secret || secret.length < 32) throw new Error("INTEGRATION_STATE_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
