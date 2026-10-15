"use client";
import { useEffect, useState } from "react";
export function ThemeControl() {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    const value = localStorage.getItem("ricettario-theme") || "system";
    if (["system", "light", "dark"].includes(value)) {
      setTheme(value);
      document.documentElement.dataset.theme = value;
    }
  }, []);
  return (
    <fieldset className="appearance-options">
      <legend>Aspetto</legend>
      {(
        [
          ["system", "Sistema"],
          ["light", "Chiaro"],
          ["dark", "Scuro"],
        ] as const
      ).map(([value, label]) => (
        <button
          type="button"
          key={value}
          aria-pressed={theme === value}
          className={"button " + (theme === value ? "primary" : "soft")}
          onClick={() => {
            setTheme(value);
            document.documentElement.dataset.theme = value;
            try {
              localStorage.setItem("ricettario-theme", value);
            } catch {}
          }}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
