"use client";

import { useEffect, useState } from "react";
import type { Recipe } from "@/types/recipe";
import { displayImageUrl } from "@/lib/image-client";
import { Icon } from "@/components/Icon";

export function RecipeCard({ recipe, onOpen, onImageUpdated }: { recipe: Recipe; onOpen: () => void; onImageUpdated?: (imageUrl: string) => void }) {
  const [imageUrl, setImageUrl] = useState(recipe.imageUrl || "");
  const [repairing, setRepairing] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    setImageUrl(recipe.imageUrl || "");
    setAttempted(false);
  }, [recipe.imageUrl, recipe.id]);

  async function repairImage() {
    if (repairing || attempted || !recipe.sourceUrl) return;
    setAttempted(true);
    setRepairing(true);
    try {
      const response = await fetch(`/api/recipes/${recipe.id}/image`, { method: "POST" });
      const data = await response.json();
      if (response.ok && data.imageUrl) {
        setImageUrl(data.imageUrl);
        onImageUpdated?.(data.imageUrl);
      }
    } catch {}
    finally { setRepairing(false); }
  }

  return (
    <article className="recipe-card-shell">
      <button className="recipe-card" onClick={onOpen} type="button" aria-label={`Apri ${recipe.title}`}>
        <div className="recipe-card-image-wrap">
          {imageUrl ? (
            <img
              className="recipe-card-image"
              src={displayImageUrl(imageUrl)}
              alt={recipe.title}
              loading="lazy"
              onError={repairImage}
            />
          ) : (
            <div className="recipe-card-placeholder">
              <div className="placeholder-monogram">{recipe.title.trim().slice(0, 1).toUpperCase() || "R"}</div>
              {repairing ? <small>Recupero copertina…</small> : null}
            </div>
          )}
          <div className="recipe-card-gradient" />
          <span className="recipe-card-category">{recipe.category}</span>
          <div className="recipe-card-copy">
            <h3>{recipe.title}</h3>
            <div className="recipe-card-meta">
              {recipe.totalTimeMinutes ? <span><Icon name="clock" size={13} />{recipe.totalTimeMinutes} min</span> : null}
              {recipe.nutrition?.calories ? <span><Icon name="flame" size={13} />{recipe.nutrition.calories} kcal</span> : null}
            </div>
          </div>
        </div>
      </button>
      {!imageUrl && recipe.sourceUrl && !repairing ? (
        <button className="repair-image-button" type="button" onClick={repairImage}><Icon name="image" size={14} /> Recupera foto</button>
      ) : null}
    </article>
  );
}
