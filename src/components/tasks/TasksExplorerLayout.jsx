import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useDebounce } from "../parts/useDebounce";
import TaskHierarchyTree from "./TaskHierarchyTree";
import TasksGrid from "./TasksGrid";
import TasksListView from "./TasksListView";
import TasksViewToolbar from "./TasksViewToolbar";
import TasksBreadcrumb from "./TasksBreadcrumb";
import CreateTaskModal from "./CreateTaskModal";
import TaskDetailDrawer from "./TaskDetailDrawer";

const EXPLORER_STORAGE_KEY = 'achtung_tasks_explorer_state';

export default function TasksExplorerLayout() {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeType, setSelectedNodeType] = useState(null);
  const [hierarchyPath, setHierarchyPath] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [showGrouping, setShowGrouping] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Load saved state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXPLORER_STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        setSelectedNodeId(state.selectedNodeId || null);
        setSelectedNodeType(state.selectedNodeType || null);
        setExpandedNodes(state.expandedNodes || {});
        setViewMode(state.viewMode || 'list');
        setShowGrouping(state.showGrouping !== undefined ? state.showGrouping : true);
      }
    } catch (e) {}
  }, []);

  // Save state
  useEffect(() => {
    try {
      localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify({
        selectedNodeId,
        selectedNodeType,
        expandedNodes,
        viewMode,
        showGrouping,
      }));
    } catch (e) {}
  }, [selectedNodeId, selectedNodeType, expandedNodes, viewMode, showGrouping]);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date'),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: async () => {
      const list = await base44.entities.TaskCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  // Build hierarchy path
  useEffect(() => {
    if (selectedNodeId && selectedNodeType) {
      const path = [];
      
      if (selectedNodeType === 'project') {
        const project = projects.find(p => p.id === selectedNodeId);
        if (project) {
          path.push({ id: project.id, name: project.name, type: 'project' });
        }
      } else if (selectedNodeType === 'category') {
        let currentId = selectedNodeId;
        while (currentId) {
          const cat = categories.find(c => c.id === currentId);
          if (!cat) break;
          path.unshift({ id: cat.id, name: cat.name, type: 'category', color: cat.color });
          currentId = cat.parent_id;
        }
      }
      
      setHierarchyPath(path);
    } else {
      setHierarchyPath([]);
    }
  }, [selectedNodeId, selectedNodeType, projects, categories]);

  const handleNodeSelect = (nodeId, nodeType) => {
    setSelectedNodeId(nodeId);
    setSelectedNodeType(nodeType);
  };

  const handleBreadcrumbClick = (nodeId, nodeType) => {
    setSelectedNodeId(nodeId);
    setSelectedNodeType(nodeType);
  };

  const handleToggleExpand = (nodeId) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  // Helper to get all descendant category IDs
  const getAllDescendantCategoryIds = (categoryId, allCategories) => {
    const descendants = new Set();
    const queue = [categoryId];
    
    while (queue.length > 0) {
      const current = queue.shift();
      descendants.add(current);
      allCategories.forEach(cat => {
        if (cat.parent_id === current && !descendants.has(cat.id)) {
          queue.push(cat.id);
        }
      });
    }
    return Array.from(descendants);
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = debouncedSearchTerm ? (
      task.name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    ) : true;
    
    if (!selectedNodeId) {
      return matchesSearch;
    }
    
    if (selectedNodeType === 'project') {
      return matchesSearch && task.project_id === selectedNodeId;
    }
    
    if (selectedNodeType === 'category') {
      const relevantCategoryIds = getAllDescendantCategoryIds(selectedNodeId, categories);
      return matchesSearch && relevantCategoryIds.includes(task.category_id);
    }
    
    return matchesSearch;
  });

  // Pagination
  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTasks = filteredTasks.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, selectedNodeId]);

  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Tasks Explorer</h2>
              <p className="text-xs text-gray-400">
                {filteredTasks.length} tasks {selectedNodeId ? 'filtered' : 'total'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            size="sm"
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Task</span>
          </Button>
        </div>

        {/* Breadcrumb */}
        {hierarchyPath.length > 0 && (
          <div className="px-3 py-2 bg-gray-900/50 border-b border-red-900/20">
            <TasksBreadcrumb
              path={hierarchyPath}
              onNavigate={handleBreadcrumbClick}
              onClearSelection={() => {
                setSelectedNodeId(null);
                setSelectedNodeType(null);
              }}
            />
          </div>
        )}

        {/* Split Pane Layout - Desktop: side-by-side, Mobile: stacked */}
        <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
          {/* Left Pane - Hierarchy Tree */}
          <div 
            className="
              flex
              w-full md:w-[30%] lg:w-[25%] 
              flex-col border-b md:border-b-0 md:border-r border-red-900/30 bg-black/20
              max-h-[40vh] md:max-h-none
            "
          >
            <TaskHierarchyTree
              projects={projects}
              tasks={tasks}
              categories={categories}
              selectedNodeId={selectedNodeId}
              selectedNodeType={selectedNodeType}
              expandedNodes={expandedNodes}
              searchTerm={searchTerm}
              onNodeSelect={handleNodeSelect}
              onToggleExpand={handleToggleExpand}
              onSearchChange={setSearchTerm}
            />
          </div>

          {/* Right Pane - Tasks List */}
          <div className="flex-1 flex flex-col md:overflow-hidden">
            {/* Toolbar */}
            <div className="p-3 border-b border-red-900/20 bg-gray-900/30">
              <TasksViewToolbar
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showGrouping={showGrouping}
                onToggleGrouping={() => setShowGrouping(!showGrouping)}
                tasksCount={filteredTasks.length}
              />
            </div>

            {/* Tasks Display */}
            <div className="flex-1 flex flex-col md:overflow-hidden">
              <div className="flex-1 p-4 md:overflow-y-auto">
                {viewMode === 'cards' ? (
                  <TasksGrid
                    tasks={paginatedTasks}
                    projects={projects}
                    categories={categories}
                    selectedNodeId={selectedNodeId}
                    onTaskClick={(task) => setSelectedTask(task)}
                  />
                ) : (
                  <TasksListView
                    tasks={paginatedTasks}
                    projects={projects}
                    categories={categories}
                    selectedNodeId={selectedNodeId}
                    onTaskClick={(task) => setSelectedTask(task)}
                    showGrouping={showGrouping}
                  />
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-red-900/20 bg-gray-900/30 p-3 flex items-center justify-between">
                  <div className="text-xs text-gray-400">
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredTasks.length)} of {filteredTasks.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-8 px-3 text-xs"
                    >
                      Previous
                    </Button>
                    <div className="text-xs text-gray-400">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 px-3 text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <CreateTaskModal 
          projectId={selectedNodeType === 'project' ? selectedNodeId : null}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}