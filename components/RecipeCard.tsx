"use client";

import type { Recipe } from "@/types/recipe";

export function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  return (
    <button className="recipe-card" onClick={onOpen} type="button" aria-label={`Apri ${recipe.title}`}>
      <div className="recipe-card-image-wrap">
        {recipe.imageUrl ? (
          <img className="recipe-card-image" src={recipe.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="recipe-card-placeholder">🍽️</div>
        )}
        <div className="recipe-card-gradient" />
        <div className="recipe-card-copy">
          <div className="recipe-card-category">{recipe.category}</div>
          <h3>{recipe.title}</h3>
          <div className="recipe-card-meta">
            {recipe.totalTimeMinutes ? <span>◷ {recipe.totalTimeMinutes} min</span> : null}
            {recipe.nutrition?.calories ? <span>{recipe.nutrition.calories} kcal</span> : null}
          </div>
        </div>
      </div>
    </button>
  );
}
