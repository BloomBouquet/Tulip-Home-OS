export async function GET(): Promise<Response> {
  return Response.json(
    { ok: true, service: "tulip-home-os" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
