/**
 * Groups projects by their ProjectType, matching Dashboard grouping logic.
 * Returns groups sorted by ProjectType.sort_order, each with sorted projects.
 * Empty groups (no matching tasks) can be filtered downstream.
 */
export function groupProjectsByType(projects, projectTypes) {
  const typeMap = {};
  
  projects.forEach(project => {
    const pt = projectTypes.find(t => t.id === project.project_type_id);
    const key = pt?.id || '__no_type__';
    if (!typeMap[key]) {
      typeMap[key] = {
        typeId: key,
        typeName: pt?.name || 'No Type',
        typeColor: pt?.color || '#6B7280',
        sortOrder: pt?.sort_order ?? 9999,
        projects: [],
      };
    }
    typeMap[key].projects.push(project);
  });

  return Object.values(typeMap)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(group => ({
      ...group,
      // Sort projects within each group alphabetically
      projects: group.projects.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }));
}