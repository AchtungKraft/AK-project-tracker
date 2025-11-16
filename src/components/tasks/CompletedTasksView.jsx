import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, CheckCircle2 } from "lucide-react";
import { format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import TaskDetailDrawer from "./TaskDetailDrawer";

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

export default function CompletedTasksView({ tasks, categories, teamMembers, statuses, projectId }) {
  const [groupBy, setGroupBy] = useState('date');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);

  let filteredTasks = [...tasks];

  // Apply date filter
  if (dateFilter !== 'all' && filteredTasks.length > 0) {
    const now = new Date();
    if (dateFilter === 'this_week') {
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      filteredTasks = filteredTasks.filter(t => 
        t.completed_date && isWithinInterval(new Date(t.completed_date), { start: weekStart, end: weekEnd })
      );
    } else if (dateFilter === 'last_week') {
      const lastWeekStart = startOfWeek(new Date(now.setDate(now.getDate() - 7)), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(new Date(now.setDate(now.getDate() - 7)), { weekStartsOn: 1 });
      filteredTasks = filteredTasks.filter(t => 
        t.completed_date && isWithinInterval(new Date(t.completed_date), { start: lastWeekStart, end: lastWeekEnd })
      );
    }
  }

  // Group completed tasks
  const groupedTasks = {};
  filteredTasks.forEach(task => {
    let groupKey, groupLabel, groupColor;
    
    if (groupBy === 'date') {
      if (task.completed_date) {
        const date = new Date(task.completed_date);
        groupKey = format(date, 'yyyy-MM-dd');
        groupLabel = format(date, 'EEEE, MMMM d, yyyy');
        groupColor = '#10B981';
      } else {
        groupKey = 'no-date';
        groupLabel = 'No Completion Date';
        groupColor = '#6B7280';
      }
    } else if (groupBy === 'status') {
      const status = statuses.find(s => s.id === task.status_id);
      groupKey = task.status_id || 'no-status';
      groupLabel = status?.label || 'No Status';
      groupColor = status?.color || '#6B7280';
    } else if (groupBy === 'assigned') {
      const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
      groupKey = task.assigned_team_member_id || 'unassigned';
      groupLabel = member?.full_name || 'Unassigned';
      groupColor = '#6B7280';
    } else if (groupBy === 'category') {
      const category = categories.find(c => c.id === task.category_id);
      groupKey = task.category_id || 'no-category';
      groupLabel = getCategoryPath(task.category_id, categories) || 'No Category';
      groupColor = category?.color || '#6B7280';
    }
    
    if (!groupedTasks[groupKey]) {
      groupedTasks[groupKey] = { label: groupLabel, color: groupColor, tasks: [] };
    }
    groupedTasks[groupKey].tasks.push(task);
  });

  // Sort groups by date descending when grouped by date
  const sortedGroups = Object.entries(groupedTasks).sort((a, b) => {
    if (groupBy === 'date') {
      return b[0].localeCompare(a[0]); // Descending date
    }
    return 0;
  });

  const getTaskCategory = (taskCategoryId) => {
    return getCategoryPath(taskCategoryId, categories) || '-';
  };

  const getTaskCategoryColor = (taskCategoryId) => {
    const category = categories.find(c => c.id === taskCategoryId);
    return category?.color;
  };

  const getTaskAssigned = (taskMemberId) => {
    return teamMembers.find(m => m.id === taskMemberId)?.full_name || 'Unassigned';
  };

  return (
    <>
      <Card className="bg-black/40 backdrop-blur-xl border border-green-900/30">
        <CardHeader className="border-b border-green-900/30 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              Completed Tasks ({filteredTasks.length})
            </CardTitle>
            <div className="flex gap-2">
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-32 bg-gray-900/50 border-gray-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                </SelectContent>
              </Select>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Group by Date</SelectItem>
                  <SelectItem value="status">Group by Status</SelectItem>
                  <SelectItem value="assigned">Group by Assigned</SelectItem>
                  <SelectItem value="category">Group by Category</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No completed tasks yet.
            </div>
          ) : (
            <div className="divide-y divide-green-900/10">
              {sortedGroups.map(([groupKey, groupData]) => {
                const { label: groupLabel, color: groupColor, tasks: groupTasks } = groupData;
                
                return (
                  <div key={groupKey}>
                    <div 
                      className="px-4 py-2 bg-gray-900/50 border-l-4 border-b-2"
                      style={{ 
                        borderLeftColor: groupColor,
                        borderBottomColor: groupColor
                      }}
                    >
                      <span 
                        className="text-sm font-medium"
                        style={{ color: groupColor }}
                      >
                        {groupLabel} ({groupTasks.length})
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-green-900/20 hover:bg-transparent">
                          <TableHead className="text-gray-400 text-xs py-2">Task</TableHead>
                          {groupBy !== 'category' && (
                            <TableHead className="text-gray-400 text-xs py-2 hidden lg:table-cell">Category</TableHead>
                          )}
                          {groupBy !== 'assigned' && (
                            <TableHead className="text-gray-400 text-xs py-2 hidden xl:table-cell">Assigned</TableHead>
                          )}
                          {groupBy !== 'date' && (
                            <TableHead className="text-gray-400 text-xs py-2">Completed</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupTasks.map(task => {
                          const categoryColor = getTaskCategoryColor(task.category_id);
                          
                          return (
                            <TableRow 
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              className="border-b border-green-900/10 hover:bg-green-950/20 transition-colors cursor-pointer"
                            >
                              <TableCell className="font-medium text-white text-sm py-2 line-through opacity-70">
                                {task.name}
                              </TableCell>
                              {groupBy !== 'category' && (
                                <TableCell className="text-sm hidden lg:table-cell py-2">
                                  <span style={{ color: categoryColor || '#D1D5DB' }}>
                                    {getTaskCategory(task.category_id)}
                                  </span>
                                </TableCell>
                              )}
                              {groupBy !== 'assigned' && (
                                <TableCell className="text-gray-300 text-sm hidden xl:table-cell py-2">
                                  {getTaskAssigned(task.assigned_team_member_id)}
                                </TableCell>
                              )}
                              {groupBy !== 'date' && (
                                <TableCell className="py-2">
                                  {task.completed_date ? (
                                    <span className="text-sm text-green-400">
                                      <Calendar className="w-3 h-3 inline mr-1" />
                                      {format(new Date(task.completed_date), 'MMM d')}
                                    </span>
                                  ) : (
                                    <span className="text-gray-600 text-sm">-</span>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectId={projectId}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}