"use client";

import { Icon } from "@/components/Icon";

export type ShoppingItem = { id: string; text: string; source: string; done: boolean };

export function ShoppingList({ items, setItems }: { items: ShoppingItem[]; setItems: (items: ShoppingItem[]) => void }) {
  const remaining = items.filter((x) => !x.done).length;

  return (
    <section className="page-section narrow-page">
      <div className="section-heading row-between align-end">
        <div><span className="eyebrow">Lista della spesa</span><h2>{remaining ? `${remaining} da comprare` : "Lista vuota"}</h2><p>Funziona senza OpenAI e resta salvata su questo dispositivo.</p></div>
        {items.length ? <button type="button" className="button soft" onClick={() => setItems([])}>Svuota</button> : null}
      </div>

      <div className="surface shopping-surface">
        {!items.length ? (
          <div className="empty-state"><div className="empty-icon"><Icon name="bag" size={30} /></div><h3>Niente da comprare</h3><p>Apri una ricetta e aggiungi i suoi ingredienti alla lista.</p></div>
        ) : (
          <>
            <div className="shopping-progress"><div><span style={{ width: `${items.length ? ((items.length - remaining) / items.length) * 100 : 0}%` }} /></div><small>{items.length - remaining} completati su {items.length}</small></div>
            <div className="shopping-list">
              {items.map((item) => (
                <button key={item.id} type="button" className={item.done ? "shopping-row done" : "shopping-row"} onClick={() => setItems(items.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))}>
                  <span className="shopping-check">{item.done ? <Icon name="check" size={14} /> : null}</span>
                  <span className="shopping-copy"><strong>{item.text}</strong><small>{item.source}</small></span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
