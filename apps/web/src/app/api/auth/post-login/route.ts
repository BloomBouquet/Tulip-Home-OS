import { getTulipWebRuntime } from "../../../../server/tulip-runtime.ts";
import { handlePostLogin } from "../../../../server/web-route-handlers.ts";

export async function GET(request: Request): Promise<Response> {
  return handlePostLogin(request.headers.get("cookie") ?? undefined, getTulipWebRuntime());
}
