import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { AllocationIcon, SimulationIcon } from "../components/icons";
import AllocationSimulator from "../components/simulations/AllocationSimulator";
import OutbreakSimulator, { type IncomingScenario } from "../components/simulations/OutbreakSimulator";
import { btnClass } from "../lib/buttonClasses";
import { useLanguage } from "../lib/i18n";
import { useSimText, type SimKey } from "../lib/i18n/simulations";
import type { OutbreakParams } from "../lib/outbreakScenario";

type TabId = "outbreak" | "allocation";

const TABS: { id: TabId; label: SimKey; question: SimKey; icon: ReactNode }[] = [
  { id: "outbreak", label: "tab.outbreak", question: "tab.outbreakQ", icon: <SimulationIcon size={18} /> },
  { id: "allocation", label: "tab.allocation", question: "tab.allocationQ", icon: <AllocationIcon size={18} /> },
];

export default function Simulations() {
  const { t } = useLanguage();
  const st = useSimText();
  const [tab, setTab] = useState<TabId>(() => (window.location.hash === "#allocation" ? "allocation" : "outbreak"));
  const [incoming, setIncoming] = useState<IncomingScenario | null>(null);
  const nonce = useRef(0);

  const select = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
  };

  // The allocation tab's "Open in simulator": carry the county, its doses
  // (as vaccine protection) and the impact assumptions across.
  const openOutbreak = (params: OutbreakParams) => {
    setIncoming({ params, nonce: ++nonce.current });
    select("outbreak");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.simulations")}</h2>
          <p className="mt-1 mb-0 text-sm text-muted">{st("page.subtitle")}</p>
        </div>
        <Link className={btnClass("secondary", { className: "no-underline" })} to="/upload-simulate">
          {st("page.uploadLink")}
        </Link>
      </header>

      <div role="tablist" aria-label={st("page.tablist")} className="mb-5 grid gap-3 min-[761px]:grid-cols-2">
        {TABS.map((tb) => {
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              id={`sim-tab-${tb.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`sim-panel-${tb.id}`}
              onClick={() => select(tb.id)}
              className={
                "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition duration-150 " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                (active ? "border-accent bg-accent-soft shadow-[var(--shadow-sm)]" : "border-border bg-panel hover:border-border-strong")
              }
            >
              <span className={`grid size-9 flex-none place-items-center rounded-lg ${active ? "bg-accent text-white" : "bg-panel-muted text-muted"}`}>
                {tb.icon}
              </span>
              <span>
                <span className="block text-[0.95rem] font-semibold text-text">{st(tb.label)}</span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{st(tb.question)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Both stay mounted (just hidden) so switching tabs keeps each one's settings. */}
      <div role="tabpanel" id="sim-panel-outbreak" aria-labelledby="sim-tab-outbreak" hidden={tab !== "outbreak"}>
        <OutbreakSimulator incoming={incoming} />
      </div>
      <div role="tabpanel" id="sim-panel-allocation" aria-labelledby="sim-tab-allocation" hidden={tab !== "allocation"}>
        <AllocationSimulator onOpenOutbreak={openOutbreak} />
      </div>
    </div>
  );
}
