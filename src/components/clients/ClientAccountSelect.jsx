import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientAccounts, useIsAdmin } from "@/lib/clientAccounts";

const NONE = "__none__";

// Optional parent client account picker. Only rendered for admins.
export default function ClientAccountSelect({ value, onChange, className }) {
  const isAdmin = useIsAdmin();
  const { data: accounts = [] } = useClientAccounts();
  if (!isAdmin) return null;

  return (
    <div>
      <Label>Parent Client Account</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger className={className || "bg-gray-800 border-gray-700 text-white"}>
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Unassigned</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}{a.status === "inactive" ? " (inactive)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}