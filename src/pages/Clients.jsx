import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Building, Search } from "lucide-react";
import { useClientAccounts, useIsAdmin } from "@/lib/clientAccounts";
import ClientAccountFormModal from "@/components/clients/ClientAccountFormModal";

export default function Clients() {
  const isAdmin = useIsAdmin();
  const { data: accounts = [], isLoading } = useClientAccounts();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const q = search.trim().toLowerCase();
  const visible = q ? accounts.filter((a) => a.name?.toLowerCase().includes(q)) : accounts;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Clients</h1>
        {isAdmin && (
          <Button onClick={() => setShowNew(true)} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-1" /> New Client
          </Button>
        )}
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients" className="pl-9 bg-gray-800 border-gray-700 text-white" />
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : visible.length === 0 ? (
        <p className="text-center text-gray-400 py-12">{accounts.length ? "No matching clients." : "No client accounts yet."}</p>
      ) : (
        <div className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-900/60">
          {visible.map((a) => (
            <Link key={a.id} to={`/clientaccount?id=${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/60">
              <Building className="w-4 h-4 text-blue-400" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{a.name}</p>
                {(a.primary_contact_name || a.email) && <p className="text-xs text-gray-400 truncate">{[a.primary_contact_name, a.email].filter(Boolean).join(" · ")}</p>}
              </div>
              {a.status === "inactive" && <Badge variant="outline" className="text-gray-400">Inactive</Badge>}
            </Link>
          ))}
        </div>
      )}
      {showNew && <ClientAccountFormModal onClose={() => setShowNew(false)} />}
    </div>
  );
}