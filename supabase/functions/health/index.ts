import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((request) => {
  const headers = {
    ...corsHeaders(request),
    "Content-Type": "application/json; charset=utf-8",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      service: "ssckk-backend",
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers },
  );
});

