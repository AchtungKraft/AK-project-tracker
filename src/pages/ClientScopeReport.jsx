import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ScopeReviewPrintView from "@/components/scope/ScopeReviewPrintView";
import ScopeListPrintView from "@/components/scope/ScopeListPrintView";
import { toPrintModel } from "@/components/scope/clientReportAdapter";

/**
 * Client-safe Scope Review report for the Client Portal.
 * /clientscopereport?requestId=…&token=…|slug=…&report=detailed|financial_summary&scope=all|approved|pending|selected&items=id,id
 * Data comes only from clientScopeReview (server validates access and filters fields and items);
 * rendering reuses the existing report generators, which open the browser's Print / Save as PDF.
 */
export default function ClientScopeReport() {
  const p = new URLSearchParams(window.location.search);
  const report = p.get("report") === "financial_summary" ? "financial_summary" : "detailed";
  const scope = p.get("scope") || "all";
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
    const payload = { requestId: p.get("requestId"), token: p.get("token") || undefined, slug: p.get("slug") || undefined, scope, report_type: report,
      item_ids: scope === "selected" ? (p.get("items") || "").split(",").filter(Boolean) : undefined };
    base44.functions.invoke("clientScopeReview", payload)
      .then(res => setState({ model: toPrintModel(res.data) }))
      .catch(err => setState({ error: err?.response?.data?.error?.message || "This report is unavailable." }));
  }, []);

  if (!portalEl) return null;
  if (state.error || state.loading) {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, background: "white", display: "flex", alignItems: "center", justifyContent: "center", color: "#374151", fontFamily: "system-ui" }}>
        {state.error ? state.error : <Loader2 className="w-8 h-8 animate-spin text-gray-400" />}
      </div>, portalEl);
  }

  const { model } = state;
  const close = () => window.close();
  return createPortal(
    report === "financial_summary"
      ? <ScopeListPrintView {...model} initialFilter={scope === "approved" ? "approved" : "all"} onClose={close} />
      : <ScopeReviewPrintView {...model} onClose={close} />,
    portalEl);
}