import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ScopeReviewPrintView from "@/components/scope/ScopeReviewPrintView";
import ScopeListPrintView from "@/components/scope/ScopeListPrintView";
import { toPrintModel } from "@/components/scope/clientReportAdapter";

/**
 * Client-safe Scope Review report for the Client Portal.
 * /clientscopereport#ticket=…  — the ticket is a 15-minute report authorization issued by
 * clientScopeReview (action: create_report_link). It sits in the URL fragment so it is never sent
 * to servers or Referer headers, and is removed from the address bar once read. No reusable client
 * credential is accepted here. Rendering reuses the existing report generators (browser Print / Save as PDF).
 */
let cachedTicket = null; // read once: effects can run twice in development
const readTicket = () => {
  const ticket = new URLSearchParams(window.location.hash.slice(1)).get("ticket");
  if (ticket) { cachedTicket = ticket; window.history.replaceState(null, "", window.location.pathname); }
  return cachedTicket;
};

export default function ClientScopeReport() {
  const [portalEl, setPortalEl] = useState(null);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    const el = document.createElement("div");
    el.id = "scope-print-portal";
    document.body.appendChild(el);
    setPortalEl(el);
    return () => document.body.removeChild(el);
  }, []);

  useEffect(() => {
    const ticket = readTicket();
    if (!ticket) { setState({ error: "This report link is incomplete. Open the report again from the Client Portal." }); return; }
    base44.functions.invoke("clientScopeReview", { ticket })
      .then(res => setState({ model: toPrintModel(res.data), report: res.data.report_type, scope: res.data.scope }))
      .catch(err => setState({ error: err?.response?.data?.error?.message || "This report is unavailable." }));
  }, []);

  if (!portalEl) return null;
  if (state.error || state.loading) {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, background: "white", display: "flex", alignItems: "center", justifyContent: "center", color: "#374151", fontFamily: "system-ui", padding: 24, textAlign: "center" }}>
        {state.error ? state.error : <Loader2 className="w-8 h-8 animate-spin text-gray-400" />}
      </div>, portalEl);
  }

  const { model, report, scope } = state;
  const close = () => window.close();
  return createPortal(
    report === "financial_summary"
      ? <ScopeListPrintView {...model} initialFilter={scope === "approved" ? "approved" : "all"} onClose={close} />
      : <ScopeReviewPrintView {...model} onClose={close} />,
    portalEl);
}