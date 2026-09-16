import { NextResponse } from "next/server";
import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider } from "@/lib/integrations/catalog";
import { credentialStore } from "@/lib/integrations/credentials";
import { generateWebsiteFormsSecret } from "@/lib/integrations/website-forms";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const access = await requireWebsiteFormsAccess(request, params);

  if ("response" in access) return access.response;

  try {
    const credential = await credentialStore.read(
      access.connection.id,
      "website_forms",
    );

    return noStoreJson({ secretPresent: Boolean(credential?.accessToken) });
  } catch (error) {
    return noStoreJson(
      {
        error: error instanceof Error
          ? error.message
          : "Unable to check the Website Forms signing secret.",
      },
      500,
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const access = await requireWebsiteFormsAccess(request, params);

  if ("response" in access) return access.response;

  let body: { action?: unknown };
  try {
    body = await request.json() as { action?: unknown };
  } catch {
    return noStoreJson({ error: "Request body must be valid JSON." }, 400);
  }

  if (body.action !== "rotate") {
    return noStoreJson(
      { error: "Only action=rotate is supported. Existing secrets cannot be revealed." },
      400,
    );
  }

  try {
    const secret = generateWebsiteFormsSecret();
    await credentialStore.write(
      access.connection.id,
      "website_forms",
      { accessToken: secret, scopes: [] },
    );

    return noStoreJson({
      secret,
      message:
        "Copy this signing secret now. It will not be shown again.",
    });
  } catch (error) {
    return noStoreJson(
      {
        error: error instanceof Error
          ? error.message
          : "Unable to rotate the Website Forms signing secret.",
      },
      500,
    );
  }
}

async function requireWebsiteFormsAccess(
  request: Request,
  params: Promise<{ provider: string }>,
) {
  const provider = parseProvider((await params).provider);

  if (provider !== "website_forms") {
    return {
      response: noStoreJson(
        { error: "Signing-secret management is only available for Website Forms." },
        404,
      ),
    };
  }

  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  if (!companyId) {
    return {
      response: noStoreJson({ error: "companyId is required." }, 400),
    };
  }

  const access = await requireIntegrationConnection(companyId, provider);
  if ("error" in access) {
    return {
      response: noStoreJson({ error: access.error }, access.status),
    };
  }

  return access;
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
