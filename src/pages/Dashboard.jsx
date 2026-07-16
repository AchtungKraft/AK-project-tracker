import React, { useState, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, RefreshCw, LayoutGrid, List, X, Check, User } from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import MobileFilterTriggerBar, { useActiveFilterCount } from "@/components/mobile/MobileFilterTriggerBar";
import MobileFilterDrawer, { MobileFilterSection } from "@/components/mobile/MobileFilterDrawer";
import MobileSortDrawer, { MobileSortOption } from "@/components/mobile/MobileSortDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CreateProjectStartModal from "../components/dashboard/CreateProjectStartModal";
import ProjectCard from "../components/dashboard/ProjectCard";
import ProjectListView from "../components/dashboard/ProjectListView";
import EditProjectModal from "../components/dashboard/EditProjectModal";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedProjectViews } from "@/components/common/useSavedProjectViews";
import SavedViewsSelector from "@/components/common/SavedViewsSelector";
import { useFilterState, DASHBOARD_DEFAULTS } from "@/components/common/useFilterState";
import { operationalDataConfig, referenceDataConfig } from "@/components/common/queryConfig";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [sortDrawerOpen, setSortDrawerOpen] = useState(false);
  
  // Temporary filter state for drawer (applied on "Apply")
  const [tempFilters, setTempFilters] = useState(null);

  // Unified filter state with URL/localStorage persistence
  const { filters, setFilter, clearFilters: clearFilterState, applyView } = useFilterState('dashboard', DASHBOARD_DEFAULTS);
  const { selectedTypes, statusFilter, assignedTo, groupBy, viewMode } = filters;

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

  // Filter change handlers
  const handleStatusFilterChange = useCallback((value) => {
    setFilter('statusFilter', value);
  }, [setFilter]);

  const handleSelectedTypesChange = useCallback((newTypes) => {
    setFilter('selectedTypes', newTypes);
  }, [setFilter]);

  const handleGroupByChange = useCallback((value) => {
    setFilter('groupBy', value);
  }, [setFilter]);

  const handleViewModeChange = useCallback((value) => {
    setFilter('viewMode', value);
  }, [setFilter]);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    clearFilterState();
    selectView('All Projects');
  }, [clearFilterState, selectView]);

  // PHASE 1: Apply extended caching to prevent refetch storms
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
    ...operationalDataConfig,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: async () => {
      const list = await base44.entities.StatusList.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    ...referenceDataConfig,
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: async () => {
      const list = await base44.entities.ProjectType.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    ...referenceDataConfig,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: async () => {
      const list = await base44.entities.TeamMember.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    ...referenceDataConfig,
  });

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

  // Get active team members sorted by sort_order for the Assigned To filter
  const activeTeamMembers = useMemo(() => {
    return teamMembers
      .filter(tm => tm.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [teamMembers]);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.vin?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status_id === statusFilter;
    const matchesType = selectedTypes.length === 0 || selectedTypes.includes(p.project_type_id);
    // Filter by assigned team members (OR logic - show if ANY team member in assigned_team matches)
    const matchesAssigned = assignedTo.length === 0 || 
      (p.assigned_team && p.assigned_team.some(memberId => assignedTo.includes(memberId)));
    return matchesSearch && matchesStatus && matchesType && matchesAssigned;
  });

  // Group projects
  const groupedProjects = {};
  filteredProjects.forEach(project => {
    let groupKey = 'Ungrouped';
    let groupColor = '#6B7280';
    
    if (groupBy === 'projectType') {
      const projectType = projectTypes.find(t => t.id === project.project_type_id);
      groupKey = projectType?.name || 'No Type';
      groupColor = projectType?.color || '#6B7280';
    } else if (groupBy === 'status') {
      const status = statuses.find(s => s.id === project.status_id);
      groupKey = status?.label || 'No Status';
      groupColor = status?.color || '#6B7280';
    } else if (groupBy === 'client') {
      groupKey = project.client_name || 'No Client';
      groupColor = '#3B82F6';
    }
    
    if (!groupedProjects[groupKey]) {
      groupedProjects[groupKey] = { projects: [], color: groupColor };
    }
    groupedProjects[groupKey].projects.push(project);
  });

  return (
    <MobileSafeAreaContainer>
      <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black ${isMobile ? 'p-2' : 'p-3 md:p-6'}`}>
        <div className={`max-w-7xl mx-auto ${isMobile ? 'space-y-2' : 'space-y-4'}`}>
          {/* Header */}
          <div className={`flex flex-col md:flex-row justify-between items-start md:items-center ${isMobile ? 'gap-2 mb-2' : 'gap-3'}`}>
            <div>
              <h1 className={`font-bold text-white ${isMobile ? 'text-xl mb-0.5' : 'text-2xl md:text-3xl mb-1'}`}>
                PROJECT DASHBOARD
              </h1>
              <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>Ächtung Kraft Project Tracking Platform</p>
            </div>
            {isMobile ? (
              <div className="flex items-center gap-2 w-full">
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="flex-1 h-[44px] bg-red-600 hover:bg-red-700 gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  New
                </Button>
                <Button
                  onClick={async () => {
                    setIsRefreshing(true);
                    await queryClient.invalidateQueries();
                    setIsRefreshing(false);
                  }}
                  variant="outline"
                  className="flex-1 h-[44px] border-gray-700 text-white gap-2 text-sm"
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    setIsRefreshing(true);
                    await queryClient.invalidateQueries();
                    setIsRefreshing(false);
                  }}
                  variant="outline"
                  className="border-gray-700 text-white gap-2"
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-red-600 hover:bg-red-700 gap-2"
                >
                  <Plus className="w-5 h-5" />
                  New Project
                </Button>
              </div>
            )}
          </div>

        {/* Mobile Filter Trigger Bar */}
        <MobileFilterTriggerBar
          activeFilterCount={activeFilterCount}
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          onFilterClick={handleOpenFilterDrawer}
          onSortClick={() => setSortDrawerOpen(true)}
          searchPlaceholder="Search projects..."
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Search */}
              <div className="md:col-span-4 lg:col-span-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                  />
                </div>
              </div>

              {/* Group By */}
              <div>
                <Select value={groupBy} onValueChange={handleGroupByChange}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="Group By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="projectType">Group by Type</SelectItem>
                    <SelectItem value="status">Group by Status</SelectItem>
                    <SelectItem value="client">Group by Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div>
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {projectStatuses.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type Filter - Multi-select */}
              <div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between bg-gray-900/50 border-gray-700 text-white hover:bg-gray-800"
                    >
                      <span className="truncate">
                        {selectedTypes.length === 0 
                          ? 'All Types' 
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
              </div>

              {/* Assigned To Multi-Select */}
              <div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      className={`w-full justify-between bg-gray-900/50 border-gray-700 text-white hover:bg-gray-800 ${assignedTo.length > 0 ? 'border-cyan-500/50' : ''}`}
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
              </div>

              {/* Clear Filters */}
              {(searchTerm || statusFilter !== 'all' || selectedTypes.length > 0 || assignedTo.length > 0 || groupBy !== 'projectType') && (
                <div>
                  <Button
                    variant="ghost"
                    onClick={clearFilters}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </div>
        </MobileFilterTriggerBar>

        {/* View Tabs */}
        <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-4'}`}>
          <Tabs value={viewMode} onValueChange={handleViewModeChange} className="w-auto">
            <TabsList className={`bg-gray-900/50 border border-gray-700 ${isMobile ? 'h-9' : ''}`}>
              <TabsTrigger value="cards" className={`gap-2 data-[state=active]:bg-red-600 ${isMobile ? 'h-7 px-2 text-xs' : ''}`}>
                <LayoutGrid className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                <span className="hidden sm:inline">Cards</span>
              </TabsTrigger>
              <TabsTrigger value="list" className={`gap-2 data-[state=active]:bg-red-600 ${isMobile ? 'h-7 px-2 text-xs' : ''}`}>
                <List className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                <span className="hidden sm:inline">List</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
            {isMobile && statusFilter !== 'all' && ` • ${projectStatuses.find(s => s.id === statusFilter)?.label || 'Filtered'}`}
          </span>
        </div>

        {/* Projects Content */}
        {projectsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {Array(6).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-48 md:h-96 bg-gray-800" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg p-8 text-center">
            <p className="text-gray-500 text-lg">No projects found</p>
            <p className="text-gray-600 mt-2">Create your first project to get started</p>
          </div>
        ) : viewMode === 'list' ? (
          <ProjectListView
            groupedProjects={groupedProjects}
            statuses={statuses}
            projectTypes={projectTypes}
            teamMembers={teamMembers}
            groupBy={groupBy}
            onEdit={setEditingProject}
          />
        ) : (
          <div className={isMobile ? 'space-y-4' : 'space-y-6'}>
            {Object.entries(groupedProjects).sort((a, b) => {
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
            }).map(([groupLabel, groupData]) => {
              const { projects: groupProjects, color: groupColor } = groupData;
              
              return (
                <div key={groupLabel}>
                  <div className={`border-b-2 border-l-4 pl-3 ${isMobile ? 'mb-2 pb-1' : 'mb-4 pb-2'}`} style={{ borderColor: groupColor }}>
                    <h2 className={`font-bold ${isMobile ? 'text-base' : 'text-xl'}`} style={{ color: groupColor }}>
                      {groupLabel} ({groupProjects.length})
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                    {groupProjects.map(project => {
                      const status = statuses.find(s => s.id === project.status_id);
                      const projectType = projectTypes.find(t => t.id === project.project_type_id);
                      
                      return (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          status={status}
                          projectType={projectType}
                          teamMembers={teamMembers}
                          onEdit={setEditingProject}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateProjectStartModal onClose={() => setShowCreateModal(false)} />
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}
      </div>

      {/* Mobile Filter Drawer */}
      <MobileFilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        onApply={handleApplyFilters}
        onClear={handleClearAllFilters}
        title="Filter Projects"
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
        <div className="space-y-2">
          <MobileSortOption
            label="Group by Type"
            value="projectType"
            selected={groupBy === 'projectType'}
            onSelect={handleGroupByChange}
          />
          <MobileSortOption
            label="Group by Status"
            value="status"
            selected={groupBy === 'status'}
            onSelect={handleGroupByChange}
          />
          <MobileSortOption
            label="Group by Client"
            value="client"
            selected={groupBy === 'client'}
            onSelect={handleGroupByChange}
          />
        </div>
      </MobileSortDrawer>
    </MobileSafeAreaContainer>
  );
}