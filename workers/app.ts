import { createRequestHandler } from "react-router";
import { createAppRouterContext } from "~/lib/.server/router-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, createAppRouterContext(env, ctx));
  },
} satisfies ExportedHandler<Env>;
