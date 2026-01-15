import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calendar, User, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function ProjectListView({ 
  groupedProjects, 
  statuses, 
  projectTypes, 
  teamMembers,
  groupBy,
  onEdit 
}) {
  // Sort groups
  const sortedGroups = Object.entries(groupedProjects).sort((a, b) => {
    if (groupBy === 'projectType') {
      const typeA = projectTypes.find(t => t.name === a[0]);
      const typeB = projectTypes.find(t => t.name === b[0]);
      return (typeA?.sort_order || 0) - (typeB?.sort_order || 0);
    } else if (groupBy === 'status') {
      const statusA = statuses.find(s => s.label === a[0]);
      const statusB = statuses.find(s => s.label === b[0]);
      return (statusA?.sort_order || 0) - (statusB?.sort_order || 0);
    }
    return a[0].localeCompare(b[0]);
  });

  return (
    <div className="space-y-6">
      {sortedGroups.map(([groupLabel, groupData]) => {
        const { projects: groupProjects, color: groupColor } = groupData;
        
        return (
          <div key={groupLabel}>
            <div className="mb-3 pb-2 border-b-2 border-l-4 pl-3" style={{ borderColor: groupColor }}>
              <h2 className="text-lg font-bold" style={{ color: groupColor }}>
                {groupLabel} ({groupProjects.length})
              </h2>
            </div>
            <div className="space-y-2">
              {groupProjects.map(project => {
                const status = statuses.find(s => s.id === project.status_id);
                const projectType = projectTypes.find(t => t.id === project.project_type_id);
                const assignedMembers = teamMembers.filter(tm => 
                  project.assigned_team?.includes(tm.id)
                );
                
                return (
                  <Link
                    key={project.id}
                    to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                    className="block"
                  >
                    <div className="bg-black/40 backdrop-blur-sm border border-gray-800 hover:border-red-900/50 rounded-lg p-3 transition-all hover:bg-black/60">
                      <div className="flex gap-3">
                        {/* Thumbnail */}
                        <div className="w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-gray-800">
                          {project.featured_image_url || project.images?.[0] ? (
                            <img 
                              src={project.featured_image_url || project.images[0]} 
                              alt={project.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Car className="w-8 h-8 text-gray-600" />
                            </div>
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-white truncate">
                                {project.name}
                              </h3>
                              {project.client_name && (
                                <p className="text-sm text-gray-400 truncate">
                                  <User className="w-3 h-3 inline mr-1" />
                                  {project.client_name}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {status && (
                                <Badge 
                                  className="text-xs"
                                  style={{ 
                                    backgroundColor: `${status.color}20`, 
                                    color: status.color,
                                    borderColor: status.color 
                                  }}
                                >
                                  {status.label}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            {projectType && (
                              <span className="flex items-center gap-1">
                                <span 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: projectType.color }}
                                />
                                {projectType.name}
                              </span>
                            )}
                            {project.vin && (
                              <span className="text-gray-600">
                                VIN: {project.vin}
                              </span>
                            )}
                            {project.target_completion && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Due: {format(new Date(project.target_completion), 'MMM d, yyyy')}
                              </span>
                            )}
                            {assignedMembers.length > 0 && (
                              <span className="text-gray-500">
                                Team: {assignedMembers.map(m => m.full_name).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}