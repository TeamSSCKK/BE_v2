export interface RestaurantPreference {
  type: "LIKE" | "DISLIKE" | "RESTRICTION" | "PRICE_RANGE";
  value: string;
}

export interface RestaurantSearchItem {
  name: string;
  category: string;
  address: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  searchRank: number;
}

export interface RankedRestaurant extends RestaurantSearchItem {
  distanceMeters: number;
  preferenceScore: number;
  recommendationRank: number;
  matchedLikes: string[];
  matchedDislikes: string[];
}

