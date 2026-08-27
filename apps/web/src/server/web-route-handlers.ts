import type { ApiRequest, ApiResponse } from "../../../api/src/http/tulip-api-router.ts";
import type { SsoControllerResponse } from "../../../api/src/auth/bouquet-sso-controller.ts";
import { normalizeHomeOnboardingInput } from "../lib/home-onboarding-model.ts";

export interface TulipApiRuntimePort {
  handleApi(request: ApiRequest, cookieHeader?: string): Promise<ApiResponse>;
}

function responseFromApi(apiResponse: ApiResponse): Response {
  if (apiResponse.body === undefined) return new Response(null, { status: apiResponse.status });
  return new Response(JSON.stringify(apiResponse.body), {
    status: apiResponse.status,
    headers: { "Content-Type": "application/json" }
  });
}

export function ssoResponseToResponse(response: SsoControllerResponse): Response {
  const headers = new Headers(response.headers);
  if (response.body !== undefined) headers.set("Content-Type", "application/json");
  for (const cookie of response.cookies ?? []) headers.append("Set-Cookie", cookie);
  return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
    status: response.status,
    headers
  });
}

export async function handleTulipProxyRequest(
  request: Request,
  pathSegments: string[],
  runtime: TulipApiRuntimePort
): Promise<Response> {
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => { query[key] = value; });

  let body: unknown;
  if (request.method !== "GET" && request.method !== "HEAD" && request.headers.get("content-type")?.includes("application/json")) {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }

  const apiResponse = await runtime.handleApi({
    method: request.method,
    path: `/${pathSegments.join("/")}`,
    query,
    ...(body === undefined ? {} : { body })
  }, request.headers.get("cookie") ?? undefined);
  return responseFromApi(apiResponse);
}

export async function handlePostLogin(
  cookieHeader: string | undefined,
  runtime: TulipApiRuntimePort
): Promise<Response> {
  const home = await runtime.handleApi({ method: "GET", path: "/v1/homes/current" }, cookieHeader);
  const location = home.status === 200 ? "/today" : home.status === 404 ? "/onboarding/home" : "/login";
  return new Response(null, { status: 303, headers: { Location: location } });
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function handleHomeOnboarding(
  request: Request,
  cookieHeader: string | undefined,
  runtime: TulipApiRuntimePort
): Promise<Response> {
  let payload;
  try {
    const form = await request.formData();
    payload = normalizeHomeOnboardingInput({
      name: formString(form, "name"),
      regionCode: formString(form, "regionCode"),
      sido: formString(form, "sido"),
      sigungu: formString(form, "sigungu"),
      eupmyeondong: formString(form, "eupmyeondong")
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "BAD_REQUEST", message: error instanceof Error ? error.message : "invalid form" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const result = await runtime.handleApi({ method: "POST", path: "/v1/homes", body: payload }, cookieHeader);
  if (result.status === 201) return new Response(null, { status: 303, headers: { Location: "/today" } });
  return responseFromApi(result);
}
