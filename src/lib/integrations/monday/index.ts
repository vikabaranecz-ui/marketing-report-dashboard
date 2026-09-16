import { ServerOnlyConnector } from "../base";
import type { MondayColumnMapping, NormalizedCrmLead } from "../types";

type MondayItem = { id: string; created_at: string; column_values: Array<{ id: string; text?: string | null; value?: string | null }> };

export class MondayConnector extends ServerOnlyConnector<MondayItem, NormalizedCrmLead> {
  provider = "monday" as const;
  constructor(private readonly mapping: MondayColumnMapping) { super(); }
  async fetch(): Promise<MondayItem[]> { this.requireSecret("MONDAY_CLIENT_ID"); throw new Error("Monday importer is prepared but not enabled until OAuth credentials, a board, and column mappings are selected."); }
  normalize(companyId: string, rows: MondayItem[]): NormalizedCrmLead[] {
    return rows.map((item) => { const values = new Map(item.column_values.map((column) => [column.id, column.text ?? column.value ?? undefined])); const get = (key: keyof MondayColumnMapping) => this.mapping[key] ? values.get(this.mapping[key] as string) : undefined; return { externalId: item.id, companyId, createdAt: item.created_at, salesperson: get("salesperson"), status: get("leadStatus"), qualification: get("qualification"), appointment: get("appointment"), quoteStatus: get("quoteStatus"), quoteAmount: numeric(get("quoteAmount")), outcome: get("outcome"), lostReason: get("lostReason"), projectValue: numeric(get("projectValue")) }; });
  }
}

function numeric(value: string | undefined) { if (!value) return undefined; const parsed = Number(value.replace(/[^0-9,.-]/g, "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : undefined; }
