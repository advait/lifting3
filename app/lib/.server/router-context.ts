import { createContext, RouterContextProvider } from "react-router";

import { createAppDatabase, type AppDatabase } from "./db/index.ts";

/** Carries the Cloudflare request primitives through RR7 middleware, loaders, and actions. */
export interface AppRequestContext {
  db: AppDatabase;
  env: Env;
  executionContext: ExecutionContext;
}

type RouterContextReader = Pick<RouterContextProvider, "get">;

export const appRequestContext = createContext<AppRequestContext>();
export const appDatabaseContext = createContext<AppDatabase>();
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

export const getAppDatabase = (context: RouterContextReader): AppDatabase =>
  context.get(appDatabaseContext);

export const getCloudflareEnv = (context: RouterContextReader): Env =>
  context.get(cloudflareEnvContext);

export const getExecutionContext = (context: RouterContextReader): ExecutionContext =>
  context.get(executionContextContext);
