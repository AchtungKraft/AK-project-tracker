import { base44 } from "@/api/base44Client";

const FN = "applyProjectCreditToCommitments";

export const settlementKeys = {
  history: (projectId) => ["partsSettlementHistory", projectId],
};

export const errorMessage = (error) => error?.response?.data?.error || error?.message || "Request failed";
export const errorCode = (error) => error?.response?.data?.code || null;

export async function previewSettlement(projectId, commitmentIds) {
  const res = await base44.functions.invoke(FN, { project_id: projectId, commitment_ids: commitmentIds, mode: "auto", dry_run: true });
  return res.data;
}

export async function executeSettlement(projectId, commitmentIds, requestKey) {
  const res = await base44.functions.invoke(FN, { project_id: projectId, commitment_ids: commitmentIds, mode: "auto", dry_run: false, request_key: requestKey });
  return res.data;
}

export async function loadSettlementHistory(projectId) {
  const res = await base44.functions.invoke(FN, { action: "history", project_id: projectId });
  return res.data;
}

export async function finishSettlements(projectId) {
  const res = await base44.functions.invoke(FN, { action: "reconcile", project_id: projectId });
  return res.data;
}

export async function reverseSettlement({ projectId, allocationId, amount, reason, requestKey }) {
  const res = await base44.functions.invoke(FN, { action: "reverse", project_id: projectId, allocation_id: allocationId, amount, reason, request_key: requestKey });
  return res.data;
}