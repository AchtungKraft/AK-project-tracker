import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Loader2,
  Menu,
  LayoutGrid,
  User,
  X,
  ArrowUpDown,
  Wrench,
  Clock,
  MessageSquareText,
  CheckCircle2,
  LayoutDashboard,
  Calendar,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import MobileFilterTriggerBar, { useActiveFilterCount } from "@/components/mobile/MobileFilterTriggerBar";
import MobileFilterDrawer, { MobileFilterSection } from "@/components/mobile/MobileFilterDrawer";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSavedProjectViews } from "@/components/common/useSavedProjectViews";
import SavedViewsSelector from "@/components/common/SavedViewsSelector";
import { useFilterState, CLIENT_PORTAL_DEFAULTS } from "@/components/common/useFilterState";
import NeedsAttentionSection from "@/components/clientportal/NeedsAttentionSection";
import ClientPortalAdminTab from "@/components/clientportal/ClientPortalAdminTab";
import ProjectLifecycleCard from "@/components/clientportal/ProjectLifecycleCard";
import ClientPortalCalendarView from "@/components/clientportal/ClientPortalCalendarView";
import { 
  groupRequestsByProjectAndLifecycle, 
  SORT_MODE_OPTIONS,
  isRequestOverdue,
  filterByLifecycleQuickFilter,
  flattenGroupedRequests
} from "@/components/clientportal/lifecycleHelpers";

