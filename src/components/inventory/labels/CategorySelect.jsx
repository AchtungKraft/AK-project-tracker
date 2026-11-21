import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { resolveCategory } from "./labelDrafts";

// Only active categories can be newly chosen; a tote's saved inactive category still shows as its value.
export default function CategorySelect({ categories, value, onChange, placeholder, className = "" }) {
  const current = value === undefined ? undefined : resolveCategory(categories, value).id || undefined;
  const options = categories.filter(c => c.active !== false || c.id === current);
  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className={`h-9 bg-gray-950 border-gray-700 ${className}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(c => (
          <SelectItem key={c.id} value={c.id} disabled={c.active === false}>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
              {c.name}{c.active === false ? ' (inactive)' : ''}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}