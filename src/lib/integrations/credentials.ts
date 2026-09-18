import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { IntegrationProvider } from "./types";

export type ProviderCredential = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
  permissionStatuses?: Record<string, string>;
};

export interface CredentialStore {
  readonly ready: boolean;
  read(
    connectionId: string,
    provider: IntegrationProvider,
  ): Promise<ProviderCredential | null>;
  write(
    connectionId: string,
    provider: IntegrationProvider,
    credential: ProviderCredential,
  ): Promise<void>;
  remove(
    connectionId: string,
    provider: IntegrationProvider,
  ): Promise<void>;
}

type StoredCredential = {
  provider: IntegrationProvider;
  credential: ProviderCredential;
};

class SupabaseVaultCredentialStore implements CredentialStore {
  readonly ready = true;

  async read(
    connectionId: string,
    provider: IntegrationProvider,
  ): Promise<ProviderCredential | null> {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase.rpc(
      "reporting_get_integration_secret",
      {
        p_connection_id: connectionId,
      },
    );

    if (error) {
      throw new Error(`Unable to read integration credential: ${error.message}`);
    }

    if (!data) return null;

    const stored = JSON.parse(data as string) as StoredCredential;

    if (stored.provider !== provider) {
      throw new Error("Stored integration credential provider mismatch.");
    }

    return stored.credential;
  }

  async write(
    connectionId: string,
    provider: IntegrationProvider,
    credential: ProviderCredential,
  ): Promise<void> {
    const supabase = createSupabaseAdminClient();

    const payload: StoredCredential = {
      provider,
      credential,
    };

    const { error } = await supabase.rpc(
      "reporting_put_integration_secret",
      {
        p_connection_id: connectionId,
        p_secret: JSON.stringify(payload),
      },
    );

    if (error) {
      throw new Error(`Unable to store integration credential: ${error.message}`);
    }
  }

  async remove(
    connectionId: string,
    provider: IntegrationProvider,
  ): Promise<void> {
    const existing = await this.read(connectionId, provider);

    if (!existing) return;

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.rpc(
      "reporting_delete_integration_secret",
      {
        p_connection_id: connectionId,
      },
    );

    if (error) {
      throw new Error(`Unable to remove integration credential: ${error.message}`);
    }
  }
}

export const credentialStore: CredentialStore =
  new SupabaseVaultCredentialStore();
