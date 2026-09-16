import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const envPath = resolve(process.cwd(), ".env.local");
const env = parseEnv(readFileSync(envPath, "utf8"));
const key = env.ROBAWS_API_KEY ?? "";
const secret = env.ROBAWS_API_SECRET ?? "";

console.log(JSON.stringify({
  keyPresent: key.length > 0,
  keyLength: key.length,
  keySha256Prefix: sha256Prefix(key),
  secretPresent: secret.length > 0,
  secretLength: secret.length,
  secretSha256Prefix: sha256Prefix(secret),
}, null, 2));

function sha256Prefix(value) {
  return value
    ? createHash("sha256").update(value).digest("hex").slice(0, 12)
    : null;
}
