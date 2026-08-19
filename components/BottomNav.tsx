"use client";

import { Icon, type IconName } from "@/components/Icon";

export type AppTab = "recipes" | "new" | "shopping" | "settings";

export function BottomNav({ tab, onChange, shoppingCount = 0 }: { tab: AppTab; onChange: (tab: AppTab) => void; shoppingCount?: number }) {
  const items: Array<[AppTab, IconName, string]> = [
    ["recipes", "book", "Ricette"],
    ["new", "plus", "Nuova"],
    ["shopping", "bag", "Spesa"],
    ["settings", "settings", "Altro"]
  ];

  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      {items.map(([id, icon, label]) => (
        <button key={id} type="button" className={tab === id ? "bottom-nav-item active" : "bottom-nav-item"} onClick={() => onChange(id)}>
          <span className="bottom-nav-icon-wrap"><Icon name={icon} size={21} />{id === "shopping" && shoppingCount ? <b>{shoppingCount}</b> : null}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
