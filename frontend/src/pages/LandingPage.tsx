import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import FlowMatchingSim from "../components/FlowMatchingSim";
import { MoonIcon, SunIcon } from "../components/icons";
import { useTheme, type Theme } from "../lib/theme";
import type { SceneTheme } from "../lib/mosquitoScene";

// Follows the app-wide theme (lib/theme). ink-3 is the floor for any text:
// 5.9:1 on the dark bg, 5.6:1 on the light one. Light mode deepens the
// accents so gradient headings and the violet kickers still clear AA.
const TOKENS: Record<Theme, CSSProperties> = {
  dark: {
    "--pk-bg": "#08070D",
    "--pk-surface": "#100F17",
    "--pk-line": "rgba(255,255,255,0.08)",
    "--pk-line-strong": "rgba(255,255,255,0.16)",
    "--pk-tint": "rgba(255,255,255,0.04)",
    "--pk-tint-strong": "rgba(255,255,255,0.08)",
    "--pk-grid": "rgba(255,255,255,0.05)",
    "--pk-ink": "#F4F2F8",
    "--pk-ink-2": "#B9B5C6",
    "--pk-ink-3": "#8F8A9E",
    "--pk-peach": "#FF9E7A",
    "--pk-violet": "#A78BFA",
    "--pk-indigo": "#7C5CFF",
    "--pk-green": "#4ADE9A",
    "--pk-glow-a": "rgba(124,92,255,0.3)",
    "--pk-glow-b": "rgba(255,158,122,0.13)",
    "--pk-shadow": "rgba(0,0,0,0.8)",
    colorScheme: "dark",
  } as CSSProperties,
  light: {
    "--pk-bg": "#FBF8F5",
    "--pk-surface": "#FFFFFF",
    "--pk-line": "rgba(28,20,48,0.08)",
    "--pk-line-strong": "rgba(28,20,48,0.15)",
    "--pk-tint": "rgba(28,20,48,0.03)",
    "--pk-tint-strong": "rgba(28,20,48,0.07)",
    "--pk-grid": "rgba(28,20,48,0.05)",
    "--pk-ink": "#15111F",
    "--pk-ink-2": "#4A4558",
    "--pk-ink-3": "#686378",
    "--pk-peach": "#E0643C",
    "--pk-violet": "#6A45F5",
    "--pk-indigo": "#5530E0",
    "--pk-green": "#0E9A62",
    "--pk-glow-a": "rgba(124,92,255,0.16)",
    "--pk-glow-b": "rgba(255,158,122,0.2)",
    "--pk-shadow": "rgba(40,28,80,0.18)",
    colorScheme: "light",
  } as CSSProperties,
};

const DISPLAY = "font-lp-display text-balance tracking-[-0.03em] m-0";
const GRADIENT_TEXT =
  "bg-linear-to-r from-(--pk-peach) via-(--pk-violet) to-(--pk-indigo) bg-clip-text text-transparent";

const BTN =
  "font-lp-display font-semibold text-[0.95rem] px-6 py-3.5 rounded-full no-underline " +
  "inline-flex items-center gap-2 cursor-pointer transition-[transform,background-color] duration-200 " +
  "hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pk-violet)";
const BTN_PRIMARY = `${BTN} bg-(--pk-ink) text-(--pk-bg) shadow-[0_0_0_1px_var(--pk-line-strong),0_12px_40px_-8px_rgba(124,92,255,0.5)]`;
const BTN_GHOST = `${BTN} bg-(--pk-tint) text-(--pk-ink) border border-(--pk-line-strong) hover:bg-(--pk-tint-strong)`;

