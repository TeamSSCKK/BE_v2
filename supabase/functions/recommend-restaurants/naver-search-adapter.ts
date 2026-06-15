import type { RestaurantSearchItem } from "./model.ts";

interface NaverLocalItem {
  title: string;
  link?: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  mapx: string;
  mapy: string;
}

interface NaverLocalResponse {
  items?: NaverLocalItem[];
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
}

export async function searchRestaurants(
  queries: string[],
): Promise<RestaurantSearchItem[]> {
  const clientId = Deno.env.get("NAVER_SEARCH_CLIENT_ID");
  const clientSecret = Deno.env.get("NAVER_SEARCH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Naver Search API credentials are missing.");
  }

  const responses = await Promise.all(
    queries.map(async (query) => {
      const url = new URL("https://openapi.naver.com/v1/search/local.json");
      url.searchParams.set("query", query);
      url.searchParams.set("display", "5");
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "comment");

      const response = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Naver Search HTTP ${response.status}`);
      return (await response.json()) as NaverLocalResponse;
    }),
  );

  const seen = new Set<string>();
  return responses.flatMap((response) => response.items ?? []).flatMap(
    (item, index) => {
      const name = stripHtml(item.title);
      const address = item.roadAddress || item.address || "";
      const key = `${name}|${address}`;
      if (seen.has(key)) return [];
      seen.add(key);

      const longitude = Number(item.mapx) / 10_000_000;
      const latitude = Number(item.mapy) / 10_000_000;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

      return [{
        name,
        category: stripHtml(item.category ?? "음식점"),
        address: item.address ?? "",
        roadAddress: item.roadAddress ?? "",
        latitude,
        longitude,
        sourceUrl: item.link ?? "",
        searchRank: index + 1,
      }];
    },
  );
}

