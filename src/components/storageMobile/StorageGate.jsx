import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

/** Storage Mobile requires login. Logged-out visitors go to login and come back to this exact page. */
export default function StorageGate({ children }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    base44.auth.isAuthenticated().then((authed) => {
      if (!alive) return;
      if (authed) setOk(true);
      else base44.auth.redirectToLogin(window.location.href);
    });
    return () => { alive = false; };
  }, []);
  if (!ok) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Opening Storage…
      </div>
    );
  }
  return children;
}