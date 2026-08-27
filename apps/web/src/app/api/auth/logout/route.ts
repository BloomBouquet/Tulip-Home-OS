import { getTulipWebRuntime } from "../../../../server/tulip-runtime.ts";
import { ssoResponseToResponse } from "../../../../server/web-route-handlers.ts";

export async function POST(request: Request): Promise<Response> {
  return ssoResponseToResponse(await getTulipWebRuntime().sso.logout(request.headers.get("cookie") ?? undefined));
}
