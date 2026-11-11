import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ShopReviewPrintView from "./ShopReviewPrintView";

/** Fetches the technician-safe projection and renders the print view outside #root. */
export default function ShopReviewPrintLoader({ requestId, onClose }) {
  const [portalEl, setPortalEl] = useState(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.id = "shop-print-portal";
    document.body.appendChild(el);
    setPortalEl(el);
    return () => { document.body.removeChild(el); setPortalEl(null); };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["shopReviewPrintData", requestId],
    queryFn: async () => (await base44.functions.invoke("getShopReviewPrintData", { request_id: requestId })).data,
    enabled: !!requestId,
    retry: false,
  });

  if (!portalEl) return null;
  const screen = (content) => createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "white", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", color: "#111" }}>{content}</div>,
    portalEl
  );

  if (error) return screen(<>
    <p>{error?.response?.data?.error || "Could not load the shop review."}</p>
    <button onClick={onClose} style={{ padding: "6px 14px", border: "1px solid #999", borderRadius: 5 }}>Close</button>
  </>);
  if (isLoading || !data) return screen(<Loader2 className="w-8 h-8 animate-spin text-gray-400" />);

  return createPortal(<ShopReviewPrintView data={data} onClose={onClose} />, portalEl);
}