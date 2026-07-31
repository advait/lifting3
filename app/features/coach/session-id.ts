import { formatCoachInstanceName, type CoachTarget } from "./contracts";

const UUID_NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const COACH_SESSION_NAME_PREFIX = "https://lifting3.app/coach/";

const uuidBytes = (uuid: string): Uint8Array => {
  const hex = uuid.replaceAll("-", "");
  const bytes = new Uint8Array(16);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
};

const formatUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

/** Deterministically maps a public coach thread key to EDA's UUID session identity. */
export const deterministicUuidV5 = async (name: string): Promise<string> => {
  const namespace = uuidBytes(UUID_NAMESPACE_URL);
  const encodedName = new TextEncoder().encode(name);
  const input = new Uint8Array(namespace.length + encodedName.length);
  input.set(namespace);
  input.set(encodedName, namespace.length);

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", input));
  const bytes = digest.slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  return formatUuid(bytes);
};

export const formatCoachSessionId = async (target: CoachTarget): Promise<string> =>
  deterministicUuidV5(`${COACH_SESSION_NAME_PREFIX}${formatCoachInstanceName(target)}`);
