import React, { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Flame, Loader2, FolderKanban, RefreshCw, LayoutGrid, Calendar, X, User, List, ClipboardCheck } from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import MobileMetricPriorityGrid from "@/components/mobile/MobileMetricPriorityGrid";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import MobileFilterTriggerBar, { useActiveFilterCount } from "@/components/mobile/MobileFilterTriggerBar";
import MobileFilterDrawer, { MobileFilterSection } from "@/components/mobile/MobileFilterDrawer";
import MobileSortDrawer, { MobileSortOption } from "@/components/mobile/MobileSortDrawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import TaskCard from "../components/project/TaskCard";
import TaskDetailDrawer from "../components/tasks/TaskDetailDrawer";
import PriorityCalendarView from "../components/priorities/PriorityCalendarView";
import ShopPriorityView from "../components/priorities/ShopPriorityView";
import PriorityRemoveConfirm from "../components/tasks/PriorityRemoveConfirm";
import PriorityListView from "../components/priorities/PriorityListView";
import PriorityExecutionView from "../components/priorities/PriorityExecutionView";
import { useSavedProjectViews } from "@/components/common/useSavedProjectViews";
import SavedViewsSelector from "@/components/common/SavedViewsSelector";
import { useFilterState, PRIORITY_DEFAULTS } from "@/components/common/useFilterState";
import { useTaskData } from "../components/tasks/useTaskData";
import { computePartsProgressByTaskId } from "@/utils/taskPartsProgress";
import { sortTasksByPriority, isUrgentPriority } from "@/utils/taskPrioritySort";

