import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Shared Category Select dropdown
 * Displays hierarchical categories with colors and proper indentation
 */
export function TaskCategorySelect({ value, onValueChange, categories, className = "" }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={`bg-gray-800 border-gray-700 text-white ${className}`}>
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        {categories.map(cat => (
          <SelectItem key={cat.id} value={cat.id}>
            <span 
              className={cat.isChild ? "ml-4" : ""} 
              style={{ color: cat.color || undefined }}
            >
              {cat.isChild ? `→ ${cat.name}` : cat.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Shared Status Select dropdown
 * Displays statuses sorted by sort_order
 */
export function TaskStatusSelect({ value, onValueChange, statuses, className = "" }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={`bg-gray-800 border-gray-700 text-white ${className}`}>
        <SelectValue placeholder="Select status" />
      </SelectTrigger>
      <SelectContent>
        {statuses.map(status => (
          <SelectItem key={status.id} value={status.id}>
            {status.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Shared Assignee Select dropdown
 * Displays team members with optional role
 */
export function TaskAssigneeSelect({ value, onValueChange, teamMembers, className = "" }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={`bg-gray-800 border-gray-700 text-white ${className}`}>
        <SelectValue placeholder="Assign to team member" />
      </SelectTrigger>
      <SelectContent>
        {teamMembers.map(member => (
          <SelectItem key={member.id} value={member.id}>
            {member.full_name}{member.team_role ? ` (${member.team_role})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}