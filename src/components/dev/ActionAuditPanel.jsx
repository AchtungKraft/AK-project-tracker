import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  Copy,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { getActionLog, clearActionLog } from "./wiringAudit";

/**
 * ActionAuditPanel - Admin-only overlay for debugging UI/function wiring
 * 
 * Shows last 50 actions invoked with status
 * Helps diagnose "button doesn't do anything" issues
 */
export default function ActionAuditPanel() {
  const [isVisible, setIsVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [log, setLog] = useState([]);

  useEffect(() => {
    base44.auth.me().then(user => {
      setIsAdmin(user?.role === 'admin');
    }).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    
    const interval = setInterval(() => {
      setLog(getActionLog());
    }, 500);
    
    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isAdmin) return null;

  const handleCopyReport = () => {
    const report = log.map(entry => 
      `[${entry.timestamp}] ${entry.pageName}::${entry.actionName} - ${entry.status} ${entry.error || ''}`
    ).join('\n');
    
    navigator.clipboard.writeText(report);
    toast.success('Report copied to clipboard');
  };

  const handleClear = () => {
    clearActionLog();
    setLog([]);
    toast.success('Audit log cleared');
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-20 right-4 z-50 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-full shadow-lg transition-all"
        title="Action Audit Panel"
      >
        <Activity className="w-5 h-5" />
      </button>

      {/* Audit Panel Overlay */}
      {isVisible && (
        <div className="fixed bottom-32 right-4 z-50 w-96">
          <Card className="bg-gray-900 border-purple-600 shadow-2xl">
            <CardHeader className="border-b border-gray-700 p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  Action Wiring Audit
                  <Badge className="bg-purple-600 text-xs">{log.length}</Badge>
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyReport}
                    className="h-7 w-7"
                    title="Copy Report"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClear}
                    className="h-7 w-7"
                    title="Clear Log"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-64">
                <div className="p-2 space-y-1">
                  {log.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-xs">
                      No actions logged yet
                    </div>
                  ) : (
                    log.map((entry, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-gray-800/50 rounded text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-purple-400 font-mono">
                            {entry.pageName}::{entry.actionName}
                          </span>
                          {entry.status === 'success' && (
                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                          )}
                          {entry.status === 'error' && (
                            <XCircle className="w-3 h-3 text-red-400" />
                          )}
                          {entry.status === 'invoked' && (
                            <Clock className="w-3 h-3 text-yellow-400" />
                          )}
                        </div>
                        <div className="text-gray-500 flex items-center justify-between">
                          <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                          {entry.error && (
                            <span className="text-red-400 text-xs truncate max-w-[200px]">
                              {entry.error}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}