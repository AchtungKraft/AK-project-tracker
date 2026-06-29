import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

function ProjectRow({ project, status, serviceNames, commitmentCount, isTerminal }) {
  return (
    <Link
      to={`/projectdetail?id=${project.id}`}
      className={cn(
        "flex items-start gap-2 p-2 rounded-lg transition-colors group",
        isTerminal ? "bg-gray-800/30 hover:bg-gray-800/50" : "bg-gray-800/60 hover:bg-gray-800/80"
      )}
    >
      <FolderKanban className={cn("w-4 h-4 mt-0.5 shrink-0", isTerminal ? "text-gray-600" : "text-red-400/70")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "text-sm font-medium truncate group-hover:text-red-400 transition-colors",
            isTerminal ? "text-gray-500" : "text-white"
          )}>
            {project.name}
          </span>
          {status && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0"
              style={{ borderColor: status.color, color: status.color }}
            >
              {status.label}
            </Badge>
          )}
        </div>
        {project.client_name && (
          <p className="text-xs text-gray-500">{project.client_name}</p>
        )}
        {serviceNames.length > 0 && (
          <p className="text-xs text-gray-600 mt-0.5">
            {serviceNames.join(", ")} · {commitmentCount} commitment{commitmentCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 shrink-0 mt-0.5" />
    </Link>
  );
}

export default function VendorProjectList({ associatedProjects }) {
  if (associatedProjects.length === 0) {
    return <p className="text-sm text-gray-500 italic py-2">No projects reference this service vendor.</p>;
  }

  const active = associatedProjects.filter(p => !p.isTerminal);
  const historical = associatedProjects.filter(p => p.isTerminal);

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">Active</span>
            <span className="text-[10px] text-gray-600">{active.length}</span>
          </div>
          <div className="space-y-1.5">
            {active.map(p => <ProjectRow key={p.project.id} {...p} />)}
          </div>
        </div>
      )}
      {historical.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Historical</span>
            <span className="text-[10px] text-gray-600">{historical.length}</span>
          </div>
          <div className="space-y-1.5">
            {historical.map(p => <ProjectRow key={p.project.id} {...p} />)}
          </div>
        </div>
      )}
    </div>
  );
}