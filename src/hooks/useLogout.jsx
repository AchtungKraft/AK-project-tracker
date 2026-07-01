import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { queryClientInstance } from "@/lib/query-client";

export function useLogout() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    // Clear React Query cache before navigating away
    queryClientInstance.clear();

    // Clear app-specific localStorage keys
    localStorage.removeItem("achtung_view_as_company");

    // base44.auth.logout is a synchronous redirect — navigates to server logout
    // endpoint which clears HTTP-only cookies then redirects to the given URL.
    // If navigation doesn't happen within 3s, force reload as fallback.
    const fallbackTimer = setTimeout(() => {
      window.location.replace(window.location.origin);
    }, 3000);

    base44.auth.logout(window.location.origin);

    // Clear timeout if component unmounts during navigation
    return () => clearTimeout(fallbackTimer);
  };

  return { handleLogout, isLoggingOut };
}