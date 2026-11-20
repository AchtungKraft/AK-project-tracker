import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { resolveCategory } from "./labelDrafts";

export default function CategorySelect({ categories, value, onChange, placeholder, className = "" }) {
  const active = categories.filter(c => c.active !== false);
  const current = value === undefined ? undefined : resolveCategory(categories, value).id || undefined;
  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className={`h-9 bg-gray-950 border-gray-700 ${className}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {active.map(c => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}