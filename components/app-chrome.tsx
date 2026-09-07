"use client";

import { useState, useSyncExternalStore } from "react";
import { Menu, X, Eye, WifiOff } from "lucide-react";
import { Sidebar, type SidebarUser } from "@/components/sidebar";
import { RouteBreadcrumbs } from "@/components/breadcrumbs";
import { useUi, useEffectiveRole } from "@/lib/store/ui";
import { Providers } from "@/components/providers";
import { SessionProvider, isReadOnlyBuild } from "@/lib/query/permissions";

/**
 * Everything around a screen: sidebar, banners, mobile drawer.
 *
 * The banners live in a `position: sticky` rail and stack, because they must
 * stay visible while scrolling — an offline banner you
 * can scroll past is worse than none, since it implies the app is fine.
 */
export function AppChrome({
  user,
  children,
}: {
  user: SidebarUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const offline = useOffline();
  const viewAsRole = useUi((s) => s.viewAsRole);
  const setViewAsRole = useUi((s) => s.setViewAsRole);

  // The role comes from the shared hook, not from a second copy of this rule —
  // the dashboard needs the same answer to decide which of its two entirely
  // different screens to render, and computing it twice is how the sidebar
  // and the page come to disagree.
  const previewing = user.role === "admin" && viewAsRole;
  const effectiveRole = useEffectiveRole(user.role);

  // Read-only parallel run. Not a permission and not a fault — the normal state
  // of this app until the writer is flipped — so it is stated plainly and
  // always, rather than discovered when a save is refused.
  const readOnly = isReadOnlyBuild();

  // No height constant and no padding: the rail is `position: sticky`, so it
  // takes its own height in normal flow and still pins on scroll. The previous
  // arrangement padded the shell by a hand-maintained number that was already
  // wrong for the view-as banner.

  return (
    <SessionProvider value={user}>
      <Providers>
      <div className="k-banner-rail">
      {readOnly && (
        <div className="k-banner-readonly">
          <Eye size={14} strokeWidth={1.5} aria-hidden />
          <span>
            Read-only preview of the live data. Make changes in the current
            Kora.
          </span>
        </div>
      )}

      {previewing && (
        <div className="k-banner-viewas">
          <Eye size={14} strokeWidth={1.5} />
          Previewing as {viewAsRole} — your real admin access is unchanged
          <button
            type="button"
            onClick={() => setViewAsRole(null)}
            className="ml-2 rounded-[4px] border border-white/40 px-2 py-0.5 text-[11px] font-semibold"
          >
            Exit preview
          </button>
        </div>
      )}

      {offline && (
        <div className="k-banner-offline">
          <WifiOff size={14} strokeWidth={1.5} />
          You are offline — changes cannot be saved right now
        </div>
      )}
      </div>

      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          {/* No onSearch: the command palette is deferred, and a search button
              that does nothing on first press costs more confidence than a
              missing one. The Sidebar hides the control when the prop is
              absent — restore it in the same commit as the palette. */}
          <Sidebar user={user} effectiveRole={effectiveRole} />
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/35 md:hidden"
            />
            <div className="fixed inset-y-0 left-0 z-50 md:hidden">
              <Sidebar
                user={user}
                effectiveRole={effectiveRole}
                mobile
                onNavigate={() => setMobileOpen(false)}
                onSearch={() => setMobileOpen(false)}
              />
            </div>
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <div className="flex items-center gap-3 border-b border-k-line bg-k-paper px-4 py-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Open navigation"
              className="k-btn k-btn-ghost k-btn-sm !px-2"
            >
              {mobileOpen ? (
                <X size={18} strokeWidth={1.5} />
              ) : (
                <Menu size={18} strokeWidth={1.5} />
              )}
            </button>
            <span className="font-k-head text-[16px] font-bold tracking-[0.16em] text-k-primary">
              KORA
            </span>
          </div>

          <RouteBreadcrumbs />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      </Providers>
    </SessionProvider>
  );
}

/**
 * Online/offline, read from the browser rather than mirrored into state.
 *
 * `navigator.onLine` is external state, so it goes through the same
 * useSyncExternalStore treatment as the theme class. An effect that copied it
 * into useState would tear on the first paint and would trip React 19's
 * set-state-in-effect rule — which the previous version of this function did,
 * under a comment claiming it did not.
 *
 * The server snapshot is `false`: rendering "you are offline" into HTML that
 * by definition arrived over the network would be absurd.
 */
function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useOffline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );
}
