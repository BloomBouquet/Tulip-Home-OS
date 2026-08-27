import { getTulipWebRuntime } from "../../../../server/tulip-runtime.ts";
import { handleTulipProxyRequest } from "../../../../server/web-route-handlers.ts";

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  return handleTulipProxyRequest(request, params.path, getTulipWebRuntime());
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
