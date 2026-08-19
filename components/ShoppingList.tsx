"use client";

export type ShoppingItem = { id: string; text: string; source: string; done: boolean };

export function ShoppingList({ items, setItems }: { items: ShoppingItem[]; setItems: (items: ShoppingItem[]) => void }) {
  const remaining = items.filter((x) => !x.done).length;

  return (
    <section className="page-section narrow-page">
      <div className="section-heading row-between align-end">
        <div><span className="eyebrow">Lista della spesa</span><h2>{remaining ? `${remaining} cose da prendere` : "Lista vuota"}</h2><p>Gli ingredienti aggiunti dalle ricette restano su questo dispositivo.</p></div>
        {items.length ? <button type="button" className="button soft" onClick={() => setItems([])}>Svuota</button> : null}
      </div>

      <div className="surface shopping-surface">
        {!items.length ? (
          <div className="empty-state"><div className="empty-icon">✓</div><h3>Niente da comprare</h3><p>Apri una ricetta e premi “+ Lista spesa”.</p></div>
        ) : (
          <div className="shopping-list">
            {items.map((item) => (
              <button key={item.id} type="button" className={item.done ? "shopping-row done" : "shopping-row"} onClick={() => setItems(items.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))}>
                <span className="shopping-check">{item.done ? "✓" : ""}</span>
                <span className="shopping-copy"><strong>{item.text}</strong><small>{item.source}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
