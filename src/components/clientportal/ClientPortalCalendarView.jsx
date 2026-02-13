import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  ChevronRight,
  Wrench,
  Clock,
  MessageSquareText,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
  isPast
} from "date-fns";
import ClientPortalCalendarEvent from "./ClientPortalCalendarEvent";

// Bucket color config
const BUCKET_COLORS = {
  draft: { bg: 'bg-slate-500/20', border: 'border-slate-500', text: 'text-slate-400' },
  awaiting_client: { bg: 'bg-amber-500/20', border: 'border-amber-500', text: 'text-amber-400' },
  client_replied: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400' },
  approved: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400' }
};

export default function ClientPortalCalendarView({ 
  requests, 
  projects,
  getProjectClientSlug
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Get calendar days for the current month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);
  
  // Group requests by due date
  const requestsByDate = useMemo(() => {
    const grouped = {};
    
    requests.forEach(request => {
      if (!request.due_date) return;
      
      const dateKey = format(new Date(request.due_date), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(request);
    });
    
    return grouped;
  }, [requests]);
  
  // Requests without due dates
  const unscheduledRequests = useMemo(() => {
    return requests.filter(r => !r.due_date);
  }, [requests]);
  
  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());
  
  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToPreviousMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={goToNextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <h2 className="text-xl font-bold text-white">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-slate-500/50" />
              <span className="text-gray-400">Draft</span>
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-amber-500/50" />
              <span className="text-gray-400">Awaiting</span>
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500/50" />
              <span className="text-gray-400">Replied</span>
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500/50" />
              <span className="text-gray-400">Approved</span>
            </span>
          </div>
        </div>
      </div>
      
      {/* Calendar Grid */}
      <Card className="bg-black/40 border-gray-700 overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-gray-700">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center text-xs font-medium text-gray-400 bg-gray-800/50">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayRequests = requestsByDate[dateKey] || [];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isDayToday = isToday(day);
            const isDayPast = isPast(day) && !isDayToday;
            
            // Check for overdue items
            const hasOverdue = dayRequests.some(r => 
              r.lifecycleBucket !== 'draft' && 
              r.lifecycleBucket !== 'approved' && 
              isPast(new Date(r.due_date)) && 
              !isToday(new Date(r.due_date))
            );
            
            return (
              <div 
                key={dateKey}
                className={`min-h-[100px] md:min-h-[120px] border-b border-r border-gray-800 p-1 ${
                  !isCurrentMonth ? 'bg-gray-900/50 opacity-50' : 'bg-black/20'
                } ${isDayToday ? 'bg-red-950/30 ring-1 ring-inset ring-red-500/50' : ''}`}
              >
                {/* Day Number */}
                <div className={`text-xs font-medium mb-1 flex items-center justify-between ${
                  isDayToday ? 'text-red-400' : isCurrentMonth ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  <span className={isDayToday ? 'bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center' : ''}>
                    {format(day, 'd')}
                  </span>
                  {hasOverdue && (
                    <AlertCircle className="w-3 h-3 text-red-500" />
                  )}
                </div>
                
                {/* Events */}
                <div className="space-y-0.5 overflow-y-auto max-h-[80px]">
                  {dayRequests.slice(0, 3).map(request => (
                    <ClientPortalCalendarEvent 
                      key={request.id} 
                      request={request}
                      projects={projects}
                      getProjectClientSlug={getProjectClientSlug}
                    />
                  ))}
                  {dayRequests.length > 3 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{dayRequests.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      
      {/* Unscheduled Requests */}
      {unscheduledRequests.length > 0 && (
        <Card className="bg-black/40 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              No Due Date ({unscheduledRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {unscheduledRequests.slice(0, 6).map(request => (
                <ClientPortalCalendarEvent 
                  key={request.id} 
                  request={request}
                  projects={projects}
                  getProjectClientSlug={getProjectClientSlug}
                  expanded
                />
              ))}
            </div>
            {unscheduledRequests.length > 6 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{unscheduledRequests.length - 6} more without due dates
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}