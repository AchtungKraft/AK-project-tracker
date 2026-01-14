import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar, FolderKanban, User, Tag, AlertCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, isWithinInterval, isBefore, isAfter } from "date-fns";
import TaskCard from "../project/TaskCard";
import { toast } from "sonner";

export default function PriorityCalendarView({
  tasks,
  projects,
  categories,
  teamMembers,
  statuses,
  onTaskClick,
  updateTaskMutation,
  primaryGroupBy,
  secondaryGroupBy,
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weeksToShow, setWeeksToShow] = useState(4);
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

  // Separate tasks with and without due dates
  const { tasksWithDueDate, tasksWithoutDueDate } = useMemo(() => {
    const withDate = [];
    const withoutDate = [];
    
    tasks.forEach(task => {
      if (task.due_date) {
        withDate.push(task);
      } else {
        withoutDate.push(task);
      }
    });
    
    return { tasksWithDueDate: withDate, tasksWithoutDueDate: withoutDate };
  }, [tasks]);

  // Group tasks by week
  const tasksByWeek = useMemo(() => {
    const grouped = {};
    
    weekRanges.forEach((range, index) => {
      grouped[index] = tasksWithDueDate.filter(task => {
        const dueDate = parseISO(task.due_date);
        return isWithinInterval(dueDate, { start: range.start, end: range.end });
      });
    });
    
    return grouped;
  }, [tasksWithDueDate, weekRanges]);

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

  const handleToggleComplete = async (task) => {
    const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
    const completedStatus = taskStatuses.find(s => {
      const label = s.label.toLowerCase();
      return label.includes('complete') || label.includes('done');
    });

    const isCurrentlyComplete = task.status_id === completedStatus?.id;
    
    if (isCurrentlyComplete) {
      const firstStatus = taskStatuses.find(s => s.id !== completedStatus?.id);
      if (firstStatus) {
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: { status_id: firstStatus.id, completed_date: null }
        });
        toast.success('Task reopened');
      }
    } else {
      if (completedStatus) {
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: { status_id: completedStatus.id, completed_date: new Date().toISOString() }
        });
        toast.success('Task completed');
      }
    }
  };

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
    return Object.entries(groupedTasks).map(([primaryKey, primaryGroup]) => {
      const PrimaryIcon = primaryGroup.icon;
      return (
        <div key={primaryKey} className="mb-4 last:mb-0">
          <div className="flex items-center gap-2 mb-2">
            <PrimaryIcon className="w-4 h-4" style={{ color: primaryGroup.color }} />
            <span className="font-medium text-sm" style={{ color: primaryGroup.color }}>
              {primaryGroup.label}
            </span>
            <Badge variant="outline" className="text-xs" style={{ borderColor: primaryGroup.color, color: primaryGroup.color }}>
              {Object.values(primaryGroup.secondaryGroups).reduce((sum, sg) => sum + sg.tasks.length, 0)}
            </Badge>
          </div>
          <div className="pl-4 space-y-3">
            {Object.entries(primaryGroup.secondaryGroups).map(([secondaryKey, secondaryGroup]) => {
              const SecondaryIcon = secondaryGroup.icon;
              return (
                <div key={secondaryKey} className="bg-black/30 rounded-lg p-3 border border-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <SecondaryIcon className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-400">{secondaryGroup.label}</span>
                    <span className="text-xs text-gray-500">({secondaryGroup.tasks.length})</span>
                  </div>
                  <div className="space-y-2">
                    {secondaryGroup.tasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        categories={categories}
                        teamMembers={teamMembers}
                        statuses={statuses}
                        onToggleComplete={handleToggleComplete}
                        onClick={() => onTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    });
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
        {weekRanges.map((range, weekIndex) => {
          const weekTasks = tasksByWeek[weekIndex] || [];
          const groupedTasks = groupTasksForWeek(weekTasks);
          const isCurrentWeek = isWithinInterval(new Date(), { start: range.start, end: range.end });
          
          return (
            <Card 
              key={weekIndex} 
              className={`bg-black/40 backdrop-blur-xl border-2 ${isCurrentWeek ? 'border-red-600/50' : 'border-gray-800'}`}
            >
              <CardHeader className={`p-3 border-b ${isCurrentWeek ? 'border-red-600/30 bg-red-600/10' : 'border-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-4 h-4 ${isCurrentWeek ? 'text-red-500' : 'text-gray-400'}`} />
                    <CardTitle className={`text-sm font-semibold ${isCurrentWeek ? 'text-red-400' : 'text-white'}`}>
                      {range.label}
                      {isCurrentWeek && <span className="ml-2 text-xs font-normal">(This Week)</span>}
                    </CardTitle>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={isCurrentWeek ? 'border-red-600 text-red-400' : 'border-gray-600 text-gray-400'}
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

        {/* No Due Date Section */}
        {tasksWithoutDueDate.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border-2 border-amber-600/50">
            <CardHeader className="p-3 border-b border-amber-600/30 bg-amber-600/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <CardTitle className="text-sm font-semibold text-amber-400">
                    No Due Date
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
      </div>
    </div>
  );
}