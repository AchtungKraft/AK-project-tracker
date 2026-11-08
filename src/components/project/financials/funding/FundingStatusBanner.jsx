import React from "react";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { cents } from "./fundingFormat";

const TONE = {
  not_set: "border-gray-700 bg-gray-900/60 text-gray-300",
  need_funding: "border-amber-700/60 bg-amber-950/30 text-amber-200",
  funded: "border-emerald-700/60 bg-emerald-950/30 text-emerald-200",
};

export default function FundingStatusBanner({ status }) {
  const { state, target, received, short, pending } = status;
  const Icon = state === "funded" ? CheckCircle2 : state === "need_funding" ? AlertTriangle : CircleDashed;
  const pendingText = [pending.drafted && `${pending.drafted} deposit invoice draft(s) not sent`, pending.sent_unpaid && `${pending.sent_unpaid} deposit invoice(s) sent, unpaid`].filter(Boolean).join(" · ");
  return (
    <div className={`rounded-md border px-3 py-2 flex items-start gap-2 ${TONE[state]}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="min-w-0 text-xs">
        <div className="text-sm font-semibold">
          {state === "not_set" && "Funding target not set"}
          {state === "need_funding" && `Need funding before ordering · ${cents(short)} short`}
          {state === "funded" && "Funded to target · OK to order"}
        </div>
        <div className="opacity-80">
          {state === "not_set"
            ? "Set a \"funding required before ordering\" target in the funding plan below. Until then no funding status is shown."
            : `Target ${cents(target)} vs deposit payments received ${cents(received)}. Planned milestones and credits are not counted.`}
          {pendingText && ` ${pendingText}.`}
        </div>
      </div>
    </div>
  );
}