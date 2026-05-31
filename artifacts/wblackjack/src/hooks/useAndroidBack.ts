import { useEffect, useRef } from "react";

/**
 * Intercepts the Android hardware back button (and any browser back gesture)
 * so it calls `onBack` instead of navigating to a previous browser-history
 * entry (which would exit the app or land on an unrelated page).
 *
 * Strategy: push a sentinel `pushState` entry on mount so there is always a
 * browser-history entry ahead of the page to absorb the back gesture.
 * When `popstate` fires we call `onBack` and let the newly navigated-to page
 * push its own sentinel on mount.
 */
export function useAndroidBack(onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    window.history.pushState({ __androidBack: true }, "");

    function handler() {
      onBackRef.current();
    }

    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
    };
  }, []);
}
