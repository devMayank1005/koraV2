"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Menu, X, Eye, WifiOff } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { ResizeHandle, usePaneWidth } from "@/components/ui/resizable";
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const offline = useOffline();

  // ⌘K / Ctrl-K from anywhere. Bound on the shell rather than inside the
  // palette so the shortcut works before the palette has ever been opened.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const viewAsRole = useUi((s) => s.viewAsRole);
  const setViewAsRole = useUi((s) => s.setViewAsRole);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUi((s) => s.setSidebarCollapsed);
  const sidebarPane = usePaneWidth("sidebar");

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
          {/* Desktop sidebar.

            PINNED TO THE VIEWPORT, not to the document. Without the height and
            the sticky it is a flex child that stretches to whatever the page
            is tall — measured at 2528px on the dashboard in a 992px window —
            and `aside`'s own `h-full` resolves against that. The nav then has
            no reason to scroll and the footer, which holds the profile, the
            theme toggle and Sign out, lands 2500px down the page. Everything
            inside the sidebar was already built for a bounded column: `aside`
            is a flex column, `nav` is `flex-1 overflow-y-auto`, the footer
            follows it. It only ever needed a bound. */}
          <div className="sticky top-0 hidden h-screen md:flex">
            {/* The palette exists now, so the search control comes back — the
              condition its own comment set. */}
            <Sidebar
              user={user}
              effectiveRole={effectiveRole}
              onSearch={() => setPaletteOpen(true)}
              paneWidth={sidebarPane.width}
            />
            {/* No handle while collapsed: at 56px the pane is a mode, not a
              width, and offering to resize it would promise something the
              collapsed treatment cannot honour. The toggle button reopens it. */}
            {!collapsed && (
              <ResizeHandle
                pane="sidebar"
                label="Resize navigation sidebar"
                onLiveWidth={sidebarPane.setLive}
                onCollapse={() => setSidebarCollapsed(true)}
              />
            )}
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
                  onSearch={() => {
                    setMobileOpen(false);
                    setPaletteOpen(true);
                  }}
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
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
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
