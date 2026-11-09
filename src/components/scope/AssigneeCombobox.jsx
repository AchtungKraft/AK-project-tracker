import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Searchable single-select of TeamMember options. Value is a TeamMember id ("" = unassigned).
export default function AssigneeCombobox({ value, onChange, options, loading }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.id === value);
  const pick = (id) => { onChange(id); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full min-w-0 h-9 px-3 flex items-center justify-between gap-2 rounded-md border border-gray-700 bg-gray-800 text-sm text-white">
          <span className={cn("truncate", !current && "text-gray-400")}>{loading ? "Loading…" : current ? current.full_name : "Unassigned"}</span>
          <ChevronsUpDown className="w-4 h-4 shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]" align="start">
        <Command>
          <CommandInput placeholder="Search team…" />
          <CommandList>
            <CommandEmpty>No team member found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__unassigned__ unassigned" onSelect={() => pick("")}>
                <Check className={cn("w-4 h-4 mr-2", value ? "opacity-0" : "opacity-100")} />Unassigned
              </CommandItem>
              {options.map(o => (
                <CommandItem key={o.id} value={`${o.full_name} ${o.team_role} ${o.id}`} onSelect={() => pick(o.id)}>
                  <Check className={cn("w-4 h-4 mr-2 shrink-0", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.full_name}</span>
                  {o.team_role && <span className="ml-2 text-xs text-gray-500 truncate">{o.team_role}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}