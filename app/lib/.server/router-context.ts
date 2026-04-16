import { createContext, RouterContextProvider } from "react-router";

export interface AppRequestContext {
  env: Env;
  executionContext: ExecutionContext;
}

type RouterContextReader = Pick<RouterContextProvider, "get">;

export const appRequestContext = createContext<AppRequestContext>();
export const cloudflareEnvContext = createContext<Env>();
export const executionContextContext = createContext<ExecutionContext>();

export const createAppRouterContext = (
  env: Env,
  executionContext: ExecutionContext
): RouterContextProvider => {
  const context = new RouterContextProvider();
  const requestContext: AppRequestContext = {
    env,
    executionContext,
  };

  context.set(appRequestContext, requestContext);
  context.set(cloudflareEnvContext, env);
  context.set(executionContextContext, executionContext);

  return context;
};

export const getAppRequestContext = (
  context: RouterContextReader
): AppRequestContext => context.get(appRequestContext);

export const getCloudflareEnv = (context: RouterContextReader): Env =>
  context.get(cloudflareEnvContext);

export const getExecutionContext = (
  context: RouterContextReader
): ExecutionContext => context.get(executionContextContext);
