import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type WebsiteFormsCredential = {
  accessToken: string;
  scopes: string[];
};

type WebsiteFormsCredentialStore = {
  read(
    connectionId: string,
    provider: "website_forms",
  ): Promise<WebsiteFormsCredential | null>;
  write(
    connectionId: string,
    provider: "website_forms",
    credential: WebsiteFormsCredential,
  ): Promise<void>;
};

type SignatureVerification =
  | { ok: true }
  | { ok: false; error: string; status: 401 | 503 };

export function generateWebsiteFormsSecret() {
  return randomBytes(32).toString("base64url");
}

export async function ensureWebsiteFormsCredential(
  connectionId: string,
  store: WebsiteFormsCredentialStore,
  generateSecret: () => string = generateWebsiteFormsSecret,
) {
  const existing = await store.read(connectionId, "website_forms");

  if (existing?.accessToken) {
    return { created: false };
  }

  await store.write(connectionId, "website_forms", {
    accessToken: generateSecret(),
    scopes: [],
  });

  return { created: true };
}

export async function verifyWebsiteFormsSignature({
  body,
  headers,
  secret,
  now = Date.now(),
}: {
  body: string;
  headers: Headers;
  secret: string | null | undefined;
  now?: number;
}): Promise<SignatureVerification> {
  if (!secret) {
    return {
      ok: false,
      error: "Lead ingestion is not configured for this company.",
      status: 503,
    };
  }

  const timestamp = headers.get("x-lead-timestamp") ?? "";
  const supplied =
    headers.get("x-lead-signature")?.replace(/^sha256=/, "") ?? "";
  const seconds = Number(timestamp);

  if (
    !Number.isFinite(seconds) ||
    Math.abs(now - seconds * 1000) > 5 * 60 * 1000
  ) {
    return {
      ok: false,
      error: "The request timestamp is invalid or expired.",
      status: 401,
    };
  }

  if (!/^[a-f\d]{64}$/i.test(supplied)) {
    return {
      ok: false,
      error: "Invalid request signature.",
      status: 401,
    };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return {
      ok: false,
      error: "Invalid request signature.",
      status: 401,
    };
  }

  return { ok: true };
}
