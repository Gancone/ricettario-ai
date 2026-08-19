"use client";

export type AppTab = "recipes" | "new" | "shopping" | "settings";

export function BottomNav({ tab, onChange }: { tab: AppTab; onChange: (tab: AppTab) => void }) {
  const items: Array<[AppTab, string, string]> = [
    ["recipes", "⌂", "Ricette"],
    ["new", "+", "Nuova"],
    ["shopping", "✓", "Spesa"],
    ["settings", "⚙", "Impostazioni"]
  ];

  return (
    <nav className="bottom-nav" aria-label="Navigazione">
      {items.map(([id, icon, label]) => (
        <button key={id} type="button" className={tab === id ? "bottom-nav-item active" : "bottom-nav-item"} onClick={() => onChange(id)}>
          <span className="bottom-nav-icon">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
