"use client";
import type { Recipe } from "@/types/recipe";
import { RecipeImage } from "./RecipeImage";
import { Icon } from "./Icon";
export function RecipeCard({
  recipe,
  onOpen,
  onToggleFavorite,
  view = "grid",
}: {
  recipe: Recipe;
  onOpen: () => void;
  onToggleFavorite: () => void;
  view?: string;
}) {
  return (
    <article
      className={"recipe-card-shell" + (recipe.archived ? " archived" : "")}
    >
      <button
        className="recipe-card"
        onClick={onOpen}
        type="button"
        aria-label={"Apri " + recipe.title}
      >
        <div className="recipe-card-image-wrap">
          {recipe.imageUrl ? (
            <RecipeImage url={recipe.imageUrl} className="recipe-card-image" />
          ) : (
            <div className="recipe-card-placeholder">
              <span className="placeholder-monogram">
                {recipe.title.trim().slice(0, 1).toUpperCase() || "R"}
              </span>
            </div>
          )}
          <div className="recipe-card-gradient" />
          <div className="recipe-card-copy">
            <h3 title={recipe.title}>{recipe.title}</h3>
            <div className="recipe-card-meta">
              {view !== "grid" && (
                <span>{recipe.archived ? "Archiviata" : recipe.category}</span>
              )}
              {recipe.totalTimeMinutes != null && (
                <span>
                  <Icon name="clock" size={13} />
                  {recipe.totalTimeMinutes} min
                </span>
              )}
              {view !== "grid" && recipe.nutrition?.calories != null && (
                <span>{recipe.nutrition.calories} kcal</span>
              )}
            </div>
          </div>
        </div>
      </button>
      <button
        className={"favorite-card-button" + (recipe.favorite ? " active" : "")}
        type="button"
        aria-label={
          recipe.favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"
        }
        aria-pressed={!!recipe.favorite}
        onClick={onToggleFavorite}
      >
        <Icon name="heart" size={18} />
      </button>
    </article>
  );
}
