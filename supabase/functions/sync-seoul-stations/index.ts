import { errorResponse, HttpError, jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface SeoulStationRow {
  BLDN_ID: string;
  BLDN_NM: string;
  ROUTE: string;
  LAT: string;
  LOT: string;
}

interface SeoulApiResponse {
  subwayStationMaster?: {
    list_total_count: number;
    RESULT: { CODE: string; MESSAGE: string };
    row?: SeoulStationRow[];
  };
  RESULT?: { CODE: string; MESSAGE: string };
}

const SEOUL_BOUNDS = {
  minLatitude: 37.413,
  maxLatitude: 37.715,
  minLongitude: 126.734,
  maxLongitude: 127.270,
};

function isInsideSeoul(latitude: number, longitude: number): boolean {
  return latitude >= SEOUL_BOUNDS.minLatitude &&
    latitude <= SEOUL_BOUNDS.maxLatitude &&
    longitude >= SEOUL_BOUNDS.minLongitude &&
    longitude <= SEOUL_BOUNDS.maxLongitude;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") {
    return errorResponse(
      request,
      new HttpError(405, "POST 요청만 지원합니다.", "METHOD_NOT_ALLOWED"),
    );
  }

  try {
    const apiKey = Deno.env.get("SEOUL_OPEN_DATA_API_KEY");
    const syncToken = Deno.env.get("SEOUL_DATA_SYNC_TOKEN");
    if (!apiKey || !syncToken) {
      throw new HttpError(
        503,
        "서울 공공데이터 동기화 환경변수가 설정되지 않았습니다.",
        "SYNC_NOT_CONFIGURED",
      );
    }
    if (request.headers.get("x-sync-token") !== syncToken) {
      throw new HttpError(401, "동기화 권한이 없습니다.", "UNAUTHORIZED");
    }

    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/subwayStationMaster/1/1000/`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new HttpError(502, "서울 공공데이터 API 호출에 실패했습니다.", "SEOUL_API_ERROR");
    }

    const payload = (await response.json()) as SeoulApiResponse;
    const result = payload.subwayStationMaster;
    if (!result || result.RESULT.CODE !== "INFO-000") {
      const message = result?.RESULT.MESSAGE ?? payload.RESULT?.MESSAGE ?? "Unknown error";
      throw new HttpError(502, message, "SEOUL_API_ERROR");
    }

    const stations = (result.row ?? []).flatMap((row) => {
      const latitude = Number(row.LAT);
      const longitude = Number(row.LOT);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      if (!isInsideSeoul(latitude, longitude)) return [];
      return [{
        source_station_id: row.BLDN_ID,
        station_name: row.BLDN_NM.trim(),
        line_name: row.ROUTE.trim(),
        latitude,
        longitude,
        source: "SEOUL_OPEN_DATA",
        active_yn: true,
      }];
    });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("seoul_transit_hub")
      .upsert(stations, { onConflict: "source_station_id,line_name" });
    if (error) throw error;

    return jsonResponse(request, {
      sourceTotalCount: result.list_total_count,
      synchronizedCount: stations.length,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});

