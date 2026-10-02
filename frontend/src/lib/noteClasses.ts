/** Was `.placeholder-note` — the muted, left-accented note used for empty
 * states and descriptive asides across almost every page. A plain constant
 * (not a component) since call sites vary between a bare `<p>` and one with
 * nested links/children — see lib/fieldClasses.ts for the same reasoning. */
export const PLACEHOLDER_NOTE_CLASS = "text-muted text-[0.8125rem] border-l-[3px] border-l-accent pl-2.5";

/** Was `.route-loading`, previously combined with `.placeholder-note` and
 * relying on `.route-loading`'s own `padding`/`border-left` shorthand
 * declarations to override the latter's — written here as one standalone
 * string instead so there's no cross-class override to get right. Shown
 * briefly while a lazy-loaded route's chunk downloads (App.tsx's
 * `React.lazy` per-page code splitting) — border-less and centered, since
 * this isn't a note about data, just a loading state. */
export const ROUTE_LOADING_CLASS = "text-muted text-[0.8125rem] py-10 text-center";
