import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Landing-page illustration: a cloud of Gaussian noise transported along
 * flow-matching paths onto the distribution of an SEIR-simulated outbreak
 * curve. Switching scenario flows the particles from the current curve to
 * the new one. Illustrative parameters only — not a fitted model.
 */

const WEEKS = 30;
const SAMPLES = 300;
const N = 1100;
const FLOW_MS = 2600;
const HOLD_MS = 2600;

type Scenario = { id: string; label: string; r0: number; blurb: string };

const SCENARIOS: Scenario[] = [
  { id: "baseline", label: "Baseline", r0: 2.2, blurb: "Typical transmission, no new intervention." },
  { id: "rains", label: "Long rains", r0: 3.0, blurb: "Breeding sites surge after heavy rainfall." },
  { id: "nets", label: "Nets + spraying", r0: 1.4, blurb: "Bed nets and indoor spraying cut transmission." },
];

function seir(r0: number) {
  const sigma = 1 / 1.6;
  const gamma = 0.7;
  const beta = r0 * gamma;
  let S = 0.995;
  let E = 0.003;
  let I = 0.002;
  const dt = 0.01;
  const curve = new Float32Array(SAMPLES + 1);
  const every = WEEKS / SAMPLES;
  let next = 0;
  let k = 0;
  let peak = 0;
  let peakWeek = 0;
  for (let t = 0; k <= SAMPLES; t += dt) {
    if (t >= next) {
      curve[k++] = I;
      next += every;
    }
    if (I > peak) {
      peak = I;
      peakWeek = t;
    }
    const inf = beta * S * I;
    S -= inf * dt;
    E += (inf - sigma * E) * dt;
    I += (sigma * E - gamma * I) * dt;
  }
  return { curve, peak, peakWeek, attack: 1 - S };
}

// Canvas can't read CSS tokens cheaply per frame, so each theme carries its
// own copy. Particles go violet → peach as t runs 0 → 1. On light, additive
// "lighter" blending would wash out to white, so it composites normally.
const CANVAS_THEME = {
  dark: {
    label: "#8F8A9E",
    grid: "rgba(255,255,255,0.06)",
    target: "rgba(255,158,122,0.55)",
    from: [167, 139, 250],
    to: [255, 158, 122],
    alpha: 0.75,
    blend: "lighter" as GlobalCompositeOperation,
  },
  light: {
    label: "#686378",
    grid: "rgba(28,20,48,0.07)",
    target: "rgba(224,100,60,0.6)",
    from: [106, 69, 245],
    to: [224, 100, 60],
    alpha: 0.6,
    blend: "source-over" as GlobalCompositeOperation,
  },
};

