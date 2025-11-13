import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Search, Clock, User, Package } from "lucide-react";
import { format } from "date-fns";

export default function ActivityLogView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const { data: activityLogs = [], isLoading } = useQuery({
    queryKey: ['activityLogs'],
    queryFn: () => base44.entities.ActivityLog.list('-created_date', 100),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const actionTypes = [...new Set(activityLogs.map(log => log.action_type).filter(Boolean))];

  const filteredLogs = activityLogs.filter(log => {
    const matchesSearch = 
      log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;
    
    return matchesSearch && matchesAction;
  });

  const getEntityName = (log) => {
    if (log.entity_type === 'Part' && log.entity_id) {
      const part = parts.find(p => p.id === log.entity_id);
      return part?.part_name || log.entity_id;
    }
    if (log.entity_type === 'Project' && log.entity_id) {
      const project = projects.find(p => p.id === log.entity_id);
      return project?.name || log.entity_id;
    }
    return log.entity_id || '-';
  };

  const getActionColor = (actionType) => {
    switch (actionType) {
      case 'Create':
      case 'created':
        return '#10B981'; // green
      case 'Update':
      case 'updated':
        return '#3B82F6'; // blue
      case 'Delete':
      case 'deleted':
        return '#EF4444'; // red
      case 'status_change':
        return '#F59E0B'; // yellow
      default:
        return '#6B7280'; // gray
    }
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'Create':
      case 'created':
        return '+';
      case 'Update':
      case 'updated':
        return '✏️';
      case 'Delete':
      case 'deleted':
        return '×';
      case 'status_change':
        return '→';
      default:
        return '•';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white text-base">Activity Log</CardTitle>
              <Badge variant="outline" className="border-gray-700 text-gray-400">
                {filteredLogs.length} entries
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search activity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            <div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actionTypes.map(action => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardContent className="p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading activity...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No activity logged yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log, index) => (
                <div
                  key={log.id || index}
                  className="flex items-start gap-3 p-3 bg-gray-900/30 rounded-lg hover:bg-gray-900/50 transition-colors"
                >
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center pt-1">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: getActionColor(log.action_type) }}
                    >
                      {getActionIcon(log.action_type)}
                    </div>
                    {index < filteredLogs.length - 1 && (
                      <div className="w-0.5 h-full bg-gray-800 mt-2" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            style={{ backgroundColor: getActionColor(log.action_type) }}
                            className="text-white text-xs"
                          >
                            {log.action_type}
                          </Badge>
                          {log.entity_type && (
                            <Badge variant="outline" className="text-xs border-gray-700">
                              {log.entity_type}
                            </Badge>
                          )}
                        </div>
                        <p className="text-white text-sm mt-2">
                          {log.description || 'No description'}
                        </p>
                        {log.entity_type && log.entity_id && (
                          <div className="flex items-center gap-2 mt-1">
                            <Package className="w-3 h-3 text-gray-500" />
                            <p className="text-xs text-gray-400">
                              {getEntityName(log)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                      {log.created_by && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{log.created_by}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {log.created_date 
                            ? format(new Date(log.created_date), 'MMM d, yyyy h:mm a')
                            : 'Unknown date'
                          }
                        </span>
                      </div>
                    </div>

                    {/* Additional metadata if exists */}
                    {log.metadata && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                          View details
                        </summary>
                        <pre className="mt-2 p-2 bg-gray-800 rounded text-xs text-gray-400 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}