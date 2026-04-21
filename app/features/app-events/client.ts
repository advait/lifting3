import { useEffect, useEffectEvent, useRef } from "react";
import { type UIMatch, useMatches, useRevalidator } from "react-router";
import type { CoachTarget } from "../coach/contracts.ts";

import {
  type AppEventEnvelope,
  type AppInvalidateKey,
  appEventEnvelopeSchema,
  appInvalidateKeySchema,
} from "./schema.ts";

const APP_EVENT_CUSTOM_EVENT = "lifting3:app-event";
const APP_EVENT_CHANNEL = "lifting3-app-events";
type BrowserEventTarget = Pick<
  EventTarget,
  "addEventListener" | "dispatchEvent" | "removeEventListener"
> & {
  BroadcastChannel?: typeof BroadcastChannel;
};

interface AppEventRouteHandleArgs {
  loaderData: unknown;
  params: Record<string, string | undefined>;
}

type AppTopBarActionVariant =
  | "default"
  | "destructive"
  | "ghost"
  | "link"
  | "outline"
  | "secondary";

type AppTopBarLinkAction = {
  kind: "link";
  label: string;
  to: string;
  variant?: AppTopBarActionVariant;
};

type AppTopBarFormAction = {
  action?: string;
  fields: Record<string, string>;
  kind: "form";
  label: string;
  variant?: AppTopBarActionVariant;
};

export type AppTopBarAction = AppTopBarLinkAction | AppTopBarFormAction;

export interface AppEventRouteHandle {
  coachTarget?: (args: AppEventRouteHandleArgs) => CoachTarget | null;
  invalidateKeys?: (args: AppEventRouteHandleArgs) => readonly AppInvalidateKey[];
  pageTitle?: (args: AppEventRouteHandleArgs) => string | null;
  topBarAction?: (args: AppEventRouteHandleArgs) => AppTopBarAction | null;
}

/**
 * Keeps route handles explicit so mounted RR7 routes can declare which app
 * events should trigger loader revalidation.
 */
export function defineAppEventRouteHandle(handle: AppEventRouteHandle) {
  return handle;
}

function getBrowserWindow() {
  const candidate = globalThis as Partial<BrowserEventTarget>;

  if (
    typeof candidate.dispatchEvent !== "function" ||
    typeof candidate.addEventListener !== "function" ||
    typeof candidate.removeEventListener !== "function"
  ) {
    return null;
  }

  return candidate as BrowserEventTarget;
}

function getMountedInvalidateKeys(matches: UIMatch<unknown, AppEventRouteHandle>[]) {
  const keys: AppInvalidateKey[] = [];

  for (const match of matches) {
    const invalidateKeys = match.handle?.invalidateKeys;

    if (!invalidateKeys) {
      continue;
    }

    const parsedKeys = invalidateKeys({
      loaderData: match.loaderData,
      params: match.params,
    }).flatMap((key) => {
      const parsedKey = appInvalidateKeySchema.safeParse(key);

      return parsedKey.success ? [parsedKey.data] : [];
    });

    keys.push(...parsedKeys);
  }

  return [...new Set(keys)];
}

function parseAppEventEnvelope(value: unknown) {
  const parsedEnvelope = appEventEnvelopeSchema.safeParse(value);

  return parsedEnvelope.success ? parsedEnvelope.data : null;
}

function isIntersectingInvalidateSet(
  mountedKeys: readonly AppInvalidateKey[],
  envelope: AppEventEnvelope,
) {
  return envelope.invalidate.some((key) => mountedKeys.includes(key));
}

/**
 * Publishes a parsed app event into the browser transport used by the current
 * current app. A future server-backed websocket can emit the same envelope.
 */
