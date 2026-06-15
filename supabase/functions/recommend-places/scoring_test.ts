import {
  assert,
  assertEquals,
} from "jsr:@std/assert@1";
import type { ParticipantOrigin, SeoulHub } from "./model.ts";
import { haversineKm, rankPlaces, selectNearbyHubs } from "./scoring.ts";

Deno.test("같은 좌표 사이의 거리는 0이다", () => {
  const point = { latitude: 37.5665, longitude: 126.9780 };
  assertEquals(haversineKm(point, point), 0);
});

Deno.test("참가자에게 더 가까운 후보가 먼저 추천된다", () => {
  const origins: ParticipantOrigin[] = [
    {
      participantId: 1,
      participantName: "참가자",
      latitude: 37.5665,
      longitude: 126.9780,
      transportType: "PUBLIC",
    },
  ];
  const hubs: SeoulHub[] = [
    {
      name: "먼 후보",
      category: "지하철역",
      address: "서울",
      latitude: 37.4979,
      longitude: 127.0276,
    },
    {
      name: "가까운 후보",
      category: "지하철역",
      address: "서울",
      latitude: 37.5657,
      longitude: 126.9769,
    },
  ];

  const result = rankPlaces(origins, hubs, 2);

  assertEquals(result[0].name, "가까운 후보");
  assert(result[0].fairnessScore < result[1].fairnessScore);
  assertEquals(result[0].rank, 1);
});

Deno.test("반환 후보 수는 limit을 넘지 않는다", () => {
  const origins: ParticipantOrigin[] = [
    {
      participantId: 1,
      participantName: "참가자",
      latitude: 37.5665,
      longitude: 126.9780,
      transportType: "PUBLIC",
    },
  ];
  const hubs: SeoulHub[] = [
    {
      name: "후보1",
      category: "역",
      address: "서울",
      latitude: 37.5657,
      longitude: 126.9769,
    },
    {
      name: "후보2",
      category: "역",
      address: "서울",
      latitude: 37.5615,
      longitude: 127.0372,
    },
  ];

  assertEquals(rankPlaces(origins, hubs, 1).length, 1);
});

Deno.test("중심점 인근 후보를 선택하고 같은 역 이름은 중복 제거한다", () => {
  const origins: ParticipantOrigin[] = [
    {
      participantId: 1,
      participantName: "participant",
      latitude: 37.5657,
      longitude: 126.9770,
      transportType: "PUBLIC",
    },
  ];
  const hubs: SeoulHub[] = [
    { name: "시청역", category: "1호선", address: "서울", latitude: 37.5657, longitude: 126.9770 },
    { name: "시청", category: "2호선", address: "서울", latitude: 37.5658, longitude: 126.9768 },
    { name: "강남역", category: "2호선", address: "서울", latitude: 37.4979, longitude: 127.0276 },
  ];

  const result = selectNearbyHubs(origins, hubs, 30);

  assertEquals(result.length, 2);
  assertEquals(result[0].name, "시청역");
});
