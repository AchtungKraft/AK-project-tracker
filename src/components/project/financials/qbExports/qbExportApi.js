import { base44 } from "@/api/base44Client";

export async function qbExportAction(payload) {
  const res = await base44.functions.invoke("exportProjectInvoicesToQuickBooks", payload).catch((e) => e.response || { data: { error: e.message } });
  return res.data || { error: "No response" };
}

export function saveCsv({ content, file_name, mime_type }) {
  const url = URL.createObjectURL(new Blob([content], { type: mime_type || "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file_name;
  a.click();
  URL.revokeObjectURL(url);
}