const ARROW = (
  <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function BrandMark({ gradientId, className }: { gradientId: string; className: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="16" cy="16" r="15" stroke={`url(#${gradientId})`} strokeWidth="1.6" opacity="0.55" />
      <circle cx="16" cy="16" r="10" stroke={`url(#${gradientId})`} strokeWidth="1.6" opacity="0.8" />
      <circle cx="16" cy="16" r="3.2" fill={`url(#${gradientId})`} />
      <defs>
        <linearGradient id={gradientId} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9E7A" />
          <stop offset="1" stopColor="#7C5CFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** WebGL mosquito (lib/mosquitoScene). three.js is imported on demand so
 * it never lands in the main app bundle; without WebGL only the glow shows. */
function MosquitoStage({ theme }: { theme: SceneTheme }) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ setTheme: (t: SceneTheme) => void } | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined" || !hasWebGL()) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    import("../lib/mosquitoScene")
      .then(({ mountMosquito }) => {
        if (cancelled) return;
        const scene = mountMosquito(el, { reduceMotion, theme: themeRef.current });
        sceneRef.current = scene;
        cleanup = scene.dispose;
        setReady(true);
      })
      .catch(() => {
        /* decorative — the hero still reads fine without it */
      });
    return () => {
      cancelled = true;
      sceneRef.current = null;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <div className="relative h-[380px] min-[561px]:h-[480px] min-[961px]:h-[620px]">
      <div
        aria-hidden="true"
        className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle,var(--pk-glow-a),var(--pk-glow-b)_45%,transparent_70%)] blur-2xl"
      />
      <div
        ref={ref}
        role="img"
        aria-label="3D model of a female Anopheles mosquito, the malaria vector, hovering with its wings beating"
        className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
      />
      <p className="absolute inset-x-0 bottom-2 m-0 text-center font-mono text-[0.68rem] text-(--pk-ink-3)">
        Anopheles gambiae · move your cursor
      </p>
    </div>
  );
}

function ThemeButton() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={
        "grid place-items-center size-10 rounded-full border border-(--pk-line-strong) bg-(--pk-tint) text-(--pk-ink-2) " +
        "cursor-pointer transition-colors duration-200 hover:text-(--pk-ink) hover:bg-(--pk-tint-strong) " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pk-violet)"
      }
    >
      {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </button>
  );
}

