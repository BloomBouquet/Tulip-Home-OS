import { getTulipWebRuntime } from "../../../../../server/tulip-runtime.ts";
import { ssoResponseToResponse } from "../../../../../server/web-route-handlers.ts";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return ssoResponseToResponse(await getTulipWebRuntime().sso.callback({
    code: url.searchParams.get("code") ?? undefined,
    state: url.searchParams.get("state") ?? undefined,
    cookieHeader: request.headers.get("cookie") ?? undefined
  }));
}
