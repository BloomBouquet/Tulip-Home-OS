import { getTulipWebRuntime } from "../../../../../server/tulip-runtime.ts";
import { ssoResponseToResponse } from "../../../../../server/web-route-handlers.ts";

export async function GET(request: Request): Promise<Response> {
  const returnTo = new URL(request.url).searchParams.get("returnTo") ?? undefined;
  return ssoResponseToResponse(await getTulipWebRuntime().sso.start(returnTo));
}
