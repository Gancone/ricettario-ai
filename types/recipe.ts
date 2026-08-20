export type Nutrition = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  sugars?: number;
  fiber?: number;
  salt?: number;
  estimated?: boolean;
};

export type Recipe = {
  id: string;
  title: string;
  sourceUrl?: string;
  imageUrl?: string;
  category: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  sourceNotes?: string;
  notes?: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  servings?: number;
  nutrition?: Nutrition;
  favorite?: boolean;
  archived?: boolean;
  rating?: number;
  createdAt: string;
};

export type RecipeDraft = {
  id: string;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  category: string;
  tags: string;
  ingredients: string;
  steps: string;
  sourceNotes: string;
  notes: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  totalTimeMinutes: string;
  servings: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  sugars: string;
  fiber: string;
  salt: string;
  nutritionEstimated: boolean;
};

export type Category = {
  id: number;
  name: string;
};

export function newEmptyDraft(): RecipeDraft {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `draft-${Date.now()}`,
    title: "",
    sourceUrl: "",
    imageUrl: "",
    category: "",
    tags: "",
    ingredients: "",
    steps: "",
    sourceNotes: "",
    notes: "",
    prepTimeMinutes: "",
    cookTimeMinutes: "",
    totalTimeMinutes: "",
    servings: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    sugars: "",
    fiber: "",
    salt: "",
    nutritionEstimated: true
  };
}
