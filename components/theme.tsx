"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Theme handling.
 *
 * The `dark` class on <html> is the single source of truth, and it is set
 * before first paint by the inline script in app/layout.tsx. Because that class
 * is state living outside React, this reads it with useSyncExternalStore rather
 * than mirroring it into useState via an effect — no tearing, no extra render,
 * and it stays correct if anything else toggles the class.
 *
 * The storage key is the legacy `itk_dark` on purpose: users' existing
 * preference carries over from the old app at cutover.
 */

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

/** Server render and first hydration pass assume light; the inline script has
 *  already applied the real class, so the observer corrects it immediately. */
const isDarkServer = () => false;

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, isDarkServer);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("itk_dark", next ? "1" : "0");
    } catch {
      // Private mode / storage disabled — the toggle still works for this session.
    }
  }, []);

  return { dark, toggle };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={className ?? "k-btn k-btn-outline k-btn-sm"}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? (
        <Moon size={15} strokeWidth={1.5} />
      ) : (
        <Sun size={15} strokeWidth={1.5} />
      )}
      {dark ? "Dark" : "Light"}
    </button>
  );
}
