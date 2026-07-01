import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { queryClientInstance } from "@/lib/query-client";

export function useLogout() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      // Clear React Query cache
      queryClientInstance.clear();

      // Clear app-specific localStorage keys
      localStorage.removeItem("achtung_view_as_company");

      // Call Base44 SDK logout — handles token cleanup and redirects to login
      await base44.auth.logout(window.location.origin);
    } catch (error) {
      console.error("Logout failed:", error);
      setIsLoggingOut(false);
      // Force reload as fallback to clear all state
      window.location.reload();
    }
  };

  return { handleLogout, isLoggingOut };
}