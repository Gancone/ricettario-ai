"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api-client";
import { validShoppingItems, type ShoppingItem } from "@/lib/shopping";

const KEY = "ricettario-shopping-v6";
const PENDING = "ricettario-shopping-pending";
const REVISION_KEY = "ricettario-shopping-server-revision";
export function useShopping(authenticated: boolean) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [status, setStatus] = useState("Caricamento lista…");
  const current = useRef<ShoppingItem[]>([]);
  const revision = useRef(0);
  const serverRevision = useRef<number | null>(null);
  const pending = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(authenticated);
  active.current = authenticated;

  const sync = useCallback(async () => {
    if (!active.current || inFlight.current || !pending.current) return;
    inFlight.current = true;
    setStatus("Sincronizzazione…");
    try {
      if(serverRevision.current===null){
        const remote=await api<{items:ShoppingItem[];revision:number}>("/api/state/shopping");
        if(!validShoppingItems(remote.items)||!Number.isSafeInteger(remote.revision))throw new Error("Lista ricevuta non valida.");
        // A legacy/offline list without a known base may only add missing IDs.
        const ids=new Set(remote.items.map(item=>item.id));
        current.current=[...remote.items,...current.current.filter(item=>!ids.has(item.id))];
        serverRevision.current=remote.revision;setItems(current.current);
        try{localStorage.setItem(KEY,JSON.stringify(current.current));localStorage.setItem(REVISION_KEY,String(remote.revision));}catch{}
      }
      while (pending.current && active.current) {
        const sent = revision.current;
        const result: { items?: ShoppingItem[]; revision?: number } = await api("/api/state/shopping", { method: "PUT", ...jsonBody({ items: current.current, revision: serverRevision.current }) });
        serverRevision.current = result.revision ?? serverRevision.current;
        try{localStorage.setItem(REVISION_KEY,String(serverRevision.current));}catch{}
        if (sent === revision.current) {
          if(Array.isArray(result.items)){current.current=result.items;setItems(result.items);try{localStorage.setItem(KEY,JSON.stringify(result.items));}catch{}}
          pending.current = false;
          try { localStorage.removeItem(PENDING); } catch {}
        }
      }
      if (active.current) setStatus("Sincronizzata");
    } catch (error) {
      if (active.current) setStatus(error instanceof Error ? `Da sincronizzare · ${error.message}` : "Da sincronizzare. Riprova.");
    } finally { inFlight.current = false; }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const started = revision.current;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("ricettario-shopping-v5") || "[]");
      if (validShoppingItems(saved)) { current.current = saved; setItems(saved); }
      pending.current = localStorage.getItem(PENDING) === "1";
      const savedRevision=Number(localStorage.getItem(REVISION_KEY));
      serverRevision.current=Number.isSafeInteger(savedRevision)&&savedRevision>0?savedRevision:null;
    } catch {}
    if (pending.current) void sync();
    else api<ShoppingItem[] | { items: ShoppingItem[]; revision?: number }>("/api/state/shopping").then((data) => {
      if (cancelled || revision.current !== started || pending.current) return;
      const payload = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(data)) serverRevision.current = data.revision ?? null;
      if (!validShoppingItems(payload)) throw new Error("Lista ricevuta non valida.");
      current.current = payload; setItems(payload); setStatus("Sincronizzata");
      try { localStorage.setItem(KEY, JSON.stringify(payload));localStorage.setItem(REVISION_KEY,String(serverRevision.current)); } catch {}
    }).catch(() => { if (!cancelled) setStatus("Copia locale · connessione non disponibile"); });
    const reconnect = () => { void sync(); };
    window.addEventListener("online", reconnect);
    return () => { cancelled = true; window.removeEventListener("online", reconnect); if (timer.current) clearTimeout(timer.current); };
  }, [authenticated, sync]);

  const update = (next: ShoppingItem[]) => {
    current.current = next; revision.current++; pending.current = true; setItems(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); localStorage.setItem(PENDING, "1"); setStatus("Salvata sul dispositivo · sincronizzazione in attesa"); }
    catch { setStatus("Memoria locale non disponibile. Mantieni aperta la pagina fino alla sincronizzazione."); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void sync(); }, 450);
  };
  const retry = async () => {
    if (pending.current) return sync();
    setStatus("Caricamento lista…");
    const started = revision.current;
    try {
      const data = await api<ShoppingItem[] | { items: ShoppingItem[]; revision?: number }>("/api/state/shopping");
      if (started !== revision.current) return;
      const payload = Array.isArray(data) ? data : data.items; if (!Array.isArray(data)) serverRevision.current = data.revision ?? null;
      if (!validShoppingItems(payload)) throw new Error("Lista non valida");
      current.current = payload; setItems(payload); setStatus("Sincronizzata");
      try { localStorage.setItem(KEY, JSON.stringify(payload));localStorage.setItem(REVISION_KEY,String(serverRevision.current)); } catch {}
    } catch { setStatus("Copia locale · connessione non disponibile"); }
  };
  return { items, update, status, retry };
}
