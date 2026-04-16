import type { Location, MetaDescriptor } from "react-router";

export const APP_DESCRIPTION =
  "AI-native workout planning, fast live set logging, history-first browsing, and workout-specific coaching.";
export const APP_NAME = "lifting3";
export const APP_SHORT_NAME = "L³";
export const BRAND_COLOR = "#f97316";

const ROOT_ROUTE_ID = "root";
const ROBOTS_POLICY = "noindex, nofollow";
const SOCIAL_IMAGE_ALT = "lifting3 app icon in orange on a deep charcoal tile.";
const SOCIAL_IMAGE_HEIGHT = "512";
const SOCIAL_IMAGE_PATH = "/icon-512.png";
const SOCIAL_IMAGE_TYPE = "image/png";
const SOCIAL_IMAGE_WIDTH = "512";

interface RootLoaderData {
  readonly appOrigin: string;
}

interface MetaMatchLike {
  readonly id: string;
  readonly loaderData?: unknown;
}

interface PageMetaOptions {
  readonly description: string;
  readonly location: Pick<Location, "pathname">;
  readonly matches: ReadonlyArray<unknown>;
  readonly title: string;
}

function isMetaMatchLike(value: unknown): value is MetaMatchLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "id" in value && typeof value.id === "string";
}

function isRootLoaderData(value: unknown): value is RootLoaderData {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "appOrigin" in value && typeof value.appOrigin === "string";
}

function getAppOrigin(matches: ReadonlyArray<unknown>) {
  const rootMatch = matches.find(
    (match): match is MetaMatchLike => isMetaMatchLike(match) && match.id === ROOT_ROUTE_ID,
  );

  if (!rootMatch || !isRootLoaderData(rootMatch.loaderData)) {
    return null;
  }

  return rootMatch.loaderData.appOrigin;
}

function createAbsoluteUrl(origin: string | null, pathname: string) {
  if (!origin) {
    return pathname;
  }

  return new URL(pathname, origin).toString();
}

function createSocialImageUrl(origin: string | null) {
  if (!origin) {
    return SOCIAL_IMAGE_PATH;
  }

  return new URL(SOCIAL_IMAGE_PATH, origin).toString();
}

export function createPageMeta({
  description,
  location,
  matches,
  title,
}: PageMetaOptions): MetaDescriptor[] {
  const origin = getAppOrigin(matches);
  const canonicalUrl = createAbsoluteUrl(origin, location.pathname);
  const socialImageUrl = createSocialImageUrl(origin);

  return [
    { title },
    { content: description, name: "description" },
    { content: APP_NAME, name: "application-name" },
    { content: APP_SHORT_NAME, name: "apple-mobile-web-app-title" },
    { content: "yes", name: "apple-mobile-web-app-capable" },
    { content: "black-translucent", name: "apple-mobile-web-app-status-bar-style" },
    { content: "yes", name: "mobile-web-app-capable" },
    { content: "dark", name: "color-scheme" },
    { content: BRAND_COLOR, name: "theme-color" },
    { content: BRAND_COLOR, name: "msapplication-TileColor" },
    { content: ROBOTS_POLICY, name: "robots" },
    { href: canonicalUrl, rel: "canonical", tagName: "link" },
    { content: APP_NAME, property: "og:site_name" },
    { content: "website", property: "og:type" },
    { content: title, property: "og:title" },
    { content: description, property: "og:description" },
    { content: canonicalUrl, property: "og:url" },
    { content: socialImageUrl, property: "og:image" },
    { content: SOCIAL_IMAGE_ALT, property: "og:image:alt" },
    { content: SOCIAL_IMAGE_TYPE, property: "og:image:type" },
    { content: SOCIAL_IMAGE_WIDTH, property: "og:image:width" },
    { content: SOCIAL_IMAGE_HEIGHT, property: "og:image:height" },
    { content: "summary", name: "twitter:card" },
    { content: title, name: "twitter:title" },
    { content: description, name: "twitter:description" },
    { content: socialImageUrl, name: "twitter:image" },
    { content: SOCIAL_IMAGE_ALT, name: "twitter:image:alt" },
  ];
}
