# SSCKK Backend (`BE_v2`)

This is the initial codebase for the TeamSSCKK `BE_v2` repository. It uses Supabase PostgreSQL and Edge Functions for the meeting-place and restaurant recommendation service.

## Project

- Supabase project ref: `oufchidafmrxgympbcqo`
- Project URL: `https://oufchidafmrxgympbcqo.supabase.co`
- REST base URL: `https://oufchidafmrxgympbcqo.supabase.co/rest/v1`
- Edge Functions base URL: `https://oufchidafmrxgympbcqo.supabase.co/functions/v1`

Use the project URL without `/rest/v1/` when initializing a Supabase client.

## Local Environment

Fill in `.env.local` using one value per line:

```env
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
NAVER_SEARCH_CLIENT_ID=your_client_id
NAVER_SEARCH_CLIENT_SECRET=your_client_secret
ODSAY_API_KEY=your_odsay_key
```

Rules:

1. Do not put spaces around `=`.
2. Do not add quotes unless the value itself requires them.
3. Do not add a period before a JWT. A Supabase key starts with `eyJ...`.
4. Never commit `.env.local`.
5. Never expose `SUPABASE_SERVICE_ROLE_KEY` or Naver Client Secret in frontend code.

The Naver Maps browser client ID belongs in the frontend environment file:

```env
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your_maps_client_id
NEXT_PUBLIC_SUPABASE_URL=https://oufchidafmrxgympbcqo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## Supabase Secrets

`.env.local` is only for local development. Before deploying Edge Functions, register server secrets in Supabase:

```powershell
supabase secrets set --env-file .env.local
```

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. The custom secrets that must be registered are Naver Search, ODsay, and allowed origins.

## ODsay URI Key

The issued ODsay key is a URI key, so it may require the request origin to match a registered URI. Register these local origins in ODsay when supported:

```text
http://localhost:3000
http://127.0.0.1:3000
```

If ODsay rejects calls made from an Edge Function, issue a server-compatible key or call ODsay through a browser-facing flow with strict origin restrictions. Do not place the key in committed source code.

## Health Function

The initial function is located at `supabase/functions/health/index.ts`.

```powershell
supabase functions serve health --env-file .env.local
```

After deployment it will be available at:

```text
https://oufchidafmrxgympbcqo.supabase.co/functions/v1/health
```
