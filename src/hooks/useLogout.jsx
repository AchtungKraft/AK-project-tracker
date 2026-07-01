import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { queryClientInstance } from "@/lib/query-client";

// Keys the Base44 SDK / app-params stores in localStorage for session auth
const SESSION_STORAGE_KEYS = [
  "base44_access_token",
  "base44_app_id",
  "base44_server_url",
  "base44_from_url",
  "base44_functions_version",
  "achtung_view_as_company",
];

export function useLogout() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    // 1. Clear React Query cache — prevents stale data flash
    queryClientInstance.clear();

    // 2. Clear all session-related localStorage keys.
    //    CRITICAL: base44_access_token must be removed so the SDK
    //    cannot silently re-authenticate on next page load.
    SESSION_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));

    // 3. Call SDK logout which clears server-side HTTP-only cookies,
    //    then use redirectToLogin to force a real login screen
    //    instead of redirecting to app root (which would auto-rehydrate
    //    if any session survived).
    try {
      base44.auth.logout();
    } catch (e) {
      // logout() may throw if it tries to redirect synchronously;
      // we handle navigation ourselves below.
    }

    // 4. Redirect to the Base44 login screen. This guarantees the user
    //    sees a login form rather than the app re-loading with a cached token.
    //    Use a small delay to let the server-side logout request fire first.
    setTimeout(() => {
      base44.auth.redirectToLogin(window.location.origin);
    }, 100);

    // 5. Hard fallback — if nothing navigated within 4s, force a clean reload
    setTimeout(() => {
      window.location.replace(window.location.origin);
    }, 4000);
  };

  return { handleLogout, isLoggingOut };
}