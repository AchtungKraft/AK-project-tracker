import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useDebounce } from "../parts/useDebounce";
import TaskHierarchyTree from "./TaskHierarchyTree";
import TasksBreadcrumb from "./TasksBreadcrumb";
import TaskCard from "../project/TaskCard";
import CreateTaskModal from "./CreateTaskModal";
import TaskDetailDrawer from "./TaskDetailDrawer";

const EXPLORER_STORAGE_KEY = 'achtung_tasks_explorer_state';

export default function TasksExplorerLayout() {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeType, setSelectedNodeType] = useState(null);
  const [hierarchyPath, setHierarchyPath] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [groupBy, setGroupBy] = useState('status');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  
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
        setGroupBy(state.groupBy || 'status');
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
        groupBy,
      }));
    } catch (e) {}
  }, [selectedNodeId, selectedNodeType, expandedNodes, groupBy]);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: async () => {
      const list = await base44.entities.ProjectType.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
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

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: buckets = [] } = useQuery({
    queryKey: ['kanbanBuckets', selectedNodeType === 'project' ? selectedNodeId : null],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: selectedNodeId }),
    enabled: selectedNodeType === 'project' && !!selectedNodeId,
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

  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);

  // Grouping logic
  const getCategoryPath = (categoryId) => {
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

  const getGroups = () => {
    if (groupBy === 'buckets') {
      const sortedBuckets = [...buckets].sort((a, b) => (a.order || 0) - (b.order || 0));
      const priorityTasks = filteredTasks.filter(t => t.is_priority);
      const grouped = [
        {
          id: 'priority',
          label: '🔥 PRIORITY',
          color: '#EF4444',
          tasks: priorityTasks,
          isPriority: true
        }
      ];

      sortedBuckets.forEach(bucket => {
        grouped.push({
          id: bucket.id,
          label: bucket.name,
          color: bucket.color,
          description: bucket.description,
          tasks: filteredTasks.filter(t => t.kanban_bucket_id === bucket.id)
        });
      });

      const bucketIds = sortedBuckets.map(b => b.id);
      const unassignedTasks = filteredTasks.filter(t => !t.is_priority && (!t.kanban_bucket_id || !bucketIds.includes(t.kanban_bucket_id)));
      
      grouped.push({
        id: 'unassigned',
        label: 'Unassigned Tasks',
        color: '#6B7280',
        tasks: unassignedTasks
      });

      return grouped;
    }

    const grouped = {};
    
    filteredTasks.forEach(task => {
      let groupKey, groupLabel, groupColor;
      
      if (groupBy === 'status') {
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
        groupLabel = getCategoryPath(task.category_id) || 'No Category';
        groupColor = category?.color || '#6B7280';
      } else if (groupBy === 'project') {
        const project = projects.find(p => p.id === task.project_id);
        groupKey = task.project_id || 'no-project';
        groupLabel = project?.name || 'No Project';
        groupColor = '#3B82F6';
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          id: groupKey,
          label: groupLabel,
          color: groupColor,
          tasks: []
        };
      }
      
      grouped[groupKey].tasks.push(task);
    });

    return Object.values(grouped);
  };

  const groups = getGroups();

  return (
    <>
      <div className="flex flex-col bg-black/20 rounded-lg border border-red-900/30 md:h-[calc(100vh-8rem)] md:overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Tasks</h2>
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
              projectTypes={projectTypes}
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

          {/* Right Pane - Tasks Kanban */}
          <div className="flex-1 flex flex-col md:overflow-hidden">
            {/* Toolbar */}
            <div className="p-3 border-b border-red-900/20 bg-gray-900/30">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-400">
                  {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
                </div>
                
                <div className="flex items-center gap-2">
                  <Select value={groupBy} onValueChange={setGroupBy}>
                    <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedNodeType === 'project' && (
                        <SelectItem value="buckets">Custom Buckets</SelectItem>
                      )}
                      <SelectItem value="status">Group by Status</SelectItem>
                      <SelectItem value="assigned">Group by Assigned</SelectItem>
                      <SelectItem value="category">Group by Category</SelectItem>
                      <SelectItem value="project">Group by Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Tasks Kanban Display */}
            <div className="flex-1 p-4 md:overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groups.map(group => (
                  <div key={group.id} className="w-full">
                    <div className={`bg-black/40 backdrop-blur-xl rounded-lg overflow-hidden ${
                      group.isPriority ? 'border-2 border-red-600 shadow-lg shadow-red-600/20' : 'border border-red-900/30'
                    }`}>
                      {/* Group Header */}
                      <div
                        className="p-3 border-b-2"
                        style={{
                          borderBottomColor: group.color,
                          backgroundColor: `${group.color}15`
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <h3
                            className="font-semibold text-sm"
                            style={{ color: group.color }}
                          >
                            {group.label}
                          </h3>
                          <span className="text-xs text-gray-400">
                            {group.tasks.length}
                          </span>
                        </div>
                        {group.description && (
                          <p className="text-xs text-gray-500 mt-1">{group.description}</p>
                        )}
                      </div>

                      {/* Tasks */}
                      <div className="min-h-[200px] max-h-[600px] overflow-y-auto">
                        {group.tasks.length === 0 ? (
                          <p className="text-center text-gray-600 text-sm py-8">
                            {group.isPriority ? 'No priority tasks' : group.id === 'unassigned' ? 'No unassigned tasks' : 'No tasks'}
                          </p>
                        ) : (
                          <div className="p-3 space-y-2">
                            {group.tasks.map(task => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                categories={categories}
                                teamMembers={teamMembers}
                                statuses={statuses}
                                onClick={() => setSelectedTask(task)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
          projectId={selectedTask?.project_id}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}