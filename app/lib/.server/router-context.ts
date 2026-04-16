import { createContext, RouterContextProvider } from "react-router";

import { createAppDatabase, type AppDatabase } from "./db/index.ts";

/** Carries the Cloudflare request primitives through RR7 middleware, loaders, and actions. */
export interface AppRequestContext {
  db: AppDatabase | null;
  env: Env;
  executionContext: ExecutionContext;
}

type RouterContextReader = Pick<RouterContextProvider, "get">;

export const appRequestContext = createContext<AppRequestContext>();
export const appDatabaseContext = createContext<AppDatabase | null>();
export const cloudflareEnvContext = createContext<Env>();
export const executionContextContext = createContext<ExecutionContext>();

export const createAppRouterContext = (
  env: Env,
  executionContext: ExecutionContext,
): RouterContextProvider => {
  const context = new RouterContextProvider();
  const db = createAppDatabase(env);
  const requestContext: AppRequestContext = {
    db,
    env,
    executionContext,
  };

  context.set(appRequestContext, requestContext);
  context.set(appDatabaseContext, db);
  context.set(cloudflareEnvContext, env);
  context.set(executionContextContext, executionContext);

  return context;
};

export const getAppRequestContext = (context: RouterContextReader): AppRequestContext =>
  context.get(appRequestContext);

export const getOptionalAppDatabase = (context: RouterContextReader): AppDatabase | null =>
  context.get(appDatabaseContext);

export const getAppDatabase = (context: RouterContextReader): AppDatabase => {
  const db = context.get(appDatabaseContext);

  if (db === null) {
    throw new Error(
      "D1 database binding is not configured in router context. Add `DB` to wrangler.jsonc before using the app database.",
    );
  }

  return db;
};

export const getCloudflareEnv = (context: RouterContextReader): Env =>
  context.get(cloudflareEnvContext);

export const getExecutionContext = (context: RouterContextReader): ExecutionContext =>
  context.get(executionContextContext);