export function publishAppEvent(envelope: unknown) {
  const browserWindow = getBrowserWindow();

  if (!browserWindow) {
    return;
  }

  const parsedEnvelope = parseAppEventEnvelope(envelope);

  if (!parsedEnvelope) {
    return;
  }

  browserWindow.dispatchEvent(
    new CustomEvent<AppEventEnvelope>(APP_EVENT_CUSTOM_EVENT, {
      detail: parsedEnvelope,
    }),
  );

  if (typeof browserWindow.BroadcastChannel === "function") {
    const channel = new browserWindow.BroadcastChannel(APP_EVENT_CHANNEL);

    channel.postMessage(parsedEnvelope);
    channel.close();
  }
}

/**
 * Bridges route action results into the app-event stream so RR7 revalidation
 * follows the same path as future websocket-driven invalidation.
 */
export function usePublishAppEvent(value: unknown) {
  const lastPublishedEventIdRef = useRef<string | null>(null);
  const publishParsedEnvelope = useEffectEvent((envelope: AppEventEnvelope) => {
    if (lastPublishedEventIdRef.current === envelope.eventId) {
      return;
    }

    lastPublishedEventIdRef.current = envelope.eventId;
    publishAppEvent(envelope);
  });

  useEffect(() => {
    const parsedEnvelope = parseAppEventEnvelope(value);

    if (!parsedEnvelope) {
      return;
    }

    publishParsedEnvelope(parsedEnvelope);
  }, [value]);
}

/**
 * Watches the browser app-event transport and revalidates mounted RR7 routes
 * when their declared invalidation keys intersect the incoming envelope.
 */
export function useAppEventRevalidation() {
  const matches = useMatches() as UIMatch<unknown, AppEventRouteHandle>[];
  const revalidator = useRevalidator();
  const pendingEnvelopeRef = useRef<AppEventEnvelope | null>(null);
  const revalidateOnEnvelope = useEffectEvent((envelope: AppEventEnvelope) => {
    const mountedKeys = getMountedInvalidateKeys(matches);

    if (mountedKeys.length === 0 || !isIntersectingInvalidateSet(mountedKeys, envelope)) {
      return;
    }

    if (revalidator.state !== "idle") {
      pendingEnvelopeRef.current = envelope;
      return;
    }

    pendingEnvelopeRef.current = null;
    void revalidator.revalidate();
  });

  useEffect(() => {
    if (revalidator.state !== "idle" || !pendingEnvelopeRef.current) {
      return;
    }

    const pendingEnvelope = pendingEnvelopeRef.current;
    const mountedKeys = getMountedInvalidateKeys(matches);

    if (mountedKeys.length === 0 || !isIntersectingInvalidateSet(mountedKeys, pendingEnvelope)) {
      pendingEnvelopeRef.current = null;
      return;
    }

    pendingEnvelopeRef.current = null;
    void revalidator.revalidate();
  }, [matches, revalidator.state]);

  useEffect(() => {
    const browserWindow = getBrowserWindow();

    if (!browserWindow) {
      return;
    }

    const onWindowEvent = (event: Event) => {
      const parsedEnvelope = parseAppEventEnvelope((event as CustomEvent<unknown>).detail);

      if (!parsedEnvelope) {
        return;
      }

      revalidateOnEnvelope(parsedEnvelope);
    };

    browserWindow.addEventListener(APP_EVENT_CUSTOM_EVENT, onWindowEvent);

    if (typeof browserWindow.BroadcastChannel !== "function") {
      return () => {
        browserWindow.removeEventListener(APP_EVENT_CUSTOM_EVENT, onWindowEvent);
      };
    }

    const channel = new browserWindow.BroadcastChannel(APP_EVENT_CHANNEL);

    channel.onmessage = (messageEvent: MessageEvent) => {
      const parsedEnvelope = parseAppEventEnvelope(messageEvent.data);

      if (!parsedEnvelope) {
        return;
      }

      revalidateOnEnvelope(parsedEnvelope);
    };

    return () => {
      browserWindow.removeEventListener(APP_EVENT_CUSTOM_EVENT, onWindowEvent);
      channel.close();
    };
  }, []);
}
