"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api-client";
import {
  EMPTY_KITCHEN,
  weekDays,
  type KitchenState,
  type KitchenRow,
} from "@/lib/kitchen";
import { readOffline, writeOffline } from "@/lib/offline-db";
export function useKitchen(authenticated: boolean) {
  const [state, setState] = useState<KitchenState>(EMPTY_KITCHEN),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const range = useRef(weekDays()),
    live = useRef(authenticated),
    saving = useRef(false),
    request = useRef(0);
  live.current = authenticated;
  const reload = useCallback(async (days?: string[]) => {
    if (days) range.current = days;
    if (!live.current) return;
    const sequence = ++request.current;
    try {
      const data = await api<KitchenState>(
        `/api/kitchen?from=${range.current[0]}&to=${range.current[6]}`,
      );
      if (
        !Array.isArray(data.pantry) ||
        !Array.isArray(data.plan) ||
        !Array.isArray(data.history) ||
        !Array.isArray(data.stats)
      )
        throw new Error("Dati cucina non disponibili.");
      if (live.current && sequence === request.current) {
        setState(data);
        setStatus("Sincronizzata");
        await writeOffline("kitchen", data).catch(() =>
          setStatus("Sincronizzata · archivio offline non disponibile"),
        );
      }
    } catch (error) {
      if (live.current && sequence === request.current)
        setStatus(
          "Copia locale · " +
            (error instanceof Error
              ? error.message
              : "Connessione non disponibile"),
        );
    }
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    readOffline<KitchenState>("kitchen")
      .then((data) => {
        if (
          !stopped &&
          data &&
          Array.isArray(data.pantry) &&
          Array.isArray(data.plan) &&
          Array.isArray(data.history) &&
          Array.isArray(data.stats)
        ) {
          setState(data);
          setStatus("Ultima copia sincronizzata");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!stopped) void reload();
      });
    const reconnect = () => void reload();
    window.addEventListener("online", reconnect);
    return () => {
      stopped = true;
      request.current++;
      window.removeEventListener("online", reconnect);
    };
  }, [authenticated, reload]);
  const save = async (
    entity: string,
    item: Partial<KitchenRow> & Record<string, unknown>,
  ) => {
    if (saving.current) throw new Error("Un salvataggio è già in corso.");
    saving.current = true;
    setBusy(true);
    try {
      const current = await api<KitchenRow>(`/api/kitchen/${entity}`, {
        method: "POST",
        ...jsonBody({ item, expectedRevision: item.revision ?? null }),
      });
      await reload();
      return current;
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Salvataggio non completato.",
      );
      throw error;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return { state, status, busy, save, reload };
}
