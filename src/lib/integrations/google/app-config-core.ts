export type GoogleAppConfig = {
  clientId: string;
  clientSecret: string;
  projectId: string;
};

export function parseGoogleAppConfig(value: unknown): GoogleAppConfig {
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Google application configuration is invalid.");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Google application configuration is invalid.");
  }

  const record = parsed as Record<string, unknown>;
  const config = {
    clientId: requiredString(record.clientId),
    clientSecret: requiredString(record.clientSecret),
    projectId: requiredString(record.projectId),
  };

  if (Object.values(config).some(value => !value)) {
    throw new Error("Google application configuration is incomplete.");
  }

  return config;
}

function requiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
