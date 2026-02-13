import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ChevronLeft, 
  ChevronRight,
  Calendar,
  Clock,
  AlertCircle,
  FolderKanban
} from "lucide-react";
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  addWeeks, 
  subWeeks, 
  parseISO, 
  isWithinInterval, 
  isBefore,
  isToday 
} from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import RequestCalendarCard from "./RequestCalendarCard";
import { 
  convertRequestsToCalendarItems, 
  getRequestGroupInfo,
  LIFECYCLE_BUCKET_CONFIG 
} from "./requestCalendarAdapter";

export default function ClientPortalCalendarView({ 
  requests, 
  projects,
  comments = [],
  decisions = [],
  teamMembers = [],
  getProjectClientSlug,
  onUpdateDueDate,
}) {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weeksToShow, setWeeksToShow] = useState(isMobile ? 4 : 4);
  const [primaryGroupBy, setPrimaryGroupBy] = useState('project');
  const [secondaryGroupBy, setSecondaryGroupBy] = useState('lifecycle');

  // Convert requests to calendar items
  const calendarItems = useMemo(() => {
    return convertRequestsToCalendarItems(requests, projects, comments, decisions);
  }, [requests, projects, comments, decisions]);

  // Generate week ranges
  const weekRanges = useMemo(() => {
    const ranges = [];
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
    
    for (let i = 0; i < weeksToShow; i++) {
      const weekStart = addWeeks(startDate, i);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      ranges.push({ 
        start: weekStart, 
        end: weekEnd, 
        label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}` 
      });
    }
    return ranges;
  }, [currentDate, weeksToShow]);

  // Separate items: past due, with due date (future), without due date
  const { itemsPastDue, itemsWithDueDate, itemsWithoutDueDate } = useMemo(() => {
    const pastDue = [];
    const withDate = [];
    const withoutDate = [];
    const today = startOfWeek(new Date(), { weekStartsOn: 1 });
    
    calendarItems.forEach(item => {
      if (item.due_date) {
        const itemDate = parseISO(item.due_date);
        // Only show as past due if not draft/approved
        if (isBefore(itemDate, today) && item.lifecycle_bucket !== 'draft' && item.lifecycle_bucket !== 'approved') {
          pastDue.push({ ...item, _calendarDate: item.due_date });
        } else {
          withDate.push({ ...item, _calendarDate: item.due_date });
        }
      } else {
        withoutDate.push(item);
      }
    });
    
    // Sort past due by oldest first
    pastDue.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    
    return { itemsPastDue: pastDue, itemsWithDueDate: withDate, itemsWithoutDueDate: withoutDate };
  }, [calendarItems]);

  // Group items by week
  const itemsByWeek = useMemo(() => {
    const grouped = {};
    
    weekRanges.forEach((range, index) => {
      grouped[index] = itemsWithDueDate.filter(item => {
        const itemDate = parseISO(item._calendarDate);
        return isWithinInterval(itemDate, { start: range.start, end: range.end });
      });
    });
    
    return grouped;
  }, [itemsWithDueDate, weekRanges]);

  // Group items by primary and secondary grouping
  const groupItemsForSection = (items) => {
    const primaryGroups = {};
    
    items.forEach(item => {
      const primary = getRequestGroupInfo(item, primaryGroupBy, projects, teamMembers);
      
      if (!primaryGroups[primary.key]) {
        primaryGroups[primary.key] = {
          ...primary,
          secondaryGroups: {},
        };
      }
      
      const secondary = getRequestGroupInfo(item, secondaryGroupBy, projects, teamMembers);
      
      if (!primaryGroups[primary.key].secondaryGroups[secondary.key]) {
        primaryGroups[primary.key].secondaryGroups[secondary.key] = {
          ...secondary,
          items: [],
        };
      }
      
      primaryGroups[primary.key].secondaryGroups[secondary.key].items.push(item);
    });
    
    return primaryGroups;
  };

  const navigateWeeks = (direction) => {
    if (direction === 'prev') {
      setCurrentDate(subWeeks(currentDate, weeksToShow));
    } else {
      setCurrentDate(addWeeks(currentDate, weeksToShow));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const renderGroupedItems = (groupedItems) => {
    const entries = Object.entries(groupedItems);
    if (entries.length === 0) {
      return <p className="text-gray-500 text-sm text-center py-4">No requests in this period</p>;
    }
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {entries.map(([primaryKey, primaryGroup]) => {
          const totalItems = Object.values(primaryGroup.secondaryGroups).reduce((sum, sg) => sum + sg.items.length, 0);
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
                className="border-b p-3"
                style={{ borderBottomColor: `${primaryGroup.color}50` }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="w-4 h-4" style={{ color: primaryGroup.color }} />
                    <div>
                      {primaryGroupBy === 'project' && project ? (
                        <Link 
                          to={createPageUrl("ProjectDetail") + "?id=" + project.id}
                          className="text-sm font-semibold hover:underline"
                          style={{ color: primaryGroup.color }}
                        >
                          {primaryGroup.label}
                        </Link>
                      ) : (
                        <CardTitle className="text-sm" style={{ color: primaryGroup.color }}>
                          {primaryGroup.label}
                        </CardTitle>
                      )}
                      {primaryGroup.sublabel && (
                        <p className="text-xs text-gray-400">{primaryGroup.sublabel}</p>
                      )}
                    </div>
                  </div>
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                    style={{ borderColor: primaryGroup.color, color: primaryGroup.color, backgroundColor: `${primaryGroup.color}15` }}
                  >
                    {totalItems} {totalItems === 1 ? 'request' : 'requests'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                {Object.entries(primaryGroup.secondaryGroups).map(([secondaryKey, secondaryGroup]) => (
                  <div 
                    key={secondaryKey} 
                    className="bg-black/40 rounded-lg border-2 overflow-hidden"
                    style={{ borderColor: secondaryGroup.color }}
                  >
                    <div 
                      className="p-2 border-b-2"
                      style={{ 
                        borderBottomColor: secondaryGroup.color,
                        backgroundColor: `${secondaryGroup.color}15`
                      }}
                    >
                      <h3 
                        className="font-semibold text-xs"
                        style={{ color: secondaryGroup.color }}
                      >
                        {secondaryGroup.label}
                      </h3>
                      <span className="text-xs text-gray-400">
                        {secondaryGroup.items.length} {secondaryGroup.items.length === 1 ? 'request' : 'requests'}
                      </span>
                    </div>
                    <div className="p-2 space-y-2">
                      {secondaryGroup.items.map(item => (
                        <RequestCalendarCard
                          key={item.id}
                          item={item}
                          projects={projects}
                          onUpdateDueDate={onUpdateDueDate}
                          showInlineControls={true}
                          compact={isMobile}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Calendar Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-black/40 rounded-lg p-3 border border-gray-800">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigateWeeks('prev')}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={goToToday}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <Calendar className="w-4 h-4 mr-1" />
            Today
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigateWeeks('next')}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(weeksToShow)} onValueChange={(v) => setWeeksToShow(Number(v))}>
            <SelectTrigger className="w-28 bg-gray-900/50 border-gray-700 text-white h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Weeks</SelectItem>
              <SelectItem value="4">4 Weeks</SelectItem>
              <SelectItem value="6">6 Weeks</SelectItem>
              <SelectItem value="8">8 Weeks</SelectItem>
            </SelectContent>
          </Select>
          
          <span className="text-xs text-gray-500 hidden sm:inline">Group by:</span>
          
          <Select value={primaryGroupBy} onValueChange={setPrimaryGroupBy}>
            <SelectTrigger className="w-32 bg-gray-900/50 border-gray-700 text-white h-8 text-xs">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">By Project</SelectItem>
              <SelectItem value="lifecycle">By Lifecycle</SelectItem>
              <SelectItem value="type">By Type</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={secondaryGroupBy} onValueChange={setSecondaryGroupBy}>
            <SelectTrigger className="w-32 bg-gray-900/50 border-gray-700 text-white h-8 text-xs">
              <SelectValue placeholder="Then by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Then Project</SelectItem>
              <SelectItem value="lifecycle">Then Lifecycle</SelectItem>
              <SelectItem value="type">Then Type</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Week Sections */}
      <div className="space-y-4">
        {/* Past Due Section */}
        {itemsPastDue.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border-2 border-red-600">
            <CardHeader className="p-3 border-b border-red-600/50 bg-red-600/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <CardTitle className="text-sm font-semibold text-red-400">
                    🔥 OVERDUE REQUESTS
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-red-600 text-red-400 bg-red-600/10">
                  {itemsPastDue.length} {itemsPastDue.length === 1 ? 'request' : 'requests'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {renderGroupedItems(groupItemsForSection(itemsPastDue))}
            </CardContent>
          </Card>
        )}

        {/* Weekly Sections */}
        {weekRanges.map((range, weekIndex) => {
          const weekItems = itemsByWeek[weekIndex] || [];
          const groupedItems = groupItemsForSection(weekItems);
          const isCurrentWeek = isWithinInterval(new Date(), { start: range.start, end: range.end });
          
          return (
            <Card 
              key={weekIndex} 
              className={`bg-black/40 backdrop-blur-xl border-2 ${isCurrentWeek ? 'border-red-600/50' : 'border-gray-800'}`}
            >
              <CardHeader className={`p-3 border-b ${isCurrentWeek ? 'border-red-600/30 bg-red-600' : 'border-gray-800 bg-gray-700'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-white" />
                    <CardTitle className="text-base font-bold uppercase text-white">
                      {range.label}
                      {isCurrentWeek && <span className="ml-2 text-xs font-normal">(THIS WEEK)</span>}
                    </CardTitle>
                  </div>
                  <Badge 
                    variant="outline" 
                    className="border-white/50 text-white bg-white/10"
                  >
                    {weekItems.length} {weekItems.length === 1 ? 'request' : 'requests'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3">
                {weekItems.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No requests due this week</p>
                ) : (
                  renderGroupedItems(groupedItems)
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* No Due Date Section */}
        {itemsWithoutDueDate.length > 0 && (
          <Card className="bg-black/40 backdrop-blur-xl border-2 border-amber-600/50">
            <CardHeader className="p-3 border-b border-amber-600/30 bg-amber-600/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <CardTitle className="text-sm font-semibold text-amber-400">
                    NO DUE DATE
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-amber-600 text-amber-400">
                  {itemsWithoutDueDate.length} {itemsWithoutDueDate.length === 1 ? 'request' : 'requests'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {renderGroupedItems(groupItemsForSection(itemsWithoutDueDate))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}