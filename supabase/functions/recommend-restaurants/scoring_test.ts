import { assertEquals } from "jsr:@std/assert@1";
import type { RestaurantSearchItem } from "./model.ts";
import { rankRestaurants } from "./scoring.ts";

const center = { latitude: 37.4979, longitude: 127.0276 };

function restaurant(
  name: string,
  category: string,
  latitude: number,
  searchRank = 1,
): RestaurantSearchItem {
  return {
    name,
    category,
    address: "서울",
    roadAddress: "서울",
    latitude,
    longitude: 127.0276,
    sourceUrl: "",
    searchRank,
  };
}

Deno.test("선호 음식과 가까운 식당이 우선 추천된다", () => {
  const result = rankRestaurants(
    center,
    [
      restaurant("한식당", "한식", 37.4980),
      restaurant("버거집", "양식>햄버거", 37.4980),
    ],
    [{ type: "LIKE", value: "한식" }],
  );

  assertEquals(result[0].name, "한식당");
});

Deno.test("제약 조건에 해당하는 식당은 제외한다", () => {
  const result = rankRestaurants(
    center,
    [restaurant("땅콩식당", "음식점>땅콩요리", 37.4980)],
    [{ type: "RESTRICTION", value: "땅콩" }],
  );

  assertEquals(result.length, 0);
});

Deno.test("반경 밖 식당은 제외한다", () => {
  const result = rankRestaurants(
    center,
    [restaurant("먼 식당", "한식", 37.5500)],
    [],
  );

  assertEquals(result.length, 0);
});

