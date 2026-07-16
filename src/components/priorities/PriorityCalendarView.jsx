import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar, FolderKanban, User, Tag, AlertCircle, Flame } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, isBefore } from "date-fns";
import { createPageUrl } from "@/utils";
import { parseLocalDate } from "@/lib/dateUtils";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import TaskCard from "../project/TaskCard";
import { toast } from "sonner";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";
import { sortTasksByPriority, isUrgentPriority } from "@/utils/taskPrioritySort";

export default function PriorityCalendarView({
  tasks,
  allTasks = [],
  projects,
  categories,
  teamMembers,
  statuses,
  onTaskClick,
  updateTaskMutation,
  primaryGroupBy,
  secondaryGroupBy,
  commentCountByTaskId = {},
  selectedTypes = [],
  statusFilter = 'all',
  // New props from parent using useTaskData
  onToggleComplete: parentToggleComplete,
  onUpdateDueDate: parentUpdateDueDate,
  onUpdateStartDate: parentUpdateStartDate,
  onTogglePriority: parentTogglePriority,
}) {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weeksToShow, setWeeksToShow] = useState(isMobile ? 4 : 4);
  const [calendarPrimaryGroup, setCalendarPrimaryGroup] = useState(primaryGroupBy || 'project');
  const [calendarSecondaryGroup, setCalendarSecondaryGroup] = useState(secondaryGroupBy || 'assigned');

  // Generate week ranges
  const weekRanges = useMemo(() => {
    const ranges = [];
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
    
    for (let i = 0; i < weeksToShow; i++) {
      const weekStart = addWeeks(startDate, i);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      ranges.push({ start: weekStart, end: weekEnd, label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}` });
    }
    return ranges;
  }, [currentDate, weeksToShow]);

  // Separate tasks: past due, with due date (future), without due date
  // Use start_date first, fall back to due_date for calendar placement
  const { tasksPastDue, tasksWithDueDate, tasksWithoutDueDate } = useMemo(() => {
    const pastDue = [];
    const withDate = [];
    const withoutDate = [];
    const today = startOfWeek(new Date(), { weekStartsOn: 1 });
    
    tasks.forEach(task => {
      // Use start_date first, fall back to due_date
      const dateToUse = task.start_date || task.due_date;
      const taskDate = parseLocalDate(dateToUse);
      
      if (taskDate) {
        if (isBefore(taskDate, today)) {
          pastDue.push({ ...task, _calendarDate: dateToUse });
        } else {
          withDate.push({ ...task, _calendarDate: dateToUse });
        }
      } else {
        withoutDate.push(task);
      }
    });
    
    return { tasksPastDue: pastDue, tasksWithDueDate: withDate, tasksWithoutDueDate: withoutDate };
  }, [tasks]);

  // Group tasks by week - use _calendarDate which is start_date || due_date
  const tasksByWeek = useMemo(() => {
    const grouped = {};
    
    weekRanges.forEach((range, index) => {
      grouped[index] = tasksWithDueDate.filter(task => {
        const taskDate = parseLocalDate(task._calendarDate);
        return taskDate && isWithinInterval(taskDate, { start: range.start, end: range.end });
      });
    });
    
    return grouped;
  }, [tasksWithDueDate, weekRanges]);

  // Get non-priority tasks with due dates or start dates in the visible range
  // IMPORTANT: Apply Project Type and Status filters to match Dashboard behavior
  const dueButNotPriorityTasks = useMemo(() => {
    if (!allTasks || allTasks.length === 0) return [];
    
    const priorityTaskIds = new Set(tasks.map(t => t.id));
    const completedStatus = statuses.find(s => {
      const label = s.label?.toLowerCase() || '';
      return s.scope === 'Task' && (label.includes('complete') || label.includes('done'));
    });
    
    // Get start and end of visible range
    const rangeStart = weekRanges[0]?.start;
    const rangeEnd = weekRanges[weekRanges.length - 1]?.end;
    
    if (!rangeStart || !rangeEnd) return [];
    
    return allTasks.filter(task => {
      // Skip if already a priority task
      if (priorityTaskIds.has(task.id)) return false;
      // Skip if completed
      if (task.status_id === completedStatus?.id) return false;
      
      // Apply Project Type filter (same logic as Dashboard)
      const project = projects.find(p => p.id === task.project_id);
      if (selectedTypes.length > 0 && project && !selectedTypes.includes(project.project_type_id)) return false;
      
      // Apply Project Status filter (same logic as Dashboard)
      if (statusFilter !== 'all' && project && project.status_id !== statusFilter) return false;
      
      // Check if start_date is in range
      if (task.start_date) {
        const startDate = parseLocalDate(task.start_date);
        if (startDate && isWithinInterval(startDate, { start: rangeStart, end: rangeEnd })) {
          return true;
        }
      }
      
      // Check if due_date is in range (only if no start_date matched)
      if (task.due_date) {
        const dueDate = parseLocalDate(task.due_date);
        if (dueDate && isWithinInterval(dueDate, { start: rangeStart, end: rangeEnd })) {
          return true;
        }
      }
      
      return false;
    });
  }, [allTasks, tasks, weekRanges, statuses, projects, selectedTypes, statusFilter]);

  // Helper to get grouping info
  const getGroupInfo = (task, groupBy) => {
    if (groupBy === 'project') {
      const project = projects.find(p => p.id === task.project_id);
      return { key: task.project_id, label: project?.name || 'No Project', color: '#EF4444', icon: FolderKanban };
    } else if (groupBy === 'assigned') {
      const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
      return { key: task.assigned_team_member_id || 'unassigned', label: member?.full_name || 'Unassigned', color: '#6B7280', icon: User };
    } else if (groupBy === 'category') {
      const category = categories.find(c => c.id === task.category_id);
      return { key: task.category_id || 'no-category', label: category?.name || 'No Category', color: category?.color || '#6B7280', icon: Tag };
    }
    return { key: 'unknown', label: 'Unknown', color: '#6B7280', icon: Tag };
  };

  // Group tasks within a week by primary and secondary grouping
  const groupTasksForWeek = (weekTasks) => {
    const primaryGroups = {};
    
    weekTasks.forEach(task => {
      const primary = getGroupInfo(task, calendarPrimaryGroup);
      
      if (!primaryGroups[primary.key]) {
        primaryGroups[primary.key] = {
          ...primary,
          secondaryGroups: {},
        };
      }
      
      const secondary = getGroupInfo(task, calendarSecondaryGroup);
      
      if (!primaryGroups[primary.key].secondaryGroups[secondary.key]) {
        primaryGroups[primary.key].secondaryGroups[secondary.key] = {
          ...secondary,
          tasks: [],
        };
      }
      
      primaryGroups[primary.key].secondaryGroups[secondary.key].tasks.push(task);
    });
    
    return primaryGroups;
  };

  // CANONICAL: Use parent handler only — no local fallback for completion
  // All completion MUST route through beginTaskCompletion via the provider
  const handleToggleComplete = parentToggleComplete || (() => {
    console.warn('[TASK CONTRACT] PriorityCalendarView: No onToggleComplete handler provided. Completion blocked.');
  });

  const handleUpdateDueDate = parentUpdateDueDate || (async (task, dueDate) => {
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { due_date: dueDate }
    });
    toast.success(dueDate ? 'Due date updated' : 'Due date removed');
  });

  const handleUpdateStartDate = parentUpdateStartDate || (async (task, startDate) => {
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { start_date: startDate }
    });
    toast.success(startDate ? 'Start date updated' : 'Start date removed');
  });

  const handleTogglePriority = parentTogglePriority || (async (task, skipConfirm = false) => {
    // If removing priority and not skipping confirm, return flag (handled by TaskCard)
    if (task.is_priority && !skipConfirm) {
      return { needsConfirmation: true, task };
    }
    
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { is_priority: !task.is_priority }
    });
    toast.success(task.is_priority ? 'Removed from priority' : 'Marked as priority');
    return { needsConfirmation: false };
  });

  const navigateWeeks = (direction) => {
    if (direction === 'prev') {
      setCurrentDate(subWeeks(currentDate, weeksToShow));
    } else {
      setCurrentDate(addWeeks(currentDate, weeksToShow));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const renderGroupedTasks = (groupedTasks) => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(groupedTasks).map(([primaryKey, primaryGroup]) => {
          const PrimaryIcon = primaryGroup.icon;
          const project = calendarPrimaryGroup === 'project' ? projects.find(p => p.id === primaryKey) : null;
          const totalTasks = Object.values(primaryGroup.secondaryGroups).reduce((sum, sg) => sum + sg.tasks.length, 0);
          
          return (
            <Card 
              key={primaryKey} 
              className="bg-black/40 backdrop-blur-xl border-2 shadow-lg"
              style={{ 
                borderColor: `${primaryGroup.color}80`,
                boxShadow: `0 10px 15px -3px ${primaryGroup.color}20`
              }}
            >
              <CardHeader 
                className="border-b p-3"
                style={{ borderBottomColor: `${primaryGroup.color}50` }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <PrimaryIcon className="w-4 h-4" style={{ color: primaryGroup.color }} />
                    <div>
                      {calendarPrimaryGroup === 'project' && project ? (
                        <Link 
                          to={buildProjectDetailUrl(project.id, { source: SOURCES.CALENDAR })}
                          className="text-sm font-semibold hover:underline"
                          style={{ color: primaryGroup.color }}
                        >
                          {primaryGroup.label}
                        </Link>
                      ) : (
                        <CardTitle className="text-sm" style={{ color: primaryGroup.color }}>
                          {primaryGroup.label}
                        </CardTitle>
                      )}
                      {calendarPrimaryGroup === 'project' && project?.client_name && (
                        <p className="text-xs text-gray-400">{project.client_name}</p>
                      )}
                    </div>
                  </div>
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                    style={{ borderColor: primaryGroup.color, color: primaryGroup.color, backgroundColor: `${primaryGroup.color}15` }}
                  >
                    {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                {Object.entries(primaryGroup.secondaryGroups).map(([secondaryKey, secondaryGroup]) => (
                  <div 
                    key={secondaryKey} 
                    className="bg-black/40 rounded-lg border-2 overflow-hidden"
                    style={{ borderColor: secondaryGroup.color }}
                  >
                    <div 
                      className="p-2 border-b-2"
                      style={{ 
                        borderBottomColor: secondaryGroup.color,
                        backgroundColor: `${secondaryGroup.color}15`
                      }}
                    >
                      <h3 
                        className="font-semibold text-xs"
                        style={{ color: secondaryGroup.color }}
                      >
                        {secondaryGroup.label}
                      </h3>
                      <span className="text-xs text-gray-400">
                        {secondaryGroup.tasks.length} {secondaryGroup.tasks.length === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                    <div className="p-2 space-y-2">
                      {secondaryGroup.tasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          categories={categories}
                          teamMembers={teamMembers}
                          statuses={statuses}
                          onToggleComplete={handleToggleComplete}
                          onClick={() => onTaskClick(task)}
                          onUpdateDueDate={handleUpdateDueDate}
                          onUpdateStartDate={handleUpdateStartDate}
                          onTogglePriority={handleTogglePriority}
                          commentCount={commentCountByTaskId[task.id] || 0}
                          compact={isMobile}
                          showInlineControls={true}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Calendar Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-black/40 rounded-lg p-3 border border-gray-800">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigateWeeks('prev')}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={goToToday}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <Calendar className="w-4 h-4 mr-1" />
            Today
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigateWeeks('next')}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(weeksToShow)} onValueChange={(v) => setWeeksToShow(Number(v))}>
            <SelectTrigger className="w-28 bg-gray-900/50 border-gray-700 text-white h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Weeks</SelectItem>
              <SelectItem value="4">4 Weeks</SelectItem>
              <SelectItem value="6">6 Weeks</SelectItem>
              <SelectItem value="8">8 Weeks</SelectItem>
            </SelectContent>
          </Select>
          
          <span className="text-xs text-gray-500 hidden sm:inline">Within weeks:</span>
          
          <Select value={calendarPrimaryGroup} onValueChange={setCalendarPrimaryGroup}>
            <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white h-8 text-xs">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">By Project</SelectItem>
              <SelectItem value="assigned">By Assigned</SelectItem>
              <SelectItem value="category">By Category</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={calendarSecondaryGroup} onValueChange={setCalendarSecondaryGroup}>
            <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white h-8 text-xs">
              <SelectValue placeholder="Then by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Then Project</SelectItem>
              <SelectItem value="assigned">Then Assigned</SelectItem>
              <SelectItem value="category">Then Category</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Week Sections */}
      <div className="space-y-4">
        {/* Past Due Section */}
        {tasksPastDue.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border-2 border-red-600">
            <CardHeader className="p-3 border-b border-red-600/50 bg-red-600/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <CardTitle className="text-sm font-semibold text-red-400">
                    PAST DUE
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-red-600 text-red-400 bg-red-600/10">
                  {tasksPastDue.length} {tasksPastDue.length === 1 ? 'task' : 'tasks'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {renderGroupedTasks(groupTasksForWeek(tasksPastDue))}
            </CardContent>
          </Card>
        )}

        {weekRanges.map((range, weekIndex) => {
          const weekTasks = tasksByWeek[weekIndex] || [];
          const groupedTasks = groupTasksForWeek(weekTasks);
          const isCurrentWeek = isWithinInterval(new Date(), { start: range.start, end: range.end });
          
          return (
            <Card 
              key={weekIndex} 
              className={`bg-black/40 backdrop-blur-xl border-2 ${isCurrentWeek ? 'border-red-600/50' : 'border-gray-800'}`}
            >
              <CardHeader className={`p-3 border-b ${isCurrentWeek ? 'border-red-600/30 bg-red-600' : 'border-gray-800 bg-gray-700'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-white" />
                    <CardTitle className="text-base font-bold uppercase text-white">
                      {range.label}
                      {isCurrentWeek && <span className="ml-2 text-xs font-normal">(THIS WEEK)</span>}
                    </CardTitle>
                  </div>
                  <Badge 
                    variant="outline" 
                    className="border-white/50 text-white bg-white/10"
                  >
                    {weekTasks.length} {weekTasks.length === 1 ? 'task' : 'tasks'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3">
                {weekTasks.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No priority tasks due this week</p>
                ) : (
                  renderGroupedTasks(groupedTasks)
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Priority No Due Date Section */}
        {tasksWithoutDueDate.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border-2 border-amber-600/50">
            <CardHeader className="p-3 border-b border-amber-600/30 bg-amber-600/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <CardTitle className="text-sm font-semibold text-amber-400">
                    PRIORITY NO DUE DATE
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-amber-600 text-amber-400">
                  {tasksWithoutDueDate.length} {tasksWithoutDueDate.length === 1 ? 'task' : 'tasks'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {renderGroupedTasks(groupTasksForWeek(tasksWithoutDueDate))}
            </CardContent>
          </Card>
        )}

        {/* Due But Not Priority Section */}
        {dueButNotPriorityTasks.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border-2 border-blue-600/50">
            <CardHeader className="p-3 border-b border-blue-600/30 bg-blue-600/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <CardTitle className="text-sm font-semibold text-blue-400">
                    DUE BUT NOT PRIORITY
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-blue-600 text-blue-400">
                  {dueButNotPriorityTasks.length} {dueButNotPriorityTasks.length === 1 ? 'task' : 'tasks'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {renderGroupedTasks(groupTasksForWeek(dueButNotPriorityTasks))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}