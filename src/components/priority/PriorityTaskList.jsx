import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Calendar } from "lucide-react";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Helper to get full category path
const getCategoryPath = (categoryId, categories) => {
  if (!categoryId) return null;
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;
  
  if (category.parent_id) {
    const parent = categories.find(c => c.id === category.parent_id);
    if (parent) {
      return `${parent.name} > ${category.name}`;
    }
  }
  return category.name;
};

export default function PriorityTaskList({
  tasks,
  projects,
  categories,
  teamMembers,
  statuses,
  groupBy,
  onGroupByChange,
  onTaskClick,
}) {
  // Group tasks by project, then by category or assigned
  const groupedTasks = {};
  
  tasks.forEach(task => {
    const projectId = task.project_id;
    if (!groupedTasks[projectId]) {
      groupedTasks[projectId] = {};
    }

    let subGroupKey;
    if (groupBy === 'category') {
      const categoryPath = getCategoryPath(task.category_id, categories);
      subGroupKey = categoryPath || 'No Category';
    } else {
      const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
      subGroupKey = member?.full_name || 'Unassigned';
    }

    if (!groupedTasks[projectId][subGroupKey]) {
      groupedTasks[projectId][subGroupKey] = [];
    }
    groupedTasks[projectId][subGroupKey].push(task);
  });

  const getTaskStatus = (taskStatusId) => {
    return statuses.find(s => s.id === taskStatusId);
  };

  return (
    <div className="space-y-6">
      {/* Group By Selector */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-400">Group tasks by:</label>
            <Select value={groupBy} onValueChange={onGroupByChange}>
              <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="category">Task Category</SelectItem>
                <SelectItem value="assigned">Assigned To</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects and Tasks */}
      {Object.entries(groupedTasks).map(([projectId, subGroups]) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return null;

        return (
          <Card key={projectId} className="bg-black/40 backdrop-blur-xl border-2 border-red-600/50 shadow-lg shadow-red-600/10">
            <CardHeader className="border-b border-red-900/30 p-4">
              <div className="flex items-center gap-3">
                <FolderKanban className="w-5 h-5 text-red-400" />
                <div>
                  <Link 
                    to={createPageUrl("ProjectDetail") + `?id=${project.id}`}
                    className="hover:text-red-400 transition-colors"
                  >
                    <CardTitle className="text-white text-lg hover:text-red-400 transition-colors">
                      {project.name}
                    </CardTitle>
                  </Link>
                  {project.client_name && (
                    <p className="text-sm text-gray-400">{project.client_name}</p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {Object.entries(subGroups).map(([subGroupName, subGroupTasks]) => {
                // Find color for the subgroup
                let subGroupColor = '#6B7280';
                if (groupBy === 'category') {
                  const cat = categories.find(c => getCategoryPath(c.id, categories) === subGroupName);
                  subGroupColor = cat?.color || '#6B7280';
                }

                return (
                  <div key={subGroupName}>
                    <div 
                      className="px-4 py-2 bg-gray-900/50 border-l-4 border-b"
                      style={{ 
                        borderLeftColor: subGroupColor,
                        borderBottomColor: `${subGroupColor}40`
                      }}
                    >
                      <span 
                        className="text-sm font-medium"
                        style={{ color: subGroupColor }}
                      >
                        {subGroupName} ({subGroupTasks.length})
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                          <TableHead className="text-gray-400 text-xs py-2">Task</TableHead>
                          <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Status</TableHead>
                          {groupBy === 'category' && (
                            <TableHead className="text-gray-400 text-xs py-2 hidden xl:table-cell">Assigned</TableHead>
                          )}
                          {groupBy === 'assigned' && (
                            <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Category</TableHead>
                          )}
                          <TableHead className="text-gray-400 text-xs py-2">Due Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subGroupTasks.map(task => {
                          const taskStatus = getTaskStatus(task.status_id);
                          const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                          
                          return (
                            <TableRow 
                              key={task.id}
                              onClick={() => onTaskClick(task)}
                              className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors cursor-pointer"
                            >
                              <TableCell className="font-medium text-white text-sm py-2">
                                {task.name}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell py-2">
                                {taskStatus && (
                                  <Badge 
                                    style={{ backgroundColor: taskStatus.color }}
                                    className="text-white text-xs"
                                  >
                                    {taskStatus.label}
                                  </Badge>
                                )}
                              </TableCell>
                              {groupBy === 'category' && (
                                <TableCell className="text-gray-300 text-sm hidden xl:table-cell py-2">
                                  {teamMembers.find(m => m.id === task.assigned_team_member_id)?.full_name || 'Unassigned'}
                                </TableCell>
                              )}
                              {groupBy === 'assigned' && (
                                <TableCell className="text-sm hidden lg:table-cell py-2">
                                  <span style={{ color: categories.find(c => c.id === task.category_id)?.color || '#D1D5DB' }}>
                                    {getCategoryPath(task.category_id, categories) || '-'}
                                  </span>
                                </TableCell>
                              )}
                              <TableCell className="py-2">
                                {task.due_date ? (
                                  <span className={cn("text-sm", isOverdue ? 'text-red-400 font-medium' : 'text-gray-400')}>
                                    <Calendar className="w-3 h-3 inline mr-1" />
                                    {format(new Date(task.due_date), 'MMM d')}
                                  </span>
                                ) : (
                                  <span className="text-gray-600 text-sm">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}