export default function ClientPortalHub() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [sendingEmailForProject, setSendingEmailForProject] = useState(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [tempFilters, setTempFilters] = useState(null);
  const [sortMode, setSortMode] = useState('due_date');
  const [lifecycleQuickFilter, setLifecycleQuickFilter] = useState('all');
  const [boardViewMode, setBoardViewMode] = useState(() => {
    return localStorage.getItem('clientportal_board_view') || 'card';
  });
  
  // Persist board view mode
  const handleBoardViewModeChange = useCallback((mode) => {
    setBoardViewMode(mode);
    localStorage.setItem('clientportal_board_view', mode);
  }, []);
  
  // Toggle lifecycle quick filter
  const toggleLifecycleFilter = useCallback((bucket) => {
    setLifecycleQuickFilter(prev => prev === bucket ? 'all' : bucket);
  }, []);
  
  // Handle due date updates for requests
  const handleUpdateRequestDueDate = useCallback(async (requestId, newDate) => {
    try {
      await base44.entities.ClientFeedbackRequest.update(requestId, {
        due_date: newDate
      });
      queryClient.invalidateQueries({ queryKey: ['allFeedbackRequests'] });
      toast.success(newDate ? 'Due date updated' : 'Due date cleared');
    } catch (error) {
      console.error('Error updating due date:', error);
      toast.error('Failed to update due date');
    }
  }, [queryClient]);

  // Unified filter state with URL/localStorage persistence
  const { filters, setFilter, applyView, clearFilters } = useFilterState('clientportal', CLIENT_PORTAL_DEFAULTS);
  const { selectedTypes, statusFilter, assignedTo, viewMode, tab: activeTab } = filters;

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

  // Handle saved view selection
  const handleSelectView = useCallback((name) => {
    const view = selectView(name);
    if (view) {
      applyView(view);
    }
  }, [selectView, applyView]);

  const handleViewModeChange = useCallback((mode) => {
    setFilter('viewMode', mode);
  }, [setFilter]);

  const handleTabChange = useCallback((tab) => {
    setFilter('tab', tab);
  }, [setFilter]);

  const handleSendBulkEmail = async (projectId, requestIds) => {
    setSendingEmailForProject(projectId);
    try {
      const response = await base44.functions.invoke('sendBulkReviewEmail', { projectId, requestIds });
      if (response.data?.success) {
        toast.success(`Email sent to ${response.data.emailsSent} client(s)`);
        queryClient.invalidateQueries({ queryKey: ["allFeedbackRequests"] });
      } else {
        toast.error(response.data?.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Error sending bulk email:', error);
      toast.error('Failed to send email');
    } finally {
      setSendingEmailForProject(null);
    }
  };

  // Fetch all data
  const { data: allRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ["allFeedbackRequests"],
    queryFn: () => base44.entities.ClientFeedbackRequest.list(),
    refetchOnMount: 'always',
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["allFeedbackDecisions"],
    queryFn: () => base44.entities.ClientFeedbackDecision.list(),
    refetchOnMount: 'always',
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["allFeedbackAttachments"],
    queryFn: () => base44.entities.ClientFeedbackAttachment.list(),
    refetchOnMount: 'always',
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["allFeedbackComments"],
    queryFn: () => base44.entities.ClientFeedbackComment.list(),
    refetchOnMount: 'always',
  });

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: projectClientAccesses = [] } = useQuery({
    queryKey: ["projectClientAccesses"],
    queryFn: () => base44.entities.ProjectClientAccess.list(),
  });

  const { data: clientContacts = [] } = useQuery({
    queryKey: ["clientContacts"],
    queryFn: () => base44.entities.ClientContact.list(),
  });

  // Helper to get primary client slug for a project
  const getProjectClientSlug = useCallback((projectId) => {
    const accesses = projectClientAccesses.filter(
      pa => pa.project_id === projectId && pa.access_status === 'active'
    );
    for (const access of accesses) {
      const contact = clientContacts.find(c => c.id === access.client_contact_id);
      if (contact?.url_slug) return contact.url_slug;
      if (access.url_slug) return access.url_slug;
    }
    return null;
  }, [projectClientAccesses, clientContacts]);

  const { data: projectTypes = [] } = useQuery({
    queryKey: ["projectTypes"],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses"],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);

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

  // Get active team members sorted by sort_order
  const activeTeamMembers = useMemo(() => {
    return teamMembers
      .filter(tm => tm.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [teamMembers]);

  // Filter requests for lifecycle board (excludes archived)
  const lifecycleRequests = useMemo(() => {
    return allRequests.filter(request => {
      // Never show archived on lifecycle board
      if (request.status === 'archived') return false;
      
      const project = projects.find(p => p.id === request.project_id);
      
      // Filter by project type
      if (selectedTypes.length > 0 && project && !selectedTypes.includes(project.project_type_id)) {
        return false;
      }
      
      // Filter by project status
      if (statusFilter !== 'all' && project && project.status_id !== statusFilter) {
        return false;
      }
      
      // Filter by assigned team (OR logic)
      if (assignedTo.length > 0 && project) {
        const projectTeam = project.assigned_team || [];
        if (!projectTeam.some(memberId => assignedTo.includes(memberId))) {
          return false;
        }
      }
      
      return true;
    });
  }, [allRequests, projects, selectedTypes, statusFilter, assignedTo]);

  // Filter requests for attention (includes archived - they may have new client activity)
  const attentionEligibleRequests = useMemo(() => {
    return allRequests.filter(request => {
      const project = projects.find(p => p.id === request.project_id);
      
      // Apply project filters only (not status filter on request)
      if (selectedTypes.length > 0 && project && !selectedTypes.includes(project.project_type_id)) {
        return false;
      }
      
      if (statusFilter !== 'all' && project && project.status_id !== statusFilter) {
        return false;
      }
      
      if (assignedTo.length > 0 && project) {
        const projectTeam = project.assigned_team || [];
        if (!projectTeam.some(memberId => assignedTo.includes(memberId))) {
          return false;
        }
      }
      
      return true;
    });
  }, [allRequests, projects, selectedTypes, statusFilter, assignedTo]);

  // Group requests by project and lifecycle bucket (for board display)
  const groupedProjectData = useMemo(() => {
    return groupRequestsByProjectAndLifecycle(
      lifecycleRequests,
      projects,
      decisions,
      attachments,
      comments,
      sortMode
    );
  }, [lifecycleRequests, projects, decisions, attachments, comments, sortMode]);

  // Group attention-eligible requests separately (includes archived with activity)
  const attentionProjectGroups = useMemo(() => {
    return groupRequestsByProjectAndLifecycle(
      attentionEligibleRequests,
      projects,
      decisions,
      attachments,
      comments,
      sortMode
    );
  }, [attentionEligibleRequests, projects, decisions, attachments, comments, sortMode]);

  // Calculate summary counts including overdue
  const summaryCounts = useMemo(() => {
    const counts = { draft: 0, awaiting_client: 0, client_replied: 0, approved: 0, overdue: 0 };
    groupedProjectData.forEach(group => {
      counts.draft += group.draft.length;
      counts.awaiting_client += group.awaiting_client.length;
      counts.client_replied += group.client_replied.length;
      counts.approved += group.approved.length;
      
      // Count overdue (only from awaiting_client and client_replied)
      group.awaiting_client.forEach(r => {
        if (isRequestOverdue(r, 'awaiting_client')) counts.overdue++;
      });
      group.client_replied.forEach(r => {
        if (isRequestOverdue(r, 'client_replied')) counts.overdue++;
      });
    });
    return counts;
  }, [groupedProjectData]);
  
  // Apply lifecycle quick filter
  const filteredProjectData = useMemo(() => {
    return filterByLifecycleQuickFilter(groupedProjectData, lifecycleQuickFilter);
  }, [groupedProjectData, lifecycleQuickFilter]);
  
  // Flatten for calendar view
  const flattenedRequests = useMemo(() => {
    return flattenGroupedRequests(filteredProjectData);
  }, [filteredProjectData]);

  const isLoading = loadingRequests || loadingProjects;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <MobileSafeAreaContainer>
      <div className={isMobile ? 'p-2 space-y-2' : 'p-3 md:p-6 space-y-4 md:space-y-6'}>
        {/* Header */}
        <div className={`flex items-center justify-between flex-wrap ${isMobile ? 'gap-2 mb-1' : 'gap-3'}`}>
          <div className="flex-1 min-w-0">
            <h1 className={`font-bold text-white flex items-center ${isMobile ? 'text-base gap-2' : 'text-xl md:text-3xl gap-2 md:gap-3'}`}>
              <Users className={isMobile ? 'w-4 h-4 text-red-500' : 'w-6 h-6 md:w-8 md:h-8 text-red-500'} />
              Client Portal
            </h1>
            <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-xs md:text-base mt-0.5 md:mt-1'}`}>
              <span className="hidden md:inline">Production Board — Manage client feedback requests</span>
              <span className="md:hidden truncate">
                {summaryCounts.client_replied > 0 
                  ? `${summaryCounts.client_replied} need response`
                  : 'Production Board'}
              </span>
            </p>
          </div>
          
          {/* Header Controls */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            {/* Saved Views */}
            <div className="hidden md:block">
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
            
            {/* Sort Mode Dropdown */}
            <Select value={sortMode} onValueChange={setSortMode}>
              <SelectTrigger className={`bg-gray-900/50 border-gray-700 text-white ${isMobile ? 'w-32 h-10' : 'w-44'}`}>
                <ArrowUpDown className="w-4 h-4 mr-2 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_MODE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Assigned To Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className={`justify-between bg-gray-900/50 border-gray-700 text-white hover:bg-gray-800 ${isMobile ? 'h-10' : ''} ${assignedTo.length > 0 ? 'border-cyan-500/50' : ''}`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <User className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">
                      {assignedTo.length === 0 
                        ? 'All Assignees' 
                        : assignedTo.length === 1 
                          ? activeTeamMembers.find(tm => tm.id === assignedTo[0])?.full_name || 'Assignee'
                          : `${assignedTo.length} Assignees`}
                    </span>
                    <span className="sm:hidden">
                      {assignedTo.length === 0 ? 'All' : assignedTo.length}
                    </span>
                  </span>
                  {assignedTo.length > 0 && (
                    <X 
                      className="w-4 h-4 ml-1 hover:text-red-400 shrink-0" 
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
        </div>

        {/* Mobile Filter Trigger */}
        {isMobile && (
          <MobileFilterTriggerBar
            activeFilterCount={activeFilterCount}
            searchValue=""
            onSearchChange={() => {}}
            onFilterClick={handleOpenFilterDrawer}
            showSort={false}
          >
            {null}
          </MobileFilterTriggerBar>
        )}

        {/* Mobile Saved Views */}
        <div className="md:hidden">
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

        {/* Summary KPI Row - Clickable Filters */}
        <div className="grid grid-cols-5 gap-2 md:gap-3">
          <Card 
            className={cn(
              "cursor-pointer transition-all hover:scale-[1.02]",
              "bg-slate-900/50 border-slate-700/50",
              lifecycleQuickFilter === 'draft' && "ring-2 ring-slate-400 shadow-lg shadow-slate-500/20"
            )}
            onClick={() => toggleLifecycleFilter('draft')}
          >
            <CardContent className="p-2 md:p-4 flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-slate-500/20 rounded-lg shrink-0">
                <Wrench className="w-4 h-4 md:w-5 md:h-5 text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold text-white">{summaryCounts.draft}</p>
                <p className="text-[10px] md:text-xs text-slate-400 truncate">Drafts</p>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={cn(
              "cursor-pointer transition-all hover:scale-[1.02]",
              "bg-amber-900/30 border-amber-700/50",
              lifecycleQuickFilter === 'awaiting_client' && "ring-2 ring-amber-400 shadow-lg shadow-amber-500/20"
            )}
            onClick={() => toggleLifecycleFilter('awaiting_client')}
          >
            <CardContent className="p-2 md:p-4 flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-amber-500/20 rounded-lg shrink-0">
                <Clock className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold text-white">{summaryCounts.awaiting_client}</p>
                <p className="text-[10px] md:text-xs text-amber-400 truncate">Awaiting</p>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={cn(
              "cursor-pointer transition-all hover:scale-[1.02]",
              "bg-blue-900/30 border-blue-700/50",
              lifecycleQuickFilter === 'client_replied' && "ring-2 ring-blue-400 shadow-lg shadow-blue-500/20"
            )}
            onClick={() => toggleLifecycleFilter('client_replied')}
          >
            <CardContent className="p-2 md:p-4 flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-blue-500/20 rounded-lg shrink-0">
                <MessageSquareText className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold text-white">{summaryCounts.client_replied}</p>
                <p className="text-[10px] md:text-xs text-blue-400 truncate">Replied</p>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={cn(
              "cursor-pointer transition-all hover:scale-[1.02]",
              "bg-green-900/30 border-green-700/50",
              lifecycleQuickFilter === 'approved' && "ring-2 ring-green-400 shadow-lg shadow-green-500/20"
            )}
            onClick={() => toggleLifecycleFilter('approved')}
          >
            <CardContent className="p-2 md:p-4 flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-green-500/20 rounded-lg shrink-0">
                <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold text-white">{summaryCounts.approved}</p>
                <p className="text-[10px] md:text-xs text-green-400 truncate">Approved</p>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={cn(
              "cursor-pointer transition-all hover:scale-[1.02]",
              "bg-red-900/30 border-red-700/50",
              lifecycleQuickFilter === 'overdue' && "ring-2 ring-red-400 shadow-lg shadow-red-500/20"
            )}
            onClick={() => toggleLifecycleFilter('overdue')}
          >
            <CardContent className="p-2 md:p-4 flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-red-500/20 rounded-lg shrink-0">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold text-white">{summaryCounts.overdue}</p>
                <p className="text-[10px] md:text-xs text-red-400 truncate">Overdue</p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Active Filter Indicator */}
        {lifecycleQuickFilter !== 'all' && (
          <div className="flex items-center gap-2">
            <Badge className="bg-gray-800 text-gray-300 border border-gray-600">
              Filtering: {lifecycleQuickFilter.replace('_', ' ')}
            </Badge>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setLifecycleQuickFilter('all')}
              className="text-gray-400 hover:text-white h-6 px-2"
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          </div>
        )}

        {/* Needs Attention Section - Uses lifecycle bucket data */}
        <NeedsAttentionSection
          projectGroups={attentionProjectGroups}
          lifecycleQuickFilter={lifecycleQuickFilter}
        />

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {/* Desktop Tabs */}
          <TabsList className="hidden md:flex bg-black/40 border border-gray-700 p-1 h-auto">
            <TabsTrigger 
              value="board" 
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Production Board
              <Badge className="bg-gray-700/50 text-gray-300 ml-1">
                {groupedProjectData.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="admin" 
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
            >
              <Users className="w-4 h-4" />
              Admin
            </TabsTrigger>
          </TabsList>

          {/* Mobile Tab Selector */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between border-gray-700 text-white bg-black/40">
                  <span className="flex items-center gap-2">
                    {activeTab === 'board' && <><LayoutDashboard className="w-4 h-4" /> Production Board</>}
                    {activeTab === 'admin' && <><Users className="w-4 h-4" /> Admin</>}
                  </span>
                  <Menu className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-gray-900 border-gray-700">
                <DropdownMenuItem 
                  onClick={() => handleTabChange('board')}
                  className={`gap-2 ${activeTab === 'board' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
                >
                  <LayoutDashboard className="w-4 h-4" /> Production Board
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleTabChange('admin')}
                  className={`gap-2 ${activeTab === 'admin' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
                >
                  <Users className="w-4 h-4" /> Admin
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Production Board Tab */}
          <TabsContent value="board" className="mt-6 space-y-4">
            {/* View Mode Toggle */}
            <div className="flex items-center justify-between">
              <Tabs value={boardViewMode} onValueChange={handleBoardViewModeChange}>
                <TabsList className="bg-gray-800/80 border border-gray-700 p-1 h-auto">
                  <TabsTrigger 
                    value="card" 
                    className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-1.5 text-xs md:text-sm"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span className="hidden sm:inline">Card View</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="calendar" 
                    className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-1.5 text-xs md:text-sm"
                  >
                    <Calendar className="w-4 h-4" />
                    <span className="hidden sm:inline">Calendar View</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              
              <p className="text-xs text-gray-500">
                {filteredProjectData.length} projects • {flattenedRequests.length} requests
              </p>
            </div>
            
            {/* Card View */}
            {boardViewMode === 'card' && (
              <>
                {filteredProjectData.length === 0 ? (
                  <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
                    <CardContent className="p-8 md:p-12 text-center">
                      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 mx-auto mb-4">
                        <LayoutDashboard className="w-8 h-8 text-gray-500" />
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">No Feedback Requests</h3>
                      <p className="text-gray-400">
                        {lifecycleQuickFilter !== 'all' 
                          ? `No requests match the "${lifecycleQuickFilter.replace('_', ' ')}" filter.`
                          : 'No feedback requests match the current filters.'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredProjectData.map((projectGroup, index) => (
                    <ProjectLifecycleCard
                      key={projectGroup.project?.id || `unknown-${index}`}
                      project={projectGroup.project}
                      buckets={{
                        draft: projectGroup.draft,
                        awaiting_client: projectGroup.awaiting_client,
                        client_replied: projectGroup.client_replied,
                        approved: projectGroup.approved
                      }}
                      getProjectClientSlug={getProjectClientSlug}
                      onSendBulkEmail={handleSendBulkEmail}
                      sendingEmailForProject={sendingEmailForProject}
                      onUpdateDueDate={handleUpdateRequestDueDate}
                      initialCollapsed={false}
                    />
                  ))
                )}
              </>
            )}
            
            {/* Calendar View */}
            {boardViewMode === 'calendar' && (
              <ClientPortalCalendarView
                requests={flattenedRequests}
                projects={projects}
                comments={comments}
                decisions={decisions}
                teamMembers={teamMembers}
                getProjectClientSlug={getProjectClientSlug}
                onUpdateDueDate={handleUpdateRequestDueDate}
              />
            )}
          </TabsContent>

          {/* Admin Tab */}
          <TabsContent value="admin" className="mt-6">
            <ClientPortalAdminTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Mobile Filter Drawer */}
      <MobileFilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        onApply={handleApplyFilters}
        onClear={handleClearAllFilters}
        title="Filter Client Portal"
      >
        <MobileFilterSection title="Project Status" badge={tempFilters?.statusFilter !== 'all' ? 1 : null}>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setTempFilters(prev => ({ ...prev, statusFilter: 'all' }))}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
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
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-2 text-sm ${
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
          <div className="space-y-1.5">
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
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-2 text-sm ${
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
          <div className="space-y-1.5">
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
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
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
    </MobileSafeAreaContainer>
  );
}