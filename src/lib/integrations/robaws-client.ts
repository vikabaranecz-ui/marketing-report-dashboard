import "server-only";

import {
  fetchAllRobawsApi,
  validateRobawsApi,
  type RobawsApiOptions,
} from "./robaws-client-core";

export function validateRobawsCredentials() {
  return validateRobawsApi(optionsFromEnvironment());
}

export function fetchAllRobaws<T>(
  path: string,
  params: Record<string, string> = {},
) {
  return fetchAllRobawsApi<T>(
    path,
    params,
    optionsFromEnvironment(),
  );
}

function optionsFromEnvironment(): RobawsApiOptions {
  const key = process.env.ROBAWS_API_KEY;
  const secret = process.env.ROBAWS_API_SECRET;

  if (!key || !secret) {
    throw new Error(
      "ROBAWS_API_KEY or ROBAWS_API_SECRET is missing.",
    );
  }

  return { credentials: { key, secret } };
}
