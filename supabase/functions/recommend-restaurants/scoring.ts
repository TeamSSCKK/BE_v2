import type {
  RankedRestaurant,
  RestaurantPreference,
  RestaurantSearchItem,
} from "./model.ts";

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a)));
}

function includesTerm(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase());
}

function isMealRestaurant(category: string): boolean {
  const excludedCategories = ["카페", "디저트", "베이커리", "베이글", "아이스크림"];
  return !excludedCategories.some((categoryName) =>
    category.includes(categoryName)
  );
}

export function rankRestaurants(
  center: { latitude: number; longitude: number },
  restaurants: RestaurantSearchItem[],
  preferences: RestaurantPreference[],
  limit = 5,
  radiusMeters = 2_000,
): RankedRestaurant[] {
  const likes = preferences.filter((preference) => preference.type === "LIKE");
  const dislikes = preferences.filter((preference) => preference.type === "DISLIKE");
  const restrictions = preferences.filter(
    (preference) => preference.type === "RESTRICTION",
  );

  return restaurants
    .flatMap((restaurant) => {
      if (!isMealRestaurant(restaurant.category)) return [];
      const searchable = `${restaurant.name} ${restaurant.category}`;
      if (restrictions.some((restriction) => includesTerm(searchable, restriction.value))) {
        return [];
      }

      const distance = distanceMeters(center, restaurant);
      if (distance > radiusMeters) return [];

      const matchedLikes = likes
        .filter((preference) => includesTerm(searchable, preference.value))
        .map((preference) => preference.value);
      const matchedDislikes = dislikes
        .filter((preference) => includesTerm(searchable, preference.value))
        .map((preference) => preference.value);

      const preferenceScore =
        matchedLikes.length * 30 -
        matchedDislikes.length * 40 +
        Math.max(0, 12 - restaurant.searchRank * 2) +
        Math.max(0, 20 - distance / 100);

      return [{
        ...restaurant,
        distanceMeters: distance,
        preferenceScore: Number(preferenceScore.toFixed(4)),
        recommendationRank: 0,
        matchedLikes,
        matchedDislikes,
      }];
    })
    .sort(
      (left, right) =>
        right.preferenceScore - left.preferenceScore ||
        left.distanceMeters - right.distanceMeters,
    )
    .slice(0, Math.max(1, limit))
    .map((restaurant, index) => ({
      ...restaurant,
      recommendationRank: index + 1,
    }));
}