export default function LandingPage() {
  const { theme } = useTheme();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Kinga Sentinel — AI-assisted malaria tracking, forecasting & vaccine allocation";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <div
      data-testid="landing-page"
      style={TOKENS[theme]}
      className={
        "relative min-h-screen bg-(--pk-bg) text-(--pk-ink) font-sans antialiased overflow-x-clip transition-colors duration-300 " +
        "selection:bg-(--pk-violet) selection:text-(--pk-bg)"
      }
    >
      {/* Top glow + faint grid */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[1000px] overflow-hidden">
        <div className="absolute right-[-10%] -top-[300px] size-[1000px] rounded-full bg-[radial-gradient(circle,var(--pk-glow-a),transparent_62%)]" />
        <div className="absolute left-[-5%] top-[160px] size-[480px] rounded-full bg-[radial-gradient(circle,var(--pk-glow-b),transparent_65%)]" />
        <div
          className={
            "absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_60%_25%,black,transparent_70%)] " +
            "bg-[linear-gradient(var(--pk-grid)_1px,transparent_1px),linear-gradient(90deg,var(--pk-grid)_1px,transparent_1px)] " +
            "bg-[size:64px_64px]"
          }
        />
      </div>

      {/* NAV */}
      <div className="sticky top-0 z-50 px-4 pt-4">
        <nav
          className={
            "max-w-[1180px] mx-auto flex items-center justify-between rounded-full border border-(--pk-line-strong) " +
            "bg-(--pk-bg)/70 backdrop-blur-xl py-2 pr-2 pl-5 shadow-[0_10px_40px_-15px_var(--pk-shadow)]"
          }
        >
          <a href="#top" className="flex items-center gap-2.5 font-lp-display font-bold text-[1.02rem] tracking-[-0.01em] text-(--pk-ink) no-underline">
            <BrandMark gradientId="pk-g1" className="size-[26px] flex-none" />
            Kinga Sentinel
          </a>
          <a
            href="#simulate"
            className="hidden min-[641px]:inline text-[0.9rem] text-(--pk-ink-2) no-underline transition-colors duration-200 hover:text-(--pk-ink)"
          >
            Simulations
          </a>
          <div className="flex items-center gap-2">
            <ThemeButton />
            <Link
              to="/dashboard"
              className={
                "font-lp-display text-[0.85rem] font-semibold bg-(--pk-ink) text-(--pk-bg) px-5 py-2.5 rounded-full " +
                "no-underline whitespace-nowrap transition-transform duration-200 hover:-translate-y-px"
              }
            >
              See the platform
            </Link>
          </div>
        </nav>
      </div>

      <main className="relative max-w-[1240px] mx-auto px-4 min-[561px]:px-6">
        {/* HERO */}
        <section id="top" className="grid grid-cols-1 items-center gap-2 pt-12 min-[961px]:grid-cols-[1fr_1.05fr] min-[961px]:pt-6">
          <div className="text-center min-[961px]:text-left">
            <span
              className={
                "inline-flex items-center gap-2 font-mono text-[0.72rem] tracking-[0.08em] uppercase text-(--pk-ink-2) " +
                "border border-(--pk-line-strong) bg-(--pk-tint) px-3.5 py-2 rounded-full"
              }
            >
              <span className="size-1.5 rounded-full bg-(--pk-green) shadow-[0_0_10px_var(--pk-green)]" />
              Malaria decision support · Kenya
            </span>
            <h1 className={`${DISPLAY} mt-7 text-[clamp(2.7rem,6vw,4.7rem)] leading-[0.95] font-extrabold text-(--pk-ink)`}>
              See the outbreak <span className={`${GRADIENT_TEXT} pb-2`}>before it arrives.</span>
            </h1>
            <p className="mx-auto min-[961px]:mx-0 mt-7 mb-0 max-w-[50ch] text-[1.1rem] leading-[1.6] text-(--pk-ink-2)">
              Tamper-evident case reporting, rainfall-driven forecasting and vaccine allocation in one system health
              officers can act on, in English or Kiswahili, even on a weak connection.
            </p>
            <div className="flex gap-3 justify-center min-[961px]:justify-start mt-9 flex-wrap">
              <Link className={BTN_PRIMARY} to="/dashboard">
                Explore the platform {ARROW}
              </Link>
              <Link className={BTN_GHOST} to="/upload-simulate">
                Try the simulator
              </Link>
            </div>
          </div>
          <MosquitoStage theme={theme} />
        </section>

        {/* SIMULATIONS */}
        <section id="simulate" className="pt-24 min-[561px]:pt-32 scroll-mt-24">
          <div className="max-w-[720px] mb-10">
            <span className="inline-block font-mono text-[0.74rem] uppercase tracking-[0.14em] text-(--pk-violet) mb-4">
              Simulations
            </span>
            <h2 className={`${DISPLAY} text-[clamp(2rem,5vw,3.4rem)] font-bold leading-[1.02] text-(--pk-ink)`}>
              From noise to a forecast, <span className={GRADIENT_TEXT}>in one flow.</span>
            </h2>
            <p className="mt-5 mb-0 text-[1.05rem] text-(--pk-ink-2) leading-[1.6] max-w-[58ch]">
              Uncertainty collapses into a projection you can plan around. Try a scenario and see how rainfall or an
              intervention bends the curve.
            </p>
          </div>
          <FlowMatchingSim theme={theme} />
          <Link
            to="/simulations"
            className="mt-6 inline-flex items-center gap-2 font-lp-display font-semibold text-[0.92rem] text-(--pk-ink) no-underline hover:gap-3 transition-[gap] duration-200"
          >
            Open the full simulation workspace {ARROW}
          </Link>
        </section>

        {/* CTA */}
        <section className="pt-24 min-[561px]:pt-32">
          <div className="relative isolate overflow-hidden rounded-[36px] border border-(--pk-line-strong) bg-(--pk-surface) px-6 py-16 min-[561px]:px-12 min-[561px]:py-20 text-center">
            <div
              aria-hidden="true"
              className="absolute -z-10 left-1/2 top-full -translate-x-1/2 -translate-y-1/2 size-[900px] rounded-full bg-[radial-gradient(circle,var(--pk-glow-a),var(--pk-glow-b)_40%,transparent_65%)]"
            />
            <h2 className={`${DISPLAY} text-[clamp(2rem,5vw,3.6rem)] font-extrabold leading-[1] max-w-[18ch] mx-auto text-(--pk-ink)`}>
              Built for the counties carrying the heaviest burden.
            </h2>
            <div className="flex gap-3 justify-center mt-10 flex-wrap">
              <Link className={BTN_PRIMARY} to="/dashboard">
                Explore the platform {ARROW}
              </Link>
              <Link className={BTN_GHOST} to="/chain-integrity">
                Simulate a tampered record
              </Link>
            </div>
          </div>
        </section>

        <footer className="pt-14 pb-12 flex justify-between gap-4 flex-wrap items-center text-[0.8rem] text-(--pk-ink-3)">
          <span className="flex items-center gap-2 font-lp-display font-bold text-(--pk-ink-2)">
            <BrandMark gradientId="pk-g2" className="size-5" />
            Kinga Sentinel
          </span>
          <span className="max-w-[60ch]">
            Undergraduate public-health research prototype. Not deployed by any ministry or county health office.
          </span>
        </footer>
      </main>
    </div>
  );
}
