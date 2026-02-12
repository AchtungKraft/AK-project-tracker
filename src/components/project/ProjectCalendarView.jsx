import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar, User, Tag, AlertCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, isWithinInterval, isBefore } from "date-fns";
import TaskCard from "./TaskCard";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";

/**
 * ProjectCalendarView
 * Calendar view for tasks within a single project
 * Scoped version of PriorityCalendarView
 */
export default function ProjectCalendarView({
  tasks = [],
  categories = [],
  teamMembers = [],
  statuses = [],
  onTaskClick,
  onToggleComplete,
  onUpdateDueDate,
  onUpdateStartDate,
  onTogglePriority,
  commentCountByTaskId = {},
}) {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weeksToShow, setWeeksToShow] = useState(isMobile ? 4 : 4);
  const [groupBy, setGroupBy] = useState('assigned');

  // Debug logging
  console.log('[ProjectCalendarView] Received tasks:', tasks.length);
  console.log('[ProjectCalendarView] Tasks sample:', tasks.slice(0, 3).map(t => ({ id: t.id, name: t.name, due_date: t.due_date, start_date: t.start_date })));

  // Generate week ranges
  const weekRanges = useMemo(() => {
    const ranges = [];
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
    
    for (let i = 0; i < weeksToShow; i++) {
      const weekStart = addWeeks(startDate, i);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      ranges.push({ 
        start: weekStart, 
        end: weekEnd, 
        label: isMobile 
          ? `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'd')}`
          : `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}` 
      });
    }
    return ranges;
  }, [currentDate, weeksToShow, isMobile]);

  // Separate tasks - use start_date OR due_date for calendar placement
  const { tasksPastDue, tasksWithDueDate, tasksWithoutDueDate } = useMemo(() => {
    const pastDue = [];
    const withDate = [];
    const withoutDate = [];
    const today = startOfWeek(new Date(), { weekStartsOn: 1 });
    
    // Filter to non-completed tasks
    const completedStatus = statuses.find(s => {
      const label = s.label?.toLowerCase() || '';
      return s.scope === 'Task' && (label.includes('complete') || label.includes('done'));
    });
    
    const activeTasks = tasks.filter(t => t.status_id !== completedStatus?.id);
    console.log('[ProjectCalendarView] Active tasks after filtering:', activeTasks.length);
    
    activeTasks.forEach(task => {
      // Use start_date first, fall back to due_date
      const dateToUse = task.start_date || task.due_date;
      
      if (dateToUse) {
        const taskDate = parseISO(dateToUse);
        if (isBefore(taskDate, today)) {
          pastDue.push({ ...task, _calendarDate: dateToUse });
        } else {
          withDate.push({ ...task, _calendarDate: dateToUse });
        }
      } else {
        withoutDate.push(task);
      }
    });
    
    console.log('[ProjectCalendarView] Categorized - pastDue:', pastDue.length, 'withDate:', withDate.length, 'withoutDate:', withoutDate.length);
    return { tasksPastDue: pastDue, tasksWithDueDate: withDate, tasksWithoutDueDate: withoutDate };
  }, [tasks, statuses]);

  // Group tasks by week - use _calendarDate which is already computed
  const tasksByWeek = useMemo(() => {
    const grouped = {};
    
    weekRanges.forEach((range, index) => {
      grouped[index] = tasksWithDueDate.filter(task => {
        // Use the pre-computed calendar date
        const taskDate = parseISO(task._calendarDate);
        return isWithinInterval(taskDate, { start: range.start, end: range.end });
      });
    });
    
    console.log('[ProjectCalendarView] Tasks by week:', Object.entries(grouped).map(([k, v]) => `Week ${k}: ${v.length}`).join(', '));
    return grouped;
  }, [tasksWithDueDate, weekRanges]);

  // Helper to get grouping info
  const getGroupInfo = (task) => {
    if (groupBy === 'assigned') {
      const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
      return { key: task.assigned_team_member_id || 'unassigned', label: member?.full_name || 'Unassigned', color: '#6B7280', icon: User };
    } else if (groupBy === 'category') {
      const category = categories.find(c => c.id === task.category_id);
      return { key: task.category_id || 'no-category', label: category?.name || 'No Category', color: category?.color || '#6B7280', icon: Tag };
    }
    return { key: 'unknown', label: 'Unknown', color: '#6B7280', icon: Tag };
  };

  // Group tasks within a section
  const groupTasks = (sectionTasks) => {
    const groups = {};
    
    sectionTasks.forEach(task => {
      const info = getGroupInfo(task);
      
      if (!groups[info.key]) {
        groups[info.key] = { ...info, tasks: [] };
      }
      
      groups[info.key].tasks.push(task);
    });
    
    return groups;
  };

  const navigateWeeks = (direction) => {
    if (direction === 'prev') {
      setCurrentDate(subWeeks(currentDate, weeksToShow));
    } else {
      setCurrentDate(addWeeks(currentDate, weeksToShow));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const renderGroupedTasks = (groupedTasks) => (
    <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}>
      {Object.entries(groupedTasks).map(([key, group]) => {
        const Icon = group.icon;
        return (
          <div 
            key={key} 
            className="bg-black/40 rounded-lg border-2 overflow-hidden"
            style={{ borderColor: group.color }}
          >
            <div 
              className="p-2 border-b-2"
              style={{ borderBottomColor: group.color, backgroundColor: `${group.color}15` }}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" style={{ color: group.color }} />
                <h3 className="font-semibold text-xs" style={{ color: group.color }}>
                  {group.label}
                </h3>
              </div>
              <span className="text-xs text-gray-400">
                {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <div className="p-2 space-y-2">
              {group.tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  categories={categories}
                  teamMembers={teamMembers}
                  statuses={statuses}
                  onToggleComplete={onToggleComplete}
                  onClick={() => onTaskClick(task)}
                  onUpdateDueDate={onUpdateDueDate}
                  onUpdateStartDate={onUpdateStartDate}
                  onTogglePriority={onTogglePriority}
                  commentCount={commentCountByTaskId[task.id] || 0}
                  compact={isMobile}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className={cn(
        "flex items-center justify-between gap-2 bg-black/40 rounded-lg p-2 border border-gray-800",
        isMobile ? "flex-col items-stretch" : "flex-row"
      )}>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigateWeeks('prev')}
            className={cn("border-gray-700 text-white hover:bg-gray-800", isMobile ? "h-9 w-9 p-0" : "")}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={goToToday}
            className={cn("border-gray-700 text-white hover:bg-gray-800", isMobile ? "h-9 px-2 text-xs" : "")}
          >
            <Calendar className={cn("mr-1", isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} />
            Today
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigateWeeks('next')}
            className={cn("border-gray-700 text-white hover:bg-gray-800", isMobile ? "h-9 w-9 p-0" : "")}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={String(weeksToShow)} onValueChange={(v) => setWeeksToShow(Number(v))}>
            <SelectTrigger className={cn("bg-gray-900/50 border-gray-700 text-white", isMobile ? "w-24 h-8 text-xs" : "w-28 h-8 text-xs")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Weeks</SelectItem>
              <SelectItem value="4">4 Weeks</SelectItem>
              <SelectItem value="6">6 Weeks</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className={cn("bg-gray-900/50 border-gray-700 text-white", isMobile ? "w-28 h-8 text-xs" : "w-32 h-8 text-xs")}>
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="assigned">By Assigned</SelectItem>
              <SelectItem value="category">By Category</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Week Sections */}
      <div className="space-y-3">
        {/* Past Due */}
        {tasksPastDue.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border-2 border-red-600">
            <CardHeader className={cn("border-b border-red-600/50 bg-red-600/20", isMobile ? "p-2" : "p-3")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className={isMobile ? "w-3.5 h-3.5 text-red-500" : "w-4 h-4 text-red-500"} />
                  <CardTitle className={cn("font-semibold text-red-400", isMobile ? "text-xs" : "text-sm")}>
                    PAST DUE
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-red-600 text-red-400 bg-red-600/10 text-xs">
                  {tasksPastDue.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className={isMobile ? "p-2" : "p-3"}>
              {renderGroupedTasks(groupTasks(tasksPastDue))}
            </CardContent>
          </Card>
        )}

        {/* Weeks */}
        {weekRanges.map((range, weekIndex) => {
          const weekTasks = tasksByWeek[weekIndex] || [];
          const isCurrentWeek = isWithinInterval(new Date(), { start: range.start, end: range.end });
          
          return (
            <Card 
              key={weekIndex} 
              className={cn("bg-black/40 backdrop-blur-xl border-2", isCurrentWeek ? "border-red-600/50" : "border-gray-800")}
            >
              <CardHeader className={cn(
                "border-b",
                isCurrentWeek ? "border-red-600/30 bg-red-600" : "border-gray-800 bg-gray-700",
                isMobile ? "p-2" : "p-3"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className={cn("text-white", isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} />
                    <CardTitle className={cn("font-bold uppercase text-white", isMobile ? "text-xs" : "text-sm")}>
                      {range.label}
                      {isCurrentWeek && <span className="ml-2 text-xs font-normal">(THIS WEEK)</span>}
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="border-white/50 text-white bg-white/10 text-xs">
                    {weekTasks.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className={isMobile ? "p-2" : "p-3"}>
                {weekTasks.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-3">No tasks due this week</p>
                ) : (
                  renderGroupedTasks(groupTasks(weekTasks))
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* No Due Date */}
        {tasksWithoutDueDate.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border-2 border-amber-600/50">
            <CardHeader className={cn("border-b border-amber-600/30 bg-amber-600/10", isMobile ? "p-2" : "p-3")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className={cn("text-amber-500", isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} />
                  <CardTitle className={cn("font-semibold text-amber-400", isMobile ? "text-xs" : "text-sm")}>
                    NO DUE DATE
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-amber-600 text-amber-400 text-xs">
                  {tasksWithoutDueDate.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className={isMobile ? "p-2" : "p-3"}>
              {renderGroupedTasks(groupTasks(tasksWithoutDueDate))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}