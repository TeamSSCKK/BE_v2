import { corsHeaders } from "./cors.ts";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function optionsResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(
      request,
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }

  console.error(error);
  return jsonResponse(
    request,
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "서버에서 요청을 처리하지 못했습니다.",
      },
    },
    500,
  );
}

