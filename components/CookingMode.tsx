"use client";
import { useEffect, useRef, useState } from "react";
import type { Recipe } from "@/types/recipe";
import { formatIngredient, ingredientList } from "@/lib/ingredients";
export type CookingTimer = {
  id: string;
  key: string;
  label: string;
  endsAt: number;
};
export type TimerActions = {
  add: (key: string, label: string, minutes: number) => void;
};
export function stepMinutes(text: string) {
  const hours = text.match(/(\d+)\s*(?:ore|ora|h)\b/i),
    minutes = text.match(/(\d+)\s*(?:minuti|minuto|min)\b/i);
  return Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0);
}
export function CookingMode({
  recipe,
  servings,
  timers,
  onExit,
  onFinish,
}: {
  recipe: Recipe;
  servings: number;
  timers: TimerActions;
  onExit: () => void;
  onFinish: () => Promise<void>;
}) {
  const [index, setIndex] = useState(0),
    [message, setMessage] = useState(""),
    [finishing, setFinishing] = useState(false);
  const touch = useRef<[number, number] | null>(null);
  const next = () => setIndex((i) => Math.min(recipe.steps.length - 1, i + 1)),
    previous = () => setIndex((i) => Math.max(0, i - 1));
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") previous();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  const minutes = stepMinutes(recipe.steps[index]);
  return (
    <section
      className="cooking-mode"
      aria-label="Modalità cucina"
      onTouchStart={(e) => {
        touch.current = [e.touches[0].clientX, e.touches[0].clientY];
      }}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const [x, y] = touch.current;
        const dx = e.changedTouches[0].clientX - x,
          dy = e.changedTouches[0].clientY - y;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 70) {
          if (dx < 0) next();
          else previous();
        }
        touch.current = null;
      }}
    >
      <div className="row-between">
        <span className="eyebrow">
          Passaggio {index + 1} di {recipe.steps.length}
        </span>
        <button className="button soft" onClick={onExit}>
          Esci dalla modalità cucina
        </button>
      </div>
      <h3>{recipe.title}</h3>
      <p className="cooking-step" aria-live="polite">
        {recipe.steps[index]}
      </p>
      {minutes > 0 && (
        <button
          className="button primary"
          onClick={() =>
            timers.add(
              recipe.id + ":" + index,
              recipe.title + " · passo " + (index + 1),
              minutes,
            )
          }
        >
          Avvia timer · {minutes} min
        </button>
      )}
      <div className="cooking-navigation">
        <button className="button soft" disabled={!index} onClick={previous}>
          ← Indietro
        </button>
        {index < recipe.steps.length - 1 ? (
          <button className="button primary" onClick={next}>
            Avanti →
          </button>
        ) : (
          <button
            className="button primary"
            disabled={finishing}
            onClick={async () => {
              setFinishing(true);
              try {
                await onFinish();
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Storico non salvato.",
                );
              } finally {
                setFinishing(false);
              }
            }}
          >
            Fatto · salva nello storico
          </button>
        )}
      </div>
      <details className="cooking-ingredients">
        <summary>Ingredienti · {servings} porzioni</summary>
        <ul>
          {ingredientList(recipe.ingredients).map((item, i) => (
            <li key={i}>
              {formatIngredient(item, servings / (recipe.servings || 2))}
            </li>
          ))}
        </ul>
      </details>
      {message && <p role="alert">{message}</p>}
      <p className="sync-caption">
        Scorri a destra o a sinistra per cambiare passaggio. I timer continuano
        anche se chiudi questa schermata.
      </p>
    </section>
  );
}
