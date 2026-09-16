import "server-only";
import type { IntegrationProvider } from "./types";

export type ProviderCredential = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
};

export interface CredentialStore {
  readonly ready: boolean;
  read(connectionId: string, provider: IntegrationProvider): Promise<ProviderCredential | null>;
  write(connectionId: string, provider: IntegrationProvider, credential: ProviderCredential): Promise<void>;
  remove(connectionId: string, provider: IntegrationProvider): Promise<void>;
}

class SecurityReviewPendingStore implements CredentialStore {
  readonly ready = false;
  async read(): Promise<ProviderCredential | null> { throw pending(); }
  async write(): Promise<void> { throw pending(); }
  async remove(): Promise<void> { throw pending(); }
}

export const credentialStore: CredentialStore = new SecurityReviewPendingStore();

function pending() { return new Error("Provider credential storage is disabled pending security review."); }
