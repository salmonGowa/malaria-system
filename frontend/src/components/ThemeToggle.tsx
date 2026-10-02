import { MoonIcon, SunIcon } from "./icons";
import { useTheme } from "../lib/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="relative inline-flex items-center w-11.5 h-6.5 p-0.75 rounded-full border border-border-strong bg-panel-muted cursor-pointer shrink-0 transition-colors duration-200 ease-in-out"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span className={`grid place-items-center w-4.5 h-4.5 flex-1 z-10 ${isDark ? "text-muted" : "text-accent-text"}`}>
        <SunIcon size={13} />
      </span>
      <span className={`grid place-items-center w-4.5 h-4.5 flex-1 z-10 ${isDark ? "text-accent-text" : "text-muted"}`}>
        <MoonIcon size={13} />
      </span>
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-bg-elevated shadow-[var(--shadow-sm)] transition-transform duration-200 ease-in-out"
        style={{ transform: isDark ? "translateX(20px)" : "translateX(0)" }}
        aria-hidden="true"
      />
    </button>
  );
}
