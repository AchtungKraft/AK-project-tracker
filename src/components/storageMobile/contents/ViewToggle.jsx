import { Button } from "@/components/ui/button";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ViewToggle({ view, onView }) {
  return (
    <div className="flex bg-gray-900/50 rounded-lg p-0.5 border border-gray-700 shrink-0">
      <Button size="sm" variant="ghost" aria-label="Grid view" onClick={() => onView('grid')}
        className={cn("h-7 px-2", view === 'grid' ? "bg-red-600 text-white" : "text-gray-400")}><LayoutGrid className="w-4 h-4" /></Button>
      <Button size="sm" variant="ghost" aria-label="List view" onClick={() => onView('list')}
        className={cn("h-7 px-2", view === 'list' ? "bg-red-600 text-white" : "text-gray-400")}><List className="w-4 h-4" /></Button>
    </div>
  );
}