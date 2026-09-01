"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * UI preferences that outlive a page load.
 *
 * THE STORAGE KEYS ARE THE OLD APP'S, deliberately. At cutover everyone's
 * browser already holds `itk_sb_collapsed` and `itk_recent` from years of
 * using v1; reading the same keys means a collapsed sidebar stays collapsed
 * and recent items survive the switch. It costs nothing and it is the
 * difference between the new app feeling like an upgrade and feeling like a
 * reset.
 *
 * Two of the old keys are deliberately NOT carried over:
 *
 *   `itk_sess`  held `btoa(JSON.stringify({token, user}))` — the session in
 *               localStorage, readable by any script on the page. That is the
 *               whole reason the session is an httpOnly cookie now.
 *   `itk_view`  restored the last route on load. The URL does that, and doing
 *               both means a deep link silently loses to a stale preference.
 *
 * Dark mode is NOT here either. It lives on the <html> class, applied before
 * first paint by the inline script in app/layout.tsx, and is read through
 * useSyncExternalStore in components/theme.tsx — putting it in a hydrated
 * store as well would give it two sources of truth and a flash.
 */

export interface RecentItem {
  /** Route to return to. */
  href: string;
  label: string;
  sub?: string;
  kind: "client" | "integration" | "module" | "phase" | "ams";
}

const MAX_RECENT = 8;

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  recent: RecentItem[];
  pushRecent: (item: RecentItem) => void;

  /** Admin-only preview of a lesser role. Memory-only — see below. */
  viewAsRole: "editor" | "viewer" | null;
  setViewAsRole: (r: "editor" | "viewer" | null) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      recent: [],
      pushRecent: (item) =>
        set((s) => ({
          // Most recent first, de-duplicated by href, capped. Same shape the
          // old app kept, so a carried-over list renders without migration.
          recent: [item, ...s.recent.filter((r) => r.href !== item.href)].slice(
            0,
            MAX_RECENT,
          ),
        })),

      viewAsRole: null,
      setViewAsRole: (r) => set({ viewAsRole: r }),
    }),
    {
      name: "itk_ui",
      storage: createJSONStorage(() => localStorage),
      /**
       * `viewAsRole` is excluded from persistence on purpose.
       *
       * It is a preview an admin turns on to check what an editor sees. If it
       * survived a reload, an admin could return the next morning, find half
       * the app missing, and have no idea why — the old app kept it in memory
       * for exactly this reason. It is also client-side only and never
       * influences a server authorisation decision; the session still carries
       * the real role and every API route re-checks it.
       */
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        recent: s.recent,
      }),
      version: 1,
    },
  ),
);

/**
 * Reads the old app's standalone keys once, on first load.
 *
 * v1 wrote `itk_sb_collapsed` as a bare `'1'`/`'0'` string and `itk_recent` as
 * a bare JSON array, not inside a Zustand envelope. This lifts them into the
 * store the first time the new app runs and then leaves them alone — it does
 * not delete them, because the old app is still live until cutover and would
 * lose the preference.
 */
export function adoptLegacyPreferences(): void {
  try {
    if (localStorage.getItem("itk_ui")) return; // already migrated

    const collapsed = localStorage.getItem("itk_sb_collapsed");
    if (collapsed === "1" || collapsed === "0") {
      useUi.getState().setSidebarCollapsed(collapsed === "1");
    }

    const recentRaw = localStorage.getItem("itk_recent");
    if (recentRaw) {
      const parsed: unknown = JSON.parse(recentRaw);
      if (Array.isArray(parsed)) {
        // v1 stored {type,label,sub,view,params}; the route is rebuilt from
        // view+params rather than carried, so anything unrecognised is
        // dropped instead of producing a link that 404s.
        for (const r of parsed.slice(0, MAX_RECENT).reverse()) {
          const href = legacyHref(r as LegacyRecent);
          if (href) {
            useUi.getState().pushRecent({
              href,
              label: String((r as LegacyRecent).label ?? ""),
              sub: (r as LegacyRecent).sub,
              kind: legacyKind((r as LegacyRecent).view),
            });
          }
        }
      }
    }
  } catch {
    // Storage disabled or corrupt. Preferences are a convenience; losing them
    // must never stop the app loading.
  }
}

interface LegacyRecent {
  view?: string;
  label?: string;
  sub?: string;
  params?: { clientId?: string; integId?: string; moduleId?: string; phase?: string };
}

function legacyHref(r: LegacyRecent): string | null {
  const p = r.params ?? {};
  const e = encodeURIComponent;
  switch (r.view) {
    case "dashboard": return "/dashboard";
    case "clients": return "/integrations";
    case "client-detail": return p.clientId ? `/integrations/${e(p.clientId)}` : null;
    case "integ-detail":
      return p.clientId && p.integId
        ? `/integrations/${e(p.clientId)}/${e(p.integId)}` : null;
    case "impl-clients": return "/implementation";
    case "impl-client-detail": return p.clientId ? `/implementation/${e(p.clientId)}` : null;
    case "impl-phase-detail":
      return p.clientId && p.moduleId && p.phase
        ? `/implementation/${e(p.clientId)}/${e(p.moduleId)}/${e(p.phase)}` : null;
    case "ams-clients": return "/ams";
    case "ams-client-detail": return p.clientId ? `/ams/${e(p.clientId)}` : null;
    case "admin": return "/admin";
    default: return null;
  }
}

function legacyKind(view: string | undefined): RecentItem["kind"] {
  if (view?.startsWith("integ")) return "integration";
  if (view?.startsWith("impl")) return view === "impl-phase-detail" ? "phase" : "module";
  if (view?.startsWith("ams")) return "ams";
  return "client";
}
