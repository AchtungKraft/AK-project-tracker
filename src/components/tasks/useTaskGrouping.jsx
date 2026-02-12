import { useMemo, useEffect, useState } from 'react';
import { startOfWeek, endOfWeek, addWeeks, isWithinInterval, isBefore, startOfDay, format } from 'date-fns';
import { subscribeToTaskStateUpdates, getTaskVersion } from './taskStateEvents';
import { hasCalendarDate } from './normalizeTask';

/**
 * useTaskGrouping - Centralized task grouping logic
 * 
 * ENFORCEMENT RULE: Calendar + Kanban + Priority Dashboard must ALL use this hook.
 * 
 * Single source of truth for:
 * - start_date ?? due_date date selection
 * - Week range generation
 * - All grouping rules
 * 
 * VERSION TRACKING: Re-computes when taskVersion changes (via event subscription)
 */

/**
 * Get the effective date for a task (start_date preferred, falls back to due_date)
 */
export const getTaskEffectiveDate = (task) => {
  return task.start_date ?? task.due_date;
};

/**
 * Generate week ranges for calendar display
 */
export const generateWeekRanges = (weeksToShow = 6, startDate = new Date()) => {
  const ranges = [];
  const today = startOfDay(startDate);
  
  for (let i = 0; i < weeksToShow; i++) {
    const weekStart = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 }); // Monday start
    const weekEnd = endOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
    
    ranges.push({
      start: weekStart,
      end: weekEnd,
      label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`,
      labelShort: `${format(weekStart, 'M/d')} - ${format(weekEnd, 'M/d')}`,
    });
  }
  
  return ranges;
};

/**
 * Main grouping hook
 */
export function useTaskGrouping({
  tasks = [],
  statuses = [],
  projects = [],
  categories = [],
  teamMembers = [],
  weeksToShow = 6,
}) {
  // Version tracking - forces recalculation when tasks mutate
  const [taskVersion, setTaskVersion] = useState(getTaskVersion());
  
  // Subscribe to global task state updates
  useEffect(() => {
    const unsubscribe = subscribeToTaskStateUpdates((detail) => {
      console.log('TASK GROUPING: Received state update event', detail);
      setTaskVersion(detail.version);
    });
    return unsubscribe;
  }, []);
  // Get completed status for filtering
  const completedStatus = useMemo(() => {
    return statuses.find(s => {
      const label = s.label?.toLowerCase() || '';
      return label.includes('complete') || label.includes('done');
    });
  }, [statuses]);

  // Filter out completed tasks
  const activeTasks = useMemo(() => {
    return tasks.filter(t => t.status_id !== completedStatus?.id);
  }, [tasks, completedStatus?.id]);

  // Week ranges
  const weekRanges = useMemo(() => {
    return generateWeekRanges(weeksToShow);
  }, [weeksToShow]);

  // Tasks with calendar dates (for calendar view exclusion rule)
  const calendarTasks = useMemo(() => {
    return activeTasks.filter(hasCalendarDate);
  }, [activeTasks]);

  // Group by week (using effective date: start_date ?? due_date)
  // Depends on taskVersion to force recalculation
  const groupedByWeek = useMemo(() => {
    console.log('TASK GROUPING: groupedByWeek recomputed', calendarTasks.length, 'tasks, version:', taskVersion);
    
    const pastDue = [];
    const byWeek = weekRanges.map(() => []);
    const noDueDate = [];
    const today = startOfDay(new Date());

    // Only include tasks that have calendar dates
    calendarTasks.forEach(task => {
      const effectiveDate = getTaskEffectiveDate(task);
      
      // This shouldn't happen since we filtered, but safety check
      if (!effectiveDate) {
        return;
      }

      const taskDate = new Date(effectiveDate);

      // Check if past due (before today and before first week range)
      if (isBefore(taskDate, today) && isBefore(taskDate, weekRanges[0].start)) {
        pastDue.push(task);
        return;
      }

      // Find which week it belongs to
      let placed = false;
      for (let i = 0; i < weekRanges.length; i++) {
        if (isWithinInterval(taskDate, { start: weekRanges[i].start, end: weekRanges[i].end })) {
          byWeek[i].push(task);
          placed = true;
          break;
        }
      }

      // If not placed and has a date, it's either past due or future
      if (!placed && effectiveDate) {
        if (isBefore(taskDate, today)) {
          pastDue.push(task);
        }
        // Future tasks beyond our range are ignored for now
      }
    });
    
    // Tasks WITHOUT dates (excluded from calendar, shown in card/kanban)
    activeTasks.forEach(task => {
      if (!hasCalendarDate(task)) {
        noDueDate.push(task);
      }
    });

    return {
      pastDue,
      byWeek,
      noDueDate,
      weekRanges,
    };
  }, [calendarTasks, activeTasks, weekRanges, taskVersion]);

  // Group by status - depends on taskVersion
  const groupedByStatus = useMemo(() => {
    const groups = {};
    
    activeTasks.forEach(task => {
      const statusId = task.status_id || 'no-status';
      const status = statuses.find(s => s.id === statusId);
      
      if (!groups[statusId]) {
        groups[statusId] = {
          id: statusId,
          label: status?.label || 'No Status',
          color: status?.color || '#6B7280',
          tasks: [],
        };
      }
      groups[statusId].tasks.push(task);
    });

    return groups;
  }, [activeTasks, statuses, taskVersion]);

  // Group by project - depends on taskVersion
  const groupedByProject = useMemo(() => {
    const groups = {};
    
    activeTasks.forEach(task => {
      const projectId = task.project_id || 'no-project';
      const project = projects.find(p => p.id === projectId);
      
      if (!groups[projectId]) {
        groups[projectId] = {
          id: projectId,
          label: project?.name || 'No Project',
          color: '#EF4444',
          tasks: [],
        };
      }
      groups[projectId].tasks.push(task);
    });

    return groups;
  }, [activeTasks, projects, taskVersion]);

  // Group by category - depends on taskVersion
  const groupedByCategory = useMemo(() => {
    const groups = {};
    
    activeTasks.forEach(task => {
      const categoryId = task.category_id || 'no-category';
      const category = categories.find(c => c.id === categoryId);
      
      if (!groups[categoryId]) {
        groups[categoryId] = {
          id: categoryId,
          label: category?.name || 'No Category',
          color: category?.color || '#6B7280',
          tasks: [],
        };
      }
      groups[categoryId].tasks.push(task);
    });

    return groups;
  }, [activeTasks, categories, taskVersion]);

  // Group by assigned team member - depends on taskVersion
  const groupedByAssignee = useMemo(() => {
    const groups = {};
    
    activeTasks.forEach(task => {
      const memberId = task.assigned_team_member_id || 'unassigned';
      const member = teamMembers.find(m => m.id === memberId);
      
      if (!groups[memberId]) {
        groups[memberId] = {
          id: memberId,
          label: member?.full_name || 'Unassigned',
          color: '#6B7280',
          tasks: [],
        };
      }
      groups[memberId].tasks.push(task);
    });

    return groups;
  }, [activeTasks, teamMembers, taskVersion]);

  return {
    // Filtered tasks
    activeTasks,
    calendarTasks, // Tasks with dates (for calendar views)
    completedStatus,
    
    // Version for dependency tracking
    taskVersion,
    
    // Grouping results
    groupedByWeek,
    groupedByStatus,
    groupedByProject,
    groupedByCategory,
    groupedByAssignee,
    
    // Utilities
    weekRanges,
    getTaskEffectiveDate,
  };
}

export default useTaskGrouping;