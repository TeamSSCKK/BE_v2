import type {
  ParticipantOrigin,
  ParticipantTravel,
  RankedPlace,
  SeoulHub,
  TransportType,
} from "./model.ts";

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(
  from: Pick<ParticipantOrigin, "latitude" | "longitude">,
  to: Pick<SeoulHub, "latitude" | "longitude">,
): number {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function estimateTravelMinutes(
  distanceKm: number,
  transportType: TransportType,
): number {
  // 서울 도심의 우회 경로와 환승·대기 시간을 반영한 MVP 추정식이다.
  const routeDistanceKm = distanceKm * 1.28;
  const speedKmPerHour = transportType === "CAR" ? 26 : 21;
  const fixedMinutes = transportType === "CAR" ? 6 : 10;
  return Math.max(1, Math.round((routeDistanceKm / speedKmPerHour) * 60 + fixedMinutes));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], mean: number): number {
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

export function rankPlaces(
  origins: ParticipantOrigin[],
  hubs: readonly SeoulHub[],
  limit = 5,
): RankedPlace[] {
  if (origins.length === 0) return [];

  return hubs
    .map((hub) => {
      const memberTravels: ParticipantTravel[] = origins.map((origin) => ({
        participantId: origin.participantId,
        participantName: origin.participantName,
        minutes: estimateTravelMinutes(haversineKm(origin, hub), origin.transportType),
        transportType: origin.transportType,
      }));
      const minutes = memberTravels.map((travel) => travel.minutes);
      const averageMinutes = average(minutes);
      const maxMinutes = Math.max(...minutes);
      const deviation = standardDeviation(minutes, averageMinutes);

      return {
        ...hub,
        rank: 0,
        averageMinutes: Math.round(averageMinutes),
        maxMinutes,
        standardDeviation: Number(deviation.toFixed(2)),
        fairnessScore: Number(
          (averageMinutes * 0.5 + maxMinutes * 0.25 + deviation * 0.25).toFixed(4),
        ),
        memberTravels,
      };
    })
    .sort(
      (left, right) =>
        left.fairnessScore - right.fairnessScore ||
        left.averageMinutes - right.averageMinutes,
    )
    .slice(0, Math.max(1, Math.min(limit, hubs.length)))
    .map((place, index) => ({ ...place, rank: index + 1 }));
}

