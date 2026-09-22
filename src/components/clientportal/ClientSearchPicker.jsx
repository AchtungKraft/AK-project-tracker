import React, { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, UserCheck, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 15;

function scoreMatch(client, query) {
  const q = query.toLowerCase();
  const name = (client.name || "").toLowerCase();
  const email = (client.email || "").toLowerCase();
  const slug = (client.url_slug || "").toLowerCase();
  const role = (client.role_title || "").toLowerCase();

  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (email === q) return 85;
  if (email.startsWith(q)) return 80;
  if (slug === q) return 75;
  if (slug.startsWith(q)) return 70;
  if (name.includes(q)) return 60;
  if (email.includes(q)) return 50;
  if (slug.includes(q)) return 40;
  if (role.includes(q)) return 30;

  // Check individual words in name
  const nameParts = name.split(/\s+/);
  for (const part of nameParts) {
    if (part.startsWith(q)) return 65;
    if (part.includes(q)) return 45;
  }

  return 0;
}

export default function ClientSearchPicker({
  allClients,
  assignedClientIds,
  onSelect,
}) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeClients = allClients.filter((c) => c.active);

  const results = React.useMemo(() => {
    if (query.length < 2) return [];
    const scored = activeClients
      .map((c) => ({ client: c, score: scoreMatch(c, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored;
  }, [query, activeClients]);

  const visibleResults = showAll ? results : results.slice(0, MAX_VISIBLE);
  const hasMore = results.length > MAX_VISIBLE && !showAll;

  const handleSelect = useCallback(
    (client) => {
      if (assignedClientIds.includes(client.id)) return;
      onSelect(client);
      setQuery("");
      setShowResults(false);
      setHighlightIndex(-1);
      setShowAll(false);
    },
    [assignedClientIds, onSelect]
  );

  const handleKeyDown = (e) => {
    if (!showResults || visibleResults.length === 0) {
      if (e.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < visibleResults.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < visibleResults.length) {
          handleSelect(visibleResults[highlightIndex].client);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowResults(false);
        setHighlightIndex(-1);
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex];
      if (item) item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
            setHighlightIndex(-1);
            setShowAll(false);
          }}
          onFocus={() => {
            if (query.length >= 2) setShowResults(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search clients by name, email, or slug..."
          className="w-full h-10 pl-10 pr-10 bg-gray-900 border border-gray-700 rounded-md text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setShowResults(false);
              setHighlightIndex(-1);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showResults && query.length >= 2 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">
              No clients match "{query}"
            </div>
          ) : (
            <>
              <div
                ref={listRef}
                className="max-h-[280px] overflow-y-auto"
              >
                {visibleResults.map(({ client }, idx) => {
                  const isAssigned = assignedClientIds.includes(client.id);
                  const isHighlighted = idx === highlightIndex;

                  return (
                    <button
                      key={client.id}
                      type="button"
                      disabled={isAssigned}
                      onClick={() => handleSelect(client)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 border-b border-gray-700/50 last:border-0 transition-colors",
                        isAssigned
                          ? "opacity-50 cursor-not-allowed bg-gray-800"
                          : isHighlighted
                          ? "bg-gray-700"
                          : "hover:bg-gray-700/60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-white truncate">
                            {client.name}
                          </div>
                          {client.email && (
                            <div className="text-xs text-gray-400 truncate">
                              {client.email}
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-0.5">
                            {client.role_title && (
                              <span className="text-[11px] text-gray-500">
                                {client.role_title}
                              </span>
                            )}
                            {client.url_slug && (
                              <span className="text-[11px] text-gray-500">
                                slug: {client.url_slug}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAssigned && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap shrink-0">
                            <UserCheck className="w-3.5 h-3.5" />
                            Already added
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Show more / count */}
              <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/80 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                </span>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    Show all {results.length}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}