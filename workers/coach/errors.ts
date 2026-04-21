import { DEFAULT_AI_GATEWAY_ID } from "./model";

const COACH_ERROR_PREFIX_PATTERN = /^(?:AI_APICallError|Error|InferenceUpstreamError):\s*/i;
const DEFAULT_COACH_ERROR_MESSAGE = "The coach could not complete this request.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractCoachErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (isRecord(error)) {
    if (typeof error.error === "string") {
      return error.error;
    }

    if (typeof error.message === "string") {
      return error.message;
    }
  }

  return null;
}

function maybeParseStructuredErrorMessage(message: string) {
  if (
    !(
      (message.startsWith("{") && message.endsWith("}")) ||
      (message.startsWith("[") && message.endsWith("]"))
    )
  ) {
    return message;
  }

  try {
    const parsed = JSON.parse(message);

    if (isRecord(parsed)) {
      if (typeof parsed.error === "string") {
        return parsed.error;
      }

      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    }
  } catch {
    return message;
  }

  return message;
}

export function normalizeCoachError(error: unknown) {
  const extractedMessage = extractCoachErrorMessage(error)?.trim();

  if (!extractedMessage) {
    return DEFAULT_COACH_ERROR_MESSAGE;
  }

  const prefixStrippedMessage = extractedMessage.replace(COACH_ERROR_PREFIX_PATTERN, "").trim();
  const parsedMessage = maybeParseStructuredErrorMessage(prefixStrippedMessage).trim();

  if (parsedMessage.length === 0) {
    return DEFAULT_COACH_ERROR_MESSAGE;
  }

  if (parsedMessage.toLowerCase().includes("insufficient balance")) {
    return `AI Gateway "${DEFAULT_AI_GATEWAY_ID}" has insufficient balance. Add funds or update the gateway's provider configuration in Cloudflare.`;
  }

  return parsedMessage;
}
