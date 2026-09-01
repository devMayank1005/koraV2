"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ApiError } from "@/lib/api/fetcher";
import { adoptLegacyPreferences } from "@/lib/store/ui";

/**
 * Client-side providers.
 *
 * The query defaults replace the old app's `backgroundRefreshClients()` — a
 * bare 60-second `setInterval` that re-fetched every client, then took care to
 * skip when a modal was open or the tab was hidden so it would not clobber an
 * in-progress edit. React Query does the skipping properly: it pauses when the
 * tab is hidden, dedupes concurrent requests, and never replaces data a
 * mutation is currently touching.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A client tree is expensive to build and changes on human timescales.
        staleTime: 30_000,
        refetchInterval: 60_000,
        // The old app had no equivalent; coming back to a stale tab and acting
        // on week-old numbers is exactly how two people overwrite each other.
        refetchOnWindowFocus: true,
        retry(failureCount, error) {
          // Retrying a 401 or a 403 cannot succeed, and retrying a 409 would
          // race the conflict the user needs to see. Only transient failures
          // are worth a second attempt.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        // Never automatic. A write that failed must surface, not silently
        // replay — the old app's optimistic handlers rolled back by hand and a
        // hidden retry would have fought them.
        retry: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state, not at module scope: a module-level client would be
  // shared across requests on the server and leak one user's data into
  // another's cache.
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    adoptLegacyPreferences();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          // Sonner's own palette is not ours; these map onto the k-* tokens so
          // toasts match the app in both themes.
          className: "k-toast",
          duration: 4000,
        }}
      />
    </QueryClientProvider>
  );
}
