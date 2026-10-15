"use client";
import { useEffect, useState } from "react";
import { createRecipeId } from "@/lib/recipe-id";
import { readOffline, writeOffline } from "@/lib/offline-db";
import type { CookingTimer } from "./CookingMode";
export function useCookingTimers() {
  const [timers, setTimers] = useState<CookingTimer[]>([]),
    [ready, setReady] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    readOffline<CookingTimer[]>("timers")
      .then((rows) => {
        if (Array.isArray(rows))
          setTimers(
            rows
              .filter(
                (row) =>
                  typeof row.id === "string" &&
                  typeof row.label === "string" &&
                  Number.isFinite(row.endsAt),
              )
              .slice(-10),
          );
      })
      .catch(() => {})
      .finally(() => setReady(true));
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  useEffect(() => {
    if (ready) void writeOffline("timers", timers).catch(() => {});
  }, [ready, timers]);
  const add = (key: string, label: string, minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) return;
    setNow(Date.now());
    setTimers((rows) =>
      rows.some((row) => row.key === key && row.endsAt > Date.now())
        ? rows
        : [
            ...rows.filter((row) => row.endsAt > Date.now()).slice(-9),
            {
              id: createRecipeId(),
              key,
              label,
              endsAt: Date.now() + minutes * 60000,
            },
          ],
    );
  };
  return {
    timers,
    now,
    add,
    remove: (id: string) =>
      setTimers((rows) => rows.filter((row) => row.id !== id)),
  };
}
export function CookingTimerTray({
  timers,
  now,
  remove,
  inline = false,
}: {
  timers: CookingTimer[];
  now: number;
  remove: (id: string) => void;
  inline?: boolean;
}) {
  if (!timers.length) return null;
  return (
    <aside
      className={"timer-tray surface" + (inline ? " inline" : "")}
      aria-label="Timer cucina"
    >
      {timers.map((timer) => {
        const seconds = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
        return (
          <div
            className={seconds ? "timer-row" : "timer-row complete"}
            key={timer.id}
          >
            <div>
              <strong>
                {seconds
                  ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
                  : "Timer terminato"}
              </strong>
              <span>{timer.label}</span>
            </div>
            <button
              className="button soft"
              aria-label={"Ferma timer " + timer.label}
              onClick={() => remove(timer.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </aside>
  );
}
