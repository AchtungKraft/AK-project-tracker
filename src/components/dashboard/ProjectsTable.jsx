
import React, { useState } from 'react';
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsTable({ projects, statuses, isLoading }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.vin?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status_id === statusFilter;
    const matchesType = typeFilter === 'all' || p.project_type_id === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const groupedProjects = {};
  filteredProjects.forEach(project => {
    const status = statuses.find(s => s.id === project.status_id);
    const statusLabel = status?.label || 'No Status';
    if (!groupedProjects[statusLabel]) {
      groupedProjects[statusLabel] = [];
    }
    groupedProjects[statusLabel].push(project);
  });

  const getTeamNames = (teamIds) => {
    if (!teamIds || teamIds.length === 0) return '-';
    return teamIds.map(id => {
      const member = teamMembers.find(m => m.id === id);
      return member?.full_name?.split(' ')[0] || 'Unknown';
    }).join(', ');
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <CardTitle className="text-xl font-bold text-white">All Projects</CardTitle>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40 bg-gray-900/50 border-gray-700 text-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {projectStatuses.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40 bg-gray-900/50 border-gray-700 text-white">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {projectTypes.filter(t => t.active).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array(5).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full bg-gray-800" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {Object.keys(groupedProjects).length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No projects found
              </div>
            ) : (
              Object.entries(groupedProjects).map(([statusLabel, statusProjects]) => {
                const status = statuses.find(s => s.label === statusLabel);
                return (
                  <div key={statusLabel}>
                    <div className="px-6 py-3 bg-gray-900/50 border-b border-red-900/20">
                      <Badge 
                        style={{ backgroundColor: status?.color || '#EF4444' }}
                        className="text-white"
                      >
                        {statusLabel} ({statusProjects.length})
                      </Badge>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                          <TableHead className="text-gray-400">Project</TableHead>
                          <TableHead className="text-gray-400">Client</TableHead>
                          <TableHead className="text-gray-400 hidden md:table-cell">Type</TableHead>
                          <TableHead className="text-gray-400 hidden lg:table-cell">Progress</TableHead>
                          <TableHead className="text-gray-400 hidden xl:table-cell">Due</TableHead>
                          <TableHead className="text-gray-400 hidden xl:table-cell">Team</TableHead>
                          <TableHead className="text-gray-400"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statusProjects.map(project => {
                          const projectType = projectTypes.find(t => t.id === project.project_type_id);
                          const isOverdue = project.target_completion && 
                                          new Date(project.target_completion) < new Date() &&
                                          status?.label?.toLowerCase() !== 'completed';
                          
                          return (
                            <TableRow 
                              key={project.id}
                              className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors"
                            >
                              <TableCell className="font-medium text-white">
                                <div>
                                  <div>{project.name}</div>
                                  {project.vin && (
                                    <div className="text-xs text-gray-500 mt-1">VIN: {project.vin}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-gray-300">{project.client_name || '-'}</TableCell>
                              <TableCell className="text-gray-300 hidden md:table-cell">
                                {projectType?.name || '-'}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="flex items-center gap-2">
                                  <Progress 
                                    value={project.progress_percent || 0} 
                                    className="h-2 w-20 bg-gray-800"
                                  />
                                  <span className="text-sm text-gray-400">
                                    {project.progress_percent || 0}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden xl:table-cell">
                                {project.target_completion ? (
                                  <span className={isOverdue ? 'text-red-400 font-medium' : 'text-gray-400'}>
                                    {format(new Date(project.target_completion), 'MMM d, yyyy')}
                                  </span>
                                ) : '-'}
                              </TableCell>
                              <TableCell className="text-gray-400 text-sm hidden xl:table-cell">
                                {getTeamNames(project.assigned_team)}
                              </TableCell>
                              <TableCell>
                                <Link to={createPageUrl(`ProjectDetail?id=${project.id}`)}>
                                  <ExternalLink className="w-4 h-4 text-red-400 hover:text-red-300" />
                                </Link>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
