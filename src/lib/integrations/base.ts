import "server-only";
import type { IntegrationConnector, IntegrationProvider, SyncWindow } from "./types";

export abstract class ServerOnlyConnector<TRaw, TNormalized> implements IntegrationConnector<TRaw, TNormalized> {
  abstract provider: IntegrationProvider;
  abstract fetch(companyId: string, window: SyncWindow): Promise<TRaw[]>;
  abstract normalize(companyId: string, records: TRaw[]): TNormalized[];

  protected requireSecret(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`${this.provider} is not configured: missing ${name}`);
    return value;
  }
}
