import { MoonIcon, SunIcon } from "./icons";
import { useTheme } from "../lib/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      data-theme={theme}
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span className="theme-toggle-icon theme-toggle-icon-sun">
        <SunIcon size={13} />
      </span>
      <span className="theme-toggle-icon theme-toggle-icon-moon">
        <MoonIcon size={13} />
      </span>
      <span className="theme-toggle-thumb" aria-hidden="true" />
    </button>
  );
}
