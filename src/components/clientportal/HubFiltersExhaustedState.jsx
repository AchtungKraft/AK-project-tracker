import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";

/**
 * Shown when filters eliminate ALL requests but unfiltered requests exist.
 * Distinct from the empty-database state.
 */
export default function HubFiltersExhaustedState({ totalUnfilteredCount, onClearFilters }) {
  return (
    <Card className="bg-amber-950/20 border border-amber-700/40">
      <CardContent className="p-8 md:p-12 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-900/30 mx-auto mb-4">
          <Filter className="w-8 h-8 text-amber-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          All Requests Filtered Out
        </h3>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">
          Your current filters are excluding all {totalUnfilteredCount} feedback request{totalUnfilteredCount !== 1 ? 's' : ''}.
          Clear filters to see them.
        </p>
        <Button
          onClick={onClearFilters}
          variant="outline"
          className="border-amber-700 text-amber-300 hover:bg-amber-900/40 hover:text-white gap-2"
        >
          <X className="w-4 h-4" />
          Clear All Filters
        </Button>
      </CardContent>
    </Card>
  );
}