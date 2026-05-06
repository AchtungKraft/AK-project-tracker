import React from "react";
import ProcedureEntryTimeline from "./ProcedureEntryTimeline";

/**
 * ExecutionTimeline — renders procedure entries in execution mode.
 * Surfaces critical/pinned entries first, hides archived entries.
 * Used inside TaskKnowledgeSection for shop-floor execution.
 */
export default function ExecutionTimeline({ procedureId }) {
  return <ProcedureEntryTimeline procedureId={procedureId} compact executionMode />;
}