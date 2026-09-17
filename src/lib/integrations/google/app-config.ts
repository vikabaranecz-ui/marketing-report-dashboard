import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parseGoogleAppConfig,
  type GoogleAppConfig,
} from "./app-config-core";

const GOOGLE_APP_CONFIG_KEY = "google";

export async function getGoogleAppConfig(): Promise<GoogleAppConfig> {
  const payload = await readGoogleAppConfigPayload();

  if (!payload) {
    throw new Error("Google application configuration is not set in Supabase Vault.");
  }

  return parseGoogleAppConfig(payload);
}

export async function isGoogleAppConfigured() {
  try {
    await getGoogleAppConfig();
    return true;
  } catch {
    return false;
  }
}

export async function putGoogleAppConfig(config: GoogleAppConfig): Promise<void> {
  const validated = parseGoogleAppConfig(config);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc(
    "reporting_put_app_integration_secret",
    {
      p_integration_key: GOOGLE_APP_CONFIG_KEY,
      p_secret: JSON.stringify(validated),
    },
  );

  if (error) {
    throw new Error(`Unable to store Google application configuration: ${error.message}`);
  }
}

async function readGoogleAppConfigPayload(): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "reporting_get_app_integration_secret",
    { p_integration_key: GOOGLE_APP_CONFIG_KEY },
  );

  if (error) {
    throw new Error(`Unable to read Google application configuration: ${error.message}`);
  }

  return typeof data === "string" && data.trim() ? data : null;
}
