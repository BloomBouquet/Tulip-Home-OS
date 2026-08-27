import { getTulipWebRuntime } from "../../../../server/tulip-runtime.ts";
import { handleHomeOnboarding } from "../../../../server/web-route-handlers.ts";

export async function POST(request: Request): Promise<Response> {
  return handleHomeOnboarding(request, request.headers.get("cookie") ?? undefined, getTulipWebRuntime());
}