export default function PriorityDashboard() {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState(null);
  const [primaryGroupBy, setPrimaryGroupBy] = useState('project');
  const [secondaryGroupBy, setSecondaryGroupBy] = useState('category');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingPriorityTask, setPendingPriorityTask] = useState(null);
  // Persist view mode in localStorage
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('priority_view_mode') || 'shop-view';
  });
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [sortDrawerOpen, setSortDrawerOpen] = useState(false);
  const [tempFilters, setTempFilters] = useState(null);
  
  // Use centralized task data hook for inline controls
  const {
    handleUpdateDueDate,
    handleUpdateStartDate,
    handleTogglePriority,
    handleConfirmRemovePriority,
  } = useTaskData({ priorityOnly: true });

  // Wrapped priority toggle that handles confirmation flow
  const wrappedTogglePriority = useCallback(async (task, skipConfirm = false) => {
    const result = await handleTogglePriority(task, skipConfirm);
    if (result?.needsConfirmation) {
      setPendingPriorityTask(task);
    }
    return result;
  }, [handleTogglePriority]);

  const handleConfirmPriorityRemoval = useCallback(async () => {
    if (pendingPriorityTask) {
      await handleConfirmRemovePriority(pendingPriorityTask);
      setPendingPriorityTask(null);
    }
  }, [pendingPriorityTask, handleConfirmRemovePriority]);

  // Persist view mode changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('priority_view_mode', tab);
  };

  // Unified filter state with URL/localStorage persistence
  const { filters, setFilter, applyView, clearFilters } = useFilterState('priority', PRIORITY_DEFAULTS);
  const { selectedTypes, statusFilter, assignedTo } = filters;

  // Handler for assigned to filter changes
  const handleAssignedToChange = useCallback((newAssigned) => {
    setFilter('assignedTo', newAssigned);
  }, [setFilter]);

  // Saved views hook
  const {
    savedViews,
    activeViewName,
    activeView,
    saveView,
    deleteView,
    renameView,
    selectView,
  } = useSavedProjectViews();

  // Handle saved view selection - apply filters immediately
  const handleSelectView = useCallback((name) => {
    const view = selectView(name);
    if (view) {
      applyView(view);
    }
  }, [selectView, applyView]);

  const handleSelectedTypesChange = useCallback((newTypes) => {
    setFilter('selectedTypes', newTypes);
  }, [setFilter]);

  const handleStatusFilterChange = useCallback((value) => {
    setFilter('statusFilter', value);
  }, [setFilter]);

  // Fetch ALL tasks — priority sorting is applied client-side
  const { data: allTasksData = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['allTasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  // Derive priority tasks from all tasks
  const priorityTasks = useMemo(() =>
    allTasksData.filter(t => t.is_priority),
    [allTasksData]
  );

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priorityTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  // Get project statuses for filter (must be after statuses query)
  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Calculate active filter count for mobile badge
  const activeFilterCount = useActiveFilterCount(
    { selectedTypes, statusFilter, assignedTo },
    { selectedTypes: [], statusFilter: 'all', assignedTo: [] }
  );

  // Initialize temp filters when drawer opens
  const handleOpenFilterDrawer = useCallback(() => {
    setTempFilters({ selectedTypes, statusFilter, assignedTo });
    setFilterDrawerOpen(true);
  }, [selectedTypes, statusFilter, assignedTo]);

  // Apply temp filters
  const handleApplyFilters = useCallback(() => {
    if (tempFilters) {
      setFilter('selectedTypes', tempFilters.selectedTypes);
      setFilter('statusFilter', tempFilters.statusFilter);
      setFilter('assignedTo', tempFilters.assignedTo);
    }
  }, [tempFilters, setFilter]);

  // Clear all filters
  const handleClearAllFilters = useCallback(() => {
    setTempFilters({ selectedTypes: [], statusFilter: 'all', assignedTo: [] });
  }, []);

  // Scope task comments to priority task IDs only
  const priorityTaskIds = useMemo(() => priorityTasks.map(t => t.id), [priorityTasks]);
  const { data: allTaskComments = [] } = useQuery({
    queryKey: ['priorityTaskComments', priorityTaskIds],
    queryFn: () => priorityTaskIds.length > 0
      ? base44.entities.TaskComment.filter({ task_id: { $in: priorityTaskIds } })
      : [],
    enabled: priorityTaskIds.length > 0,
  });

  // Create a map of task_id -> comment count for efficient lookup
  const commentCountByTaskId = React.useMemo(() => {
    const map = {};
    allTaskComments.forEach(comment => {
      map[comment.task_id] = (map[comment.task_id] || 0) + 1;
    });
    return map;
  }, [allTaskComments]);

  // Fetch TaskPartLinks for all priority tasks (single query)
  const { data: allTaskPartLinks = [] } = useQuery({
    queryKey: ['taskPartLinks', 'priority', priorityTaskIds],
    queryFn: () => priorityTaskIds.length > 0
      ? base44.entities.TaskPartLink.filter({ task_id: { $in: priorityTaskIds } })
      : [],
    enabled: priorityTaskIds.length > 0,
  });

  const partsProgressByTaskId = useMemo(() => {
    return computePartsProgressByTaskId(allTaskPartLinks, new Set(priorityTaskIds));
  }, [allTaskPartLinks, priorityTaskIds]);

  // Get active team members sorted by sort_order for the Assigned To filter
  const activeTeamMembers = useMemo(() => {
    return teamMembers
      .filter(tm => tm.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [teamMembers]);

  // Filter out completed tasks and apply project filters from saved views
  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
  const completedStatus = taskStatuses.find(s => {
    const label = s.label.toLowerCase();
    return label.includes('complete') || label.includes('done');
  });
  const activePriorityTasks = useMemo(() => {
    const filtered = priorityTasks.filter(t => {
      if (t.status_id === completedStatus?.id) return false;
      if (assignedTo.length > 0 && !assignedTo.includes(t.assigned_team_member_id)) return false;
      const project = projects.find(p => p.id === t.project_id);
      if (selectedTypes.length > 0 && project && !selectedTypes.includes(project.project_type_id)) return false;
      if (statusFilter !== 'all' && project && project.status_id !== statusFilter) return false;
      return true;
    });
    return sortTasksByPriority(filtered);
  }, [priorityTasks, completedStatus, assignedTo, projects, selectedTypes, statusFilter]);

  // Split into urgent and upcoming for section headers
  const urgentCount = useMemo(() => activePriorityTasks.filter(isUrgentPriority).length, [activePriorityTasks]);

  // Group tasks by primary grouping, then sub-group by secondary grouping
  const groupedTasks = useMemo(() => {
    const primaryGroups = {};

    activePriorityTasks.forEach(task => {
      let primaryKey, primaryLabel, primaryColor;

      if (primaryGroupBy === 'project') {
        const project = projects.find(p => p.id === task.project_id);
        primaryKey = task.project_id;
        primaryLabel = project?.name || 'No Project';
        primaryColor = '#EF4444';
      } else if (primaryGroupBy === 'category') {
        const category = categories.find(c => c.id === task.category_id);
        primaryKey = task.category_id || 'no-category';
        primaryLabel = category?.name || 'No Category';
        primaryColor = category?.color || '#6B7280';
      }

      if (!primaryGroups[primaryKey]) {
        primaryGroups[primaryKey] = {
          id: primaryKey,
          label: primaryLabel,
          color: primaryColor,
          tasks: [],
          secondaryGroups: {},
        };
      }
      primaryGroups[primaryKey].tasks.push(task);
    });

    // Sub-group tasks within each primary group
    Object.values(primaryGroups).forEach(primaryGroup => {
      const secondaryGroups = {};

      primaryGroup.tasks.forEach(task => {
        let secondaryKey, secondaryLabel, secondaryColor;

        if (secondaryGroupBy === 'status') {
          const status = statuses.find(s => s.id === task.status_id);
          secondaryKey = task.status_id || 'no-status';
          secondaryLabel = status?.label || 'No Status';
          secondaryColor = status?.color || '#6B7280';
        } else if (secondaryGroupBy === 'assigned') {
          const member = teamMembers.find(m => m.id === task.assigned_team_member_id);
          secondaryKey = task.assigned_team_member_id || 'unassigned';
          secondaryLabel = member?.full_name || 'Unassigned';
          secondaryColor = '#6B7280';
        } else if (secondaryGroupBy === 'category') {
          const category = categories.find(c => c.id === task.category_id);
          secondaryKey = task.category_id || 'no-category';
          secondaryLabel = category?.name || 'No Category';
          secondaryColor = category?.color || '#6B7280';
        } else if (secondaryGroupBy === 'project') {
          const project = projects.find(p => p.id === task.project_id);
          secondaryKey = task.project_id;
          secondaryLabel = project?.name || 'No Project';
          secondaryColor = '#6B7280';
        }

        if (!secondaryGroups[secondaryKey]) {
          secondaryGroups[secondaryKey] = { label: secondaryLabel, color: secondaryColor, tasks: [] };
        }
        secondaryGroups[secondaryKey].tasks.push(task);
      });

      // Apply canonical sort within each secondary group
      Object.values(secondaryGroups).forEach(sg => {
        sg.tasks = sortTasksByPriority(sg.tasks);
      });

      primaryGroup.secondaryGroups = secondaryGroups;
    });

    return primaryGroups;
  }, [activePriorityTasks, primaryGroupBy, secondaryGroupBy, projects, categories, statuses, teamMembers]);

  const handleToggleComplete = async (task) => {
    const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
    const completedStatus = taskStatuses.find(s => {
      const label = s.label.toLowerCase();
      return label.includes('complete') || label.includes('done');
    });

    const isCurrentlyComplete = task.status_id === completedStatus?.id;
    
    if (isCurrentlyComplete) {
      // Reopen task - set to first non-complete status
      const firstStatus = taskStatuses.find(s => s.id !== completedStatus?.id);
      if (firstStatus) {
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: {
            status_id: firstStatus.id,
            completed_date: null,
          }
        });
        toast.success('Task reopened');
      }
    } else {
      // Complete task
      if (completedStatus) {
        await updateTaskMutation.mutateAsync({
          id: task.id,
          data: {
            status_id: completedStatus.id,
            completed_date: new Date().toISOString(),
          }
        });
        toast.success('Task completed');
      }
    }
  };

  const isMobile = useIsMobile();
  
  // Metrics for mobile priority grid
  const priorityMetrics = useMemo(() => [
    { key: 'total', label: 'Priority Tasks', value: activePriorityTasks.length, icon: Flame, color: 'red' },
    { key: 'projects', label: 'Projects', value: Object.keys(groupedTasks).length, icon: FolderKanban, color: 'blue' },
  ], [activePriorityTasks.length, groupedTasks]);

  if (tasksLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      </div>
    );
  }

  return (
    <>
      <MobileSafeAreaContainer>
        <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black ${isMobile ? 'p-2' : 'p-3 md:p-6'}`}>
          <div className={`max-w-7xl mx-auto ${isMobile ? 'space-y-3' : 'space-y-6'}`}>
          {/* Header */}
          <div className={`flex items-center justify-between ${isMobile ? 'gap-2 mb-2' : 'gap-2'}`}>
            <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-2 md:gap-3'}`}>
              <div className={`flex items-center justify-center bg-red-600/20 rounded-lg border-2 border-red-600 ${isMobile ? 'w-9 h-9' : 'w-10 h-10 md:w-12 md:h-12'}`}>
                <Flame className={isMobile ? 'w-4 h-4 text-red-500' : 'w-5 h-5 md:w-6 md:h-6 text-red-500'} />
              </div>
              <div>
                <h1 className={`font-bold text-white ${isMobile ? 'text-lg' : 'text-xl md:text-3xl'}`}>PRIORITIES</h1>
                <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>
                  <span className="md:hidden">{activePriorityTasks.length} tasks{urgentCount > 0 ? ` • ${urgentCount} urgent` : ''}</span>
                  <span className="hidden md:inline">{activePriorityTasks.length} priority {activePriorityTasks.length === 1 ? 'task' : 'tasks'}{urgentCount > 0 ? ` • ${urgentCount} urgent (≤14 days)` : ''}</span>
                </p>
              </div>
            </div>
            <Button
              onClick={async () => {
                setIsRefreshing(true);
                await queryClient.invalidateQueries();
                setIsRefreshing(false);
              }}
              variant="outline"
              className={`border-gray-700 text-white gap-2 ${isMobile ? 'h-[44px] text-sm px-3' : ''}`}
              size={isMobile ? undefined : 'sm'}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          {/* Mobile Filter Trigger Bar */}
          <MobileFilterTriggerBar
            activeFilterCount={activeFilterCount}
            searchValue=""
            onSearchChange={() => {}}
            onFilterClick={handleOpenFilterDrawer}
            onSortClick={() => setSortDrawerOpen(true)}
            showSort={activeTab === 'card-view'}
          >
            {/* Desktop Filters */}
            <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <SavedViewsSelector
                  savedViews={savedViews}
                  activeViewName={activeViewName}
                  onSelectView={handleSelectView}
                  onSaveView={saveView}
                  onDeleteView={deleteView}
                  onRenameView={renameView}
                  currentSelectedTypes={selectedTypes}
                  currentStatusFilter={statusFilter}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Project Type Multi-Select */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-48 justify-between bg-gray-900/50 border-gray-700 text-white hover:bg-gray-800"
                    >
                      <span className="truncate">
                        {selectedTypes.length === 0 
                          ? 'All Project Types' 
                          : selectedTypes.length === 1 
                            ? projectTypes.find(t => t.id === selectedTypes[0])?.name || 'Type'
                            : `${selectedTypes.length} Types`}
                      </span>
                      {selectedTypes.length > 0 && (
                        <X 
                          className="w-4 h-4 ml-2 hover:text-red-400" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectedTypesChange([]);
                          }}
                        />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    {projectTypes.filter(t => t.active).map(t => (
                      <DropdownMenuCheckboxItem
                        key={t.id}
                        checked={selectedTypes.includes(t.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleSelectedTypesChange([...selectedTypes, t.id]);
                          } else {
                            handleSelectedTypesChange(selectedTypes.filter(id => id !== t.id));
                          }
                        }}
                      >
                        <span 
                          className="w-2 h-2 rounded-full mr-2" 
                          style={{ backgroundColor: t.color }}
                        />
                        {t.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Project Status Filter */}
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {projectStatuses.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Assigned To Multi-Select */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      className={`w-48 justify-between bg-gray-900/50 border-gray-700 text-white hover:bg-gray-800 ${assignedTo.length > 0 ? 'border-cyan-500/50' : ''}`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <User className="w-4 h-4 shrink-0" />
                        {assignedTo.length === 0 
                          ? 'All Assignees' 
                          : assignedTo.length === 1 
                            ? activeTeamMembers.find(tm => tm.id === assignedTo[0])?.full_name || 'Assignee'
                            : `${assignedTo.length} Assignees`}
                      </span>
                      {assignedTo.length > 0 && (
                        <X 
                          className="w-4 h-4 ml-2 hover:text-red-400 shrink-0" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAssignedToChange([]);
                          }}
                        />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 max-h-80 overflow-y-auto">
                    {activeTeamMembers.map(tm => (
                      <DropdownMenuCheckboxItem
                        key={tm.id}
                        checked={assignedTo.includes(tm.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleAssignedToChange([...assignedTo, tm.id]);
                          } else {
                            handleAssignedToChange(assignedTo.filter(id => id !== tm.id));
                          }
                        }}
                      >
                        <span className="truncate">
                          {tm.full_name}
                          {tm.team_role && <span className="text-gray-400 ml-1">({tm.team_role})</span>}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Clear Filters */}
                {(selectedTypes.length > 0 || statusFilter !== 'all' || assignedTo.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearFilters();
                      selectView('All Projects');
                    }}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </MobileFilterTriggerBar>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <TabsList className="bg-gray-800/80 border border-gray-700 p-1">
                <TabsTrigger 
                  value="card-view" 
                  className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">Card View</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="calendar-view" 
                  className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span className="hidden sm:inline">Calendar</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="list-view" 
                  className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">List</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="execution-view" 
                  className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Execution</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="shop-view" 
                  className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
                >
                  <Flame className="w-4 h-4" />
                  <span className="hidden sm:inline">Shop</span>
                </TabsTrigger>
              </TabsList>

              {/* Grouping dropdowns - only show on card view */}
              {activeTab === 'card-view' && priorityTasks.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <Select value={primaryGroupBy} onValueChange={setPrimaryGroupBy}>
                    <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white h-9 text-sm">
                      <SelectValue placeholder="Primary Group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">Group by Project</SelectItem>
                      <SelectItem value="category">Group by Category</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={secondaryGroupBy} onValueChange={setSecondaryGroupBy}>
                    <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white h-9 text-sm">
                      <SelectValue placeholder="Secondary Group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="status">Then by Status</SelectItem>
                      <SelectItem value="assigned">Then by Assigned</SelectItem>
                      {primaryGroupBy !== 'category' && <SelectItem value="category">Then by Category</SelectItem>}
                      {primaryGroupBy !== 'project' && <SelectItem value="project">Then by Project</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Card View Tab Content */}
            <TabsContent value="card-view" className="mt-0">
          {/* Priority Tasks Grouped */}
          {activePriorityTasks.length === 0 ? (
            <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
              <CardContent className="p-8 md:p-12 text-center">
                <div className="flex items-center justify-center w-16 h-16 bg-red-600/10 rounded-full border-2 border-red-600/30 mx-auto mb-4">
                  <Flame className="w-8 h-8 text-red-500/50" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No Priority Tasks</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Drag tasks into the PRIORITY bucket on project boards to focus on what matters most.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTasks).map(([primaryKey, primaryGroup]) => {
                const { tasks, secondaryGroups } = primaryGroup;
                const project = primaryGroupBy === 'project' ? projects.find(p => p.id === primaryKey) : null;

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
                      className="border-b p-4"
                      style={{ borderBottomColor: `${primaryGroup.color}50` }}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          {primaryGroupBy === 'project' && <FolderKanban className="w-5 h-5" style={{ color: primaryGroup.color }} />}
                          <div>
                            {primaryGroupBy === 'project' && project ? (
                              <Link 
                                to={createPageUrl("ProjectDetail") + "?id=" + project.id}
                                className="hover:opacity-80 transition-opacity"
                              >
                                <CardTitle className="text-lg hover:underline" style={{ color: primaryGroup.color }}>{primaryGroup.label}</CardTitle>
                              </Link>
                            ) : (
                              <CardTitle className="text-lg" style={{ color: primaryGroup.color }}>{primaryGroup.label}</CardTitle>
                            )}
                            {primaryGroupBy === 'project' && project?.client_name && (
                              <p className="text-sm text-gray-400">{project.client_name}</p>
                            )}
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          style={{ borderColor: primaryGroup.color, color: primaryGroup.color, backgroundColor: `${primaryGroup.color}15` }}
                        >
                          {tasks.length} priority {tasks.length === 1 ? 'task' : 'tasks'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(secondaryGroups).map(([secondaryKey, secondaryGroup]) => (
                          <div key={secondaryKey} className="col-span-1">
                            <div 
                              className="bg-black/40 rounded-lg border-2 overflow-hidden"
                              style={{ borderColor: secondaryGroup.color }}
                            >
                              <div 
                                className="p-3 border-b-2"
                                style={{ 
                                  borderBottomColor: secondaryGroup.color,
                                  backgroundColor: `${secondaryGroup.color}15`
                                }}
                              >
                                <h3 
                                  className="font-semibold text-sm"
                                  style={{ color: secondaryGroup.color }}
                                >
                                  {secondaryGroup.label}
                                </h3>
                                <span className="text-xs text-gray-400">
                                  {secondaryGroup.tasks.length} {secondaryGroup.tasks.length === 1 ? 'task' : 'tasks'}
                                </span>
                              </div>
                              <div className="p-3 space-y-2">
                                {secondaryGroup.tasks.map(task => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    categories={categories}
                                    teamMembers={teamMembers}
                                    statuses={statuses}
                                    onToggleComplete={handleToggleComplete}
                                    onClick={() => setSelectedTask(task)}
                                    commentCount={commentCountByTaskId[task.id] || 0}
                                    partsProgress={partsProgressByTaskId[task.id]}
                                    onUpdateDueDate={handleUpdateDueDate}
                                    onUpdateStartDate={handleUpdateStartDate}
                                    onTogglePriority={wrappedTogglePriority}
                                    compact={isMobile}
                                    showInlineControls={true}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
            </TabsContent>

            {/* List View Tab Content */}
            <TabsContent value="list-view" className="mt-0">
              <PriorityListView
                tasks={activePriorityTasks}
                projects={projects}
                teamMembers={teamMembers}
                categories={categories}
                statuses={statuses}
                commentCountByTaskId={commentCountByTaskId}
                partsProgressByTaskId={partsProgressByTaskId}
                onToggleComplete={handleToggleComplete}
                onTaskClick={setSelectedTask}
              />
            </TabsContent>

            {/* Execution View Tab Content */}
            <TabsContent value="execution-view" className="mt-0">
              <PriorityExecutionView
                tasks={activePriorityTasks}
                projects={projects}
                teamMembers={teamMembers}
                categories={categories}
                statuses={statuses}
                partsProgressByTaskId={partsProgressByTaskId}
                commentCountByTaskId={commentCountByTaskId}
                onToggleComplete={handleToggleComplete}
                onTaskClick={setSelectedTask}
              />
            </TabsContent>

            {/* Shop View Tab Content */}
            <TabsContent value="shop-view" className="mt-0">
              <ShopPriorityView
                tasks={activePriorityTasks}
                projects={projects}
                categories={categories}
                teamMembers={teamMembers}
                statuses={statuses}
                commentCountByTaskId={commentCountByTaskId}
                allTaskComments={allTaskComments}
                partsProgressByTaskId={partsProgressByTaskId}
                updateTaskMutation={updateTaskMutation}
                onTaskClick={setSelectedTask}
                onToggleComplete={handleToggleComplete}
                onUpdateDueDate={handleUpdateDueDate}
                onUpdateStartDate={handleUpdateStartDate}
                onTogglePriority={wrappedTogglePriority}
              />
            </TabsContent>

            {/* Calendar View Tab Content */}
            <TabsContent value="calendar-view" className="mt-0">
              <PriorityCalendarView
                tasks={activePriorityTasks}
                allTasks={allTasksData}
                projects={projects}
                categories={categories}
                teamMembers={teamMembers}
                statuses={statuses}
                onTaskClick={setSelectedTask}
                updateTaskMutation={updateTaskMutation}
                primaryGroupBy={primaryGroupBy}
                secondaryGroupBy={secondaryGroupBy}
                commentCountByTaskId={commentCountByTaskId}
                partsProgressByTaskId={partsProgressByTaskId}
                selectedTypes={selectedTypes}
                statusFilter={statusFilter}
                onToggleComplete={handleToggleComplete}
                onUpdateDueDate={handleUpdateDueDate}
                onUpdateStartDate={handleUpdateStartDate}
                onTogglePriority={wrappedTogglePriority}
              />
            </TabsContent>
          </Tabs>
          </div>
        </div>
      </MobileSafeAreaContainer>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* Mobile Filter Drawer */}
      <MobileFilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        onApply={handleApplyFilters}
        onClear={handleClearAllFilters}
        title="Filter Priorities"
      >
        <MobileFilterSection title="Project Status" badge={tempFilters?.statusFilter !== 'all' ? 1 : null}>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setTempFilters(prev => ({ ...prev, statusFilter: 'all' }))}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                tempFilters?.statusFilter === 'all' 
                  ? 'bg-red-600/20 border border-red-500/50 text-white' 
                  : 'bg-gray-800/50 text-gray-300'
              }`}
            >
              All Status
            </button>
            {projectStatuses.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setTempFilters(prev => ({ ...prev, statusFilter: s.id }))}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  tempFilters?.statusFilter === s.id 
                    ? 'bg-red-600/20 border border-red-500/50 text-white' 
                    : 'bg-gray-800/50 text-gray-300'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </MobileFilterSection>

        <MobileFilterSection title="Project Type" badge={tempFilters?.selectedTypes?.length || null}>
          <div className="space-y-2">
            {projectTypes.filter(t => t.active).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  const current = tempFilters?.selectedTypes || [];
                  setTempFilters(prev => ({
                    ...prev,
                    selectedTypes: current.includes(t.id)
                      ? current.filter(id => id !== t.id)
                      : [...current, t.id]
                  }));
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  tempFilters?.selectedTypes?.includes(t.id) 
                    ? 'bg-red-600/20 border border-red-500/50 text-white' 
                    : 'bg-gray-800/50 text-gray-300'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </button>
            ))}
          </div>
        </MobileFilterSection>

        <MobileFilterSection title="Assigned To" badge={tempFilters?.assignedTo?.length || null}>
          <div className="space-y-2">
            {activeTeamMembers.map(tm => (
              <button
                key={tm.id}
                type="button"
                onClick={() => {
                  const current = tempFilters?.assignedTo || [];
                  setTempFilters(prev => ({
                    ...prev,
                    assignedTo: current.includes(tm.id)
                      ? current.filter(id => id !== tm.id)
                      : [...current, tm.id]
                  }));
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  tempFilters?.assignedTo?.includes(tm.id) 
                    ? 'bg-red-600/20 border border-red-500/50 text-white' 
                    : 'bg-gray-800/50 text-gray-300'
                }`}
              >
                {tm.full_name}
                {tm.team_role && <span className="text-gray-400 ml-1">({tm.team_role})</span>}
              </button>
            ))}
          </div>
        </MobileFilterSection>
      </MobileFilterDrawer>

      {/* Mobile Sort Drawer */}
      <MobileSortDrawer
        isOpen={sortDrawerOpen}
        onClose={() => setSortDrawerOpen(false)}
        title="Group By"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-400 mb-2">Primary Grouping</p>
            <div className="space-y-2">
              <MobileSortOption
                label="Group by Project"
                value="project"
                selected={primaryGroupBy === 'project'}
                onSelect={setPrimaryGroupBy}
              />
              <MobileSortOption
                label="Group by Category"
                value="category"
                selected={primaryGroupBy === 'category'}
                onSelect={setPrimaryGroupBy}
              />
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-2">Secondary Grouping</p>
            <div className="space-y-2">
              <MobileSortOption
                label="Then by Status"
                value="status"
                selected={secondaryGroupBy === 'status'}
                onSelect={setSecondaryGroupBy}
              />
              <MobileSortOption
                label="Then by Assigned"
                value="assigned"
                selected={secondaryGroupBy === 'assigned'}
                onSelect={setSecondaryGroupBy}
              />
              {primaryGroupBy !== 'category' && (
                <MobileSortOption
                  label="Then by Category"
                  value="category"
                  selected={secondaryGroupBy === 'category'}
                  onSelect={setSecondaryGroupBy}
                />
              )}
              {primaryGroupBy !== 'project' && (
                <MobileSortOption
                  label="Then by Project"
                  value="project"
                  selected={secondaryGroupBy === 'project'}
                  onSelect={setSecondaryGroupBy}
                />
              )}
            </div>
          </div>
        </div>
      </MobileSortDrawer>

      {/* Priority Removal Confirmation */}
      <PriorityRemoveConfirm
        isOpen={!!pendingPriorityTask}
        onClose={() => setPendingPriorityTask(null)}
        onConfirm={handleConfirmPriorityRemoval}
        taskName={pendingPriorityTask?.name}
      />
    </>
  );
}