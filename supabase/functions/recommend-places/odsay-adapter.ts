import type {
  ParticipantOrigin,
  ParticipantTravel,
  RankedPlace,
  SeoulHub,
} from "./model.ts";
import {
  estimateTravelMinutes,
  haversineKm,
  scorePlace,
  sortRankedPlaces,
} from "./scoring.ts";

interface ODsayPathResponse {
  result?: {
    path?: Array<{ info?: { totalTime?: number } }>;
  };
  error?: { code?: string; message?: string };
}

async function getPublicTransitMinutes(
  origin: ParticipantOrigin,
  destination: SeoulHub,
): Promise<number> {
  const apiKey = Deno.env.get("ODSAY_API_KEY");
  if (!apiKey) throw new Error("ODSAY_API_KEY is missing.");

  const requestOrigin = Deno.env.get("ODSAY_REQUEST_ORIGIN") ?? "http://localhost:3000";
  const url = new URL("https://api.odsay.com/v1/api/searchPubTransPathT");
  url.searchParams.set("SX", String(origin.longitude));
  url.searchParams.set("SY", String(origin.latitude));
  url.searchParams.set("EX", String(destination.longitude));
  url.searchParams.set("EY", String(destination.latitude));
  url.searchParams.set("OPT", "0");
  url.searchParams.set("SearchType", "0");
  url.searchParams.set("apiKey", apiKey);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Origin: requestOrigin,
          Referer: `${requestOrigin}/`,
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`ODsay HTTP ${response.status}`);

      const body = (await response.json()) as ODsayPathResponse;
      if (body.error) {
        throw new Error(body.error.message ?? body.error.code ?? "ODsay error");
      }

      const minutes = (body.result?.path ?? [])
        .map((path) => path.info?.totalTime)
        .filter((value): value is number => Number.isFinite(value));
      if (minutes.length === 0) throw new Error("No public transit route found.");
      return Math.min(...minutes);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }
  throw lastError;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export async function rankPlacesWithODsay(
  origins: ParticipantOrigin[],
  hubs: SeoulHub[],
  limit: number,
): Promise<RankedPlace[]> {
  const scored = await mapWithConcurrency(hubs, 1, async (hub) => {
    const memberTravels = await mapWithConcurrency(origins, 1, async (origin) => {
      try {
        const minutes = origin.transportType === "PUBLIC"
          ? await getPublicTransitMinutes(origin, hub)
          : estimateTravelMinutes(haversineKm(origin, hub), origin.transportType);
        return {
          participantId: origin.participantId,
          participantName: origin.participantName,
          minutes,
          transportType: origin.transportType,
          calculationMethod: origin.transportType === "PUBLIC"
            ? "ODSAY" as const
            : "DISTANCE_FALLBACK" as const,
        } satisfies ParticipantTravel;
      } catch (error) {
        console.warn("ODsay fallback", {
          participantId: origin.participantId,
          hub: hub.name,
          message: error instanceof Error ? error.message : String(error),
        });
        return {
          participantId: origin.participantId,
          participantName: origin.participantName,
          minutes: estimateTravelMinutes(haversineKm(origin, hub), origin.transportType),
          transportType: origin.transportType,
          calculationMethod: "DISTANCE_FALLBACK" as const,
        } satisfies ParticipantTravel;
      }
    });
    return scorePlace(hub, memberTravels);
  });

  return sortRankedPlaces(scored, limit);
}
