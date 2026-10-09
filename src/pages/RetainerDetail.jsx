import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useIsAdmin } from "@/lib/clientAccounts";
import RetainerSetupCard from "@/components/retainer/RetainerSetupCard";
import RetainerSummary from "@/components/retainer/RetainerSummary";
import RetainerRatesSection from "@/components/retainer/RetainerRatesSection";
import RetainerLedgerSection from "@/components/retainer/RetainerLedgerSection";
import RetainerReviewsSection from "@/components/retainer/RetainerReviewsSection";

export default function RetainerDetail() {
  const clientId = new URLSearchParams(window.location.search).get("client");
  const isAdmin = useIsAdmin();

  const { data: account, isLoading: l1 } = useQuery({
    queryKey: ["clientAccount", clientId],
    queryFn: async () => (await base44.entities.ClientAccount.filter({ id: clientId }, { limit: 1 })).items[0] || null,
    enabled: !!clientId,
  });
  const { data: retainer, isLoading: l2 } = useQuery({
    queryKey: ["retainer", clientId],
    queryFn: async () => (await base44.entities.RetainerAccount.filter({ client_account_id: clientId }, { limit: 1 })).items[0] || null,
    enabled: !!clientId && isAdmin,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["clientAccountProjects", clientId, "names"],
    queryFn: async () => (await base44.entities.Project.filter({ client_account_id: clientId }, { sort: "name", limit: 200, fields: ["name"] })).items,
    enabled: !!clientId && isAdmin,
  });

  if (!isAdmin) return <div className="p-6 text-gray-400">Retainers are visible to admins only.</div>;
  if (l1 || l2) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!account) return <div className="p-6 text-gray-400">Client account not found. <Link to="/clients" className="text-blue-400">Back to Clients</Link></div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <Link to={`/clientaccount?id=${clientId}`} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> {account.name}</Link>
      <h1 className="text-2xl font-bold text-white">D&amp;D Retainer — {account.name}</h1>
      {!retainer ? (
        <RetainerSetupCard clientId={clientId} projects={projects} />
      ) : (
        <>
          <RetainerSummary retainer={retainer} projects={projects} />
          <RetainerRatesSection retainer={retainer} />
          <RetainerReviewsSection retainer={retainer} />
          <RetainerLedgerSection retainer={retainer} />
        </>
      )}
    </div>
  );
}