function gauss() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export default function FlowMatchingSim({ theme }: { theme: "light" | "dark" }) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [scenario, setScenario] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [replayKey, setReplayKey] = useState(0);
  const paletteRef = useRef(CANVAS_THEME[theme]);
  paletteRef.current = CANVAS_THEME[theme];
  const runs = useMemo(() => SCENARIOS.map((s) => seir(s.r0)), []);
  const yMax = useMemo(() => Math.max(...runs.map((r) => r.peak)) * 1.15, [runs]);

  // Particle state lives in a ref so scenario changes can start a new flow
  // from wherever the particles currently are.
  const state = useRef<{
    sx: Float32Array; sy: Float32Array; tx: Float32Array; ty: Float32Array;
    cx: Float32Array; cy: Float32Array; curl: Float32Array; start: number; key: number;
  } | null>(null);

  // Sample the target distribution: mostly a noisy band on the curve, some
  // fill underneath. Coordinates are normalized plot space (0..1, y up).
  const sampleTarget = (idx: number, tx: Float32Array, ty: Float32Array) => {
    const { curve } = runs[idx];
    for (let i = 0; i < N; i++) {
      const u = Math.random();
      const v = curve[Math.round(u * SAMPLES)] / yMax;
      tx[i] = u;
      ty[i] = Math.random() < 0.72 ? Math.max(0, v * (1 + 0.12 * gauss())) : v * Math.random();
    }
  };

  // Start a flow: from noise on first run / replay, from current positions on a scenario switch.
  useEffect(() => {
    const prev = state.current;
    const fromNoise = !prev || replayKey !== prev.key;
    const s = {
      sx: new Float32Array(N), sy: new Float32Array(N), tx: new Float32Array(N), ty: new Float32Array(N),
      cx: new Float32Array(N), cy: new Float32Array(N), curl: new Float32Array(N), start: performance.now(),
      key: replayKey,
    };
    for (let i = 0; i < N; i++) {
      if (fromNoise) {
        s.sx[i] = 0.5 + 0.17 * gauss();
        s.sy[i] = 0.5 + 0.17 * gauss();
      } else {
        s.sx[i] = prev!.cx[i];
        s.sy[i] = prev!.cy[i];
      }
      s.curl[i] = (Math.random() - 0.5) * 0.25;
    }
    sampleTarget(scenario, s.tx, s.ty);
    s.cx.set(s.sx);
    s.cy.set(s.sy);
    state.current = s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, replayKey]);

  // Static layer: grid, axes, and the target curve for the active scenario.
  useEffect(() => {
    const canvas = bgRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const draw = () => {
      const { w, h, pad } = fit(canvas, ctx);
      const pal = CANVAS_THEME[theme];
      ctx.clearRect(0, 0, w, h);
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillStyle = pal.label;
      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + ((h - pad.t - pad.b) * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(w - pad.r, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(yMax * 100 * (1 - i / 4))}%`, pad.l - 8, y + 3);
      }
      ctx.textAlign = "center";
      for (let wk = 0; wk <= WEEKS; wk += 5) {
        const x = pad.l + ((w - pad.l - pad.r) * wk) / WEEKS;
        ctx.fillText(`wk ${wk}`, x, h - 8);
      }
      const { curve } = runs[scenario];
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = pal.target;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k <= SAMPLES; k++) {
        const x = pad.l + ((w - pad.l - pad.r) * k) / SAMPLES;
        const y = h - pad.b - ((h - pad.t - pad.b) * curve[k]) / yMax;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [scenario, runs, yMax, theme]);

  // Particle layer.
  useEffect(() => {
    const canvas = fgRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    let visible = true;
    let size = fit(canvas, ctx);
    const ro = new ResizeObserver(() => {
      size = fit(canvas, ctx);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = state.current;
      if (!s || !visible) return;
      const elapsed = now - s.start;
      const raw = reduce ? 1 : Math.min(1, elapsed / FLOW_MS);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      const { w, h, pad } = size;
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;

      // Fade the previous frame for trails. Partial destination-out never
      // quite reaches zero (8-bit alpha rounding), so once the flow settles
      // clear fully — otherwise a ghost of the previous curve lingers.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = reduce || raw >= 1 ? "rgba(0,0,0,1)" : "rgba(0,0,0,0.2)";
      ctx.fillRect(0, 0, w, h);
      const pal = paletteRef.current;
      ctx.globalCompositeOperation = pal.blend;

      const [r, g, b] = pal.from.map((c, k) => Math.round(c + (pal.to[k] - c) * t));
      ctx.fillStyle = `rgba(${r},${g},${b},${pal.alpha})`;
      const bend = Math.sin(Math.PI * t);
      for (let i = 0; i < N; i++) {
        const dx = s.tx[i] - s.sx[i];
        const dy = s.ty[i] - s.sy[i];
        // Straight conditional-OT path plus a little curl so trajectories read as a flow field.
        const x = s.sx[i] + dx * t - dy * s.curl[i] * bend;
        const y = s.sy[i] + dy * t + dx * s.curl[i] * bend;
        s.cx[i] = x;
        s.cy[i] = y;
        ctx.fillRect(pad.l + x * pw - 0.9, h - pad.b - y * ph - 0.9, 1.8, 1.8);
      }
      ctx.globalCompositeOperation = "source-over";

      if (readoutRef.current) readoutRef.current.textContent = `t = ${raw.toFixed(2)}`;
      if (barRef.current) barRef.current.style.transform = `scaleX(${raw})`;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // Autoplay: cycle scenarios once each flow has settled.
  useEffect(() => {
    if (!autoplay) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => setScenario((s) => (s + 1) % SCENARIOS.length), FLOW_MS + HOLD_MS);
    return () => window.clearTimeout(id);
  }, [scenario, autoplay, replayKey]);

  const run = runs[scenario];
  const peaked = run.peakWeek < WEEKS - 0.5;

  return (
    <div className="grid grid-cols-1 gap-5 min-[961px]:grid-cols-[1.7fr_1fr]">
      <div className="rounded-[28px] border border-(--pk-line) bg-(--pk-surface) p-4 min-[561px]:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div role="group" aria-label="Simulation scenario" className="flex flex-wrap gap-1.5 rounded-[20px] border border-(--pk-line) bg-(--pk-bg) p-1">
            {SCENARIOS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={scenario === i}
                onClick={() => {
                  setAutoplay(false);
                  setScenario(i);
                }}
                className={
                  "font-lp-display text-[0.82rem] font-semibold px-3.5 py-1.5 rounded-full border-0 cursor-pointer transition-colors duration-200 " +
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pk-violet) " +
                  (scenario === i ? "bg-(--pk-ink) text-(--pk-bg)" : "bg-transparent text-(--pk-ink-2) hover:text-(--pk-ink)")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReplayKey((k) => k + 1)}
            className={
              "font-mono text-[0.74rem] text-(--pk-ink-2) bg-transparent border border-(--pk-line-strong) rounded-full px-3 py-1.5 cursor-pointer " +
              "hover:text-(--pk-ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pk-violet)"
            }
          >
            ↺ Replay from noise
          </button>
        </div>
        <div
          className="relative w-full aspect-[16/10] min-h-[240px]"
          role="img"
          aria-label={`Particles flowing from random noise onto the ${SCENARIOS[scenario].label.toLowerCase()} outbreak curve`}
        >
          <canvas ref={bgRef} className="absolute inset-0 size-full" />
          <canvas ref={fgRef} className="absolute inset-0 size-full" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span ref={readoutRef} className="w-[64px] font-mono text-[0.74rem] text-(--pk-ink-2)">
            t = 0.00
          </span>
          <div className="flex-1 h-1 rounded-full bg-(--pk-tint-strong) overflow-hidden">
            <div ref={barRef} style={{ transform: "scaleX(0)" }} className="h-full origin-left bg-linear-to-r from-(--pk-violet) to-(--pk-peach)" />
          </div>
          <span className="font-mono text-[0.68rem] text-(--pk-ink-3)">noise → forecast</span>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="rounded-[28px] border border-(--pk-line) bg-(--pk-surface) p-6">
          <div className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-(--pk-ink-3)">Scenario</div>
          <div className="mt-2 font-lp-display text-[1.35rem] font-bold text-(--pk-ink)">{SCENARIOS[scenario].label}</div>
          <p className="mt-1.5 mb-0 text-[0.9rem] text-(--pk-ink-2) leading-[1.5]">{SCENARIOS[scenario].blurb}</p>
          <dl className="mt-5 grid grid-cols-3 gap-3 m-0">
            {[
              ["R₀", SCENARIOS[scenario].r0.toFixed(1)],
              ["Peak", peaked ? `wk ${Math.round(run.peakWeek)}` : `> wk ${WEEKS}`],
              ["Peak load", `${(run.peak * 100).toFixed(1)}%`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[0.66rem] text-(--pk-ink-3)">{k}</dt>
                <dd className="m-0 mt-1 font-lp-display text-[1.25rem] font-bold text-(--pk-ink)">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-[28px] border border-(--pk-line) bg-(--pk-surface) p-6 flex-1">
          <p className="m-0 text-[0.9rem] text-(--pk-ink-2) leading-[1.6]">
            Each dot starts as random noise and follows a flow-matching path onto the distribution of a simulated SEIR
            outbreak. Switch scenarios and watch the same particles reflow to the new curve.
          </p>
          <p className="mt-3 mb-0 font-mono text-[0.68rem] text-(--pk-ink-3) leading-[1.5]">
            Illustrative parameters, not a fitted forecast.
          </p>
        </div>
      </div>
    </div>
  );
}

function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = rect.width;
  const h = rect.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, pad: { l: 44, r: 22, t: 10, b: 26 } };
}
