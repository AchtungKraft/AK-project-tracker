import React from "react";
import { money } from "./finFormat";

// Shows a line's cost honestly: actual, estimate only, legitimate zero, or not recorded.
export default function CostStateLabel({ state, actual, estimate }) {
  if (state === "actual") return <span>{money(actual)} <span className="text-green-500">actual</span></span>;
  if (state === "actual_zero") return <span>{money(0)} <span className="text-green-500">actual</span></span>;
  if (state === "zero_client_supplied") return <span className="text-gray-400">$0 client-supplied</span>;
  if (state === "zero_no_charge") return <span className="text-gray-500">No charge</span>;
  if (state === "estimated_only") return <span>{money(estimate)} <span className="text-gray-500">est. only</span></span>;
  return <span className="text-amber-400">Not recorded</span>;
}