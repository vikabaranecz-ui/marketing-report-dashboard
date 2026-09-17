import "server-only";

import { discoverGa4Properties } from "../ga4";
import { discoverGoogleAdsCustomers } from "../google-ads";
import { discoverGoogleBusinessLocations } from "../google-business";
import { discoverSearchConsoleSites } from "../search-console";
import type { ConnectionConfiguration } from "../types";
import type { GoogleProvider } from "./client";

export type GoogleResource = {
  id: string;
  name: string;
  customer_id?: string;
  customer_name?: string;
  login_customer_id?: string;
  currency?: string | null;
  timezone?: string | null;
  property_id?: string;
  account_id?: string;
  account_name?: string;
  site_url?: string;
  location_id?: string;
  location_name?: string;
};

export async function discoverGoogleResources(
  provider: GoogleProvider,
  accessToken: string,
): Promise<GoogleResource[]> {
  if (provider === "google_ads") {
    return (await discoverGoogleAdsCustomers(accessToken)).map(resource => ({
      ...resource,
      customer_name: resource.name,
    }));
  }
  if (provider === "ga4") return discoverGa4Properties(accessToken);
  if (provider === "search_console") return discoverSearchConsoleSites(accessToken);
  return discoverGoogleBusinessLocations(accessToken);
}

export function googleResourceConfiguration(
  provider: GoogleProvider,
  resource: GoogleResource,
): ConnectionConfiguration {
  if (provider === "google_ads") {
    return compact({
      customer_id: resource.customer_id ?? resource.id,
      customer_name: resource.customer_name ?? resource.name,
      login_customer_id: resource.login_customer_id,
      currency: resource.currency ?? undefined,
      timezone: resource.timezone ?? undefined,
    });
  }
  if (provider === "ga4") {
    return compact({
      property_id: resource.property_id ?? resource.id,
      property_name: resource.name,
      account_id: resource.account_id,
      account_name: resource.account_name,
    });
  }
  if (provider === "search_console") {
    return { site_url: resource.site_url ?? resource.id };
  }
  return compact({
    account_id: resource.account_id,
    account_name: resource.account_name,
    location_id: resource.location_id ?? resource.id,
    location_name: resource.location_name ?? resource.name,
  });
}

function compact<T extends Record<string, string | undefined>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ) as ConnectionConfiguration;
}
