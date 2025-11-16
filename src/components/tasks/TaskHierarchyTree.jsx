import React, { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, ChevronDown, FolderOpen, Folder, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TaskHierarchyTree({
  projects,
  projectTypes,
  tasks,
  categories,
  selectedNodeId,
  selectedNodeType,
  expandedNodes,
  searchTerm,
  onNodeSelect,
  onToggleExpand,
  onSearchChange,
}) {
  const [showEmptyNodes, setShowEmptyNodes] = React.useState(false);

  // Calculate task counts for each node
  const nodeCounts = useMemo(() => {
    const counts = { projects: {}, categories: {} };
    
    // Count tasks per project
    tasks.forEach(task => {
      if (task.project_id) {
        counts.projects[task.project_id] = (counts.projects[task.project_id] || 0) + 1;
      }
    });

    // Count tasks per category (direct)
    tasks.forEach(task => {
      if (task.category_id) {
        counts.categories[task.category_id] = (counts.categories[task.category_id] || 0) + 1;
      }
    });

    // Recursive count for parent categories
    const addDescendantCounts = (categoryId) => {
      const children = categories.filter(c => c.parent_id === categoryId);
      let totalCount = counts.categories[categoryId] || 0;
      
      children.forEach(child => {
        totalCount += addDescendantCounts(child.id);
      });
      
      counts.categories[categoryId] = totalCount;
      return totalCount;
    };

    // Calculate for all root categories
    categories.filter(c => !c.parent_id).forEach(cat => {
      addDescendantCounts(cat.id);
    });

    return counts;
  }, [tasks, projects, categories]);

  // Filter nodes based on search
  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const term = searchTerm.toLowerCase();
    return projects.filter(p => p.name?.toLowerCase().includes(term));
  }, [projects, searchTerm]);

  const filteredCategories = useMemo(() => {
    if (!searchTerm) return categories;
    const term = searchTerm.toLowerCase();
    return categories.filter(c => c.name?.toLowerCase().includes(term));
  }, [categories, searchTerm]);

  const renderProject = (project, level = 0) => {
    const isSelected = selectedNodeType === 'project' && selectedNodeId === project.id;
    const taskCount = nodeCounts.projects[project.id] || 0;
    const isEmpty = taskCount === 0;

    if (isEmpty && !showEmptyNodes && !searchTerm) return null;

    const projectType = projectTypes.find(pt => pt.id === project.project_type_id);

    return (
      <div
        key={project.id}
        className={cn(
          "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group",
          isSelected ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300",
          level > 0 && "border-l-2 border-gray-800",
          isEmpty && "opacity-50"
        )}
        style={{
          paddingLeft: `${(level * 16) + 12}px`,
          borderLeftColor: level > 0 && projectType?.color ? projectType.color + '40' : 'transparent'
        }}
        onClick={() => !isEmpty && onNodeSelect(project.id, 'project')}
        title={isEmpty ? "No tasks in this project" : undefined}
      >
        <FolderKanban className="w-4 h-4 shrink-0" style={{ color: projectType?.color || '#3B82F6' }} />
        
        <span 
          className={cn(
            "flex-1 text-sm font-medium truncate",
            isSelected && "font-semibold text-red-400"
          )}
        >
          {project.name}
        </span>

        {taskCount > 0 && (
          <span 
            className={cn(
              "shrink-0 text-xs px-2 py-0.5 rounded-full",
              isSelected ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"
            )}
          >
            {taskCount}
          </span>
        )}
      </div>
    );
  };

  const renderProjectType = (projectType, level = 0) => {
    const children = projectTypes.filter(pt => pt.parent_id === projectType.id && pt.active);
    const hasChildren = children.length > 0;
    const nodeKey = `type-${projectType.id}`;
    const isExpanded = expandedNodes[nodeKey];

    // Get projects for this type
    const typeProjects = filteredProjects.filter(p => p.project_type_id === projectType.id);
    
    // Calculate total tasks for this type (including child types)
    const getAllTypeProjects = (typeId) => {
      const directProjects = projects.filter(p => p.project_type_id === typeId);
      const childTypes = projectTypes.filter(pt => pt.parent_id === typeId);
      let allProjects = [...directProjects];
      childTypes.forEach(ct => {
        allProjects = allProjects.concat(getAllTypeProjects(ct.id));
      });
      return allProjects;
    };

    const allTypeProjects = getAllTypeProjects(projectType.id);
    const totalTasks = allTypeProjects.reduce((sum, p) => sum + (nodeCounts.projects[p.id] || 0), 0);
    const isEmpty = totalTasks === 0;

    if (isEmpty && !showEmptyNodes && !searchTerm) return null;

    return (
      <div key={projectType.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 transition-colors group",
            level > 0 && "border-l-2 border-gray-800",
            isEmpty && "opacity-50"
          )}
          style={{
            paddingLeft: `${(level * 16) + 12}px`,
            borderLeftColor: level > 0 ? projectType.color + '40' : 'transparent'
          }}
        >
          {(hasChildren || typeProjects.length > 0) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(nodeKey);
              }}
              className="shrink-0 hover:text-red-400 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}

          <div className="shrink-0">
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4" style={{ color: projectType.color }} />
              ) : (
                <Folder className="w-4 h-4" style={{ color: projectType.color }} />
              )
            ) : (
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: projectType.color + '50' }} />
            )}
          </div>

          <span 
            className="flex-1 text-sm font-medium text-gray-300 truncate"
            style={{ color: projectType.color }}
          >
            {projectType.name}
          </span>

          {totalTasks > 0 && (
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              {totalTasks}
            </span>
          )}
        </div>

        {isExpanded && (
          <div>
            {typeProjects.map(project => renderProject(project, level + 1))}
            {children.map(child => renderProjectType(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderCategory = (category, level = 0) => {
    const children = filteredCategories.filter(c => c.parent_id === category.id && c.active);
    const hasChildren = children.length > 0;
    const nodeKey = `cat-${category.id}`;
    const isExpanded = expandedNodes[nodeKey];
    const isSelected = selectedNodeType === 'category' && selectedNodeId === category.id;
    const taskCount = nodeCounts.categories[category.id] || 0;
    const isEmpty = taskCount === 0;

    if (isEmpty && !showEmptyNodes && !searchTerm) return null;

    return (
      <div key={category.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group",
            isSelected ? "bg-red-950/40 text-red-400" : "hover:bg-gray-800/50 text-gray-300",
            level > 0 && "border-l-2 border-gray-800",
            isEmpty && "opacity-50"
          )}
          style={{
            paddingLeft: `${(level * 16) + 12}px`,
            borderLeftColor: level > 0 ? category.color + '40' : 'transparent'
          }}
          onClick={() => !isEmpty && onNodeSelect(category.id, 'category')}
          title={isEmpty ? "No tasks in this category" : undefined}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(nodeKey);
              }}
              className="shrink-0 hover:text-red-400 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
          
          <div className="shrink-0">
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4" style={{ color: category.color }} />
              ) : (
                <Folder className="w-4 h-4" style={{ color: category.color }} />
              )
            ) : (
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: category.color + '50' }} />
            )}
          </div>

          <span 
            className={cn(
              "flex-1 text-sm font-medium truncate",
              isSelected && "font-semibold"
            )}
            style={{ color: isSelected ? category.color : undefined }}
          >
            {category.name}
          </span>

          {taskCount > 0 && (
            <span 
              className={cn(
                "shrink-0 text-xs px-2 py-0.5 rounded-full",
                isSelected ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"
              )}
            >
              {taskCount}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootCategories = filteredCategories.filter(c => !c.parent_id && c.active);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-red-900/20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search projects & categories..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 bg-gray-900/50 border-gray-700 text-white text-sm"
          />
        </div>
      </div>

      {/* Hierarchy Tree */}
      <div className="flex-1 overflow-y-auto">
        {/* Projects Section */}
        <div className="py-2">
          <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Projects
          </div>
          {projectTypes.filter(pt => !pt.parent_id && pt.active).length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-500 text-sm">
              {searchTerm ? 'No projects found' : 'No projects'}
            </div>
          ) : (
            <div>
              {projectTypes
                .filter(pt => !pt.parent_id && pt.active)
                .map(projectType => renderProjectType(projectType, 0))}
            </div>
          )}
        </div>

        {/* Categories Section */}
        <div className="py-2 border-t border-red-900/20">
          <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Categories
          </div>
          {rootCategories.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-500 text-sm">
              {searchTerm ? 'No categories found' : 'No categories'}
            </div>
          ) : (
            <div>
              {rootCategories.map(category => renderCategory(category, 0))}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="p-3 border-t border-red-900/20 space-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={showEmptyNodes}
            onChange={(e) => setShowEmptyNodes(e.target.checked)}
            className="rounded border-gray-700 bg-gray-900 text-red-600 focus:ring-red-600"
          />
          Show empty items
        </label>
        {selectedNodeId && (
          <button
            onClick={() => onNodeSelect(null, null)}
            className="w-full text-sm text-gray-400 hover:text-red-400 transition-colors text-left"
          >
            Clear Selection (Show All)
          </button>
        )}
      </div>
    </div>
  );
}