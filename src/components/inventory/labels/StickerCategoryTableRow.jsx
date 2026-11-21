import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function StickerCategoryTableRow({ category: c, onEdit, onToggle, busy }) {
  return (
    <tr className="border-t border-gray-800">
      <td className="py-2 px-2"><span className="block w-6 h-6 rounded-sm border border-gray-600" style={{ backgroundColor: c.color }} /></td>
      <td className="py-2 px-2 font-medium">{c.name}</td>
      <td className="py-2 px-2 font-mono text-xs text-gray-400">{c.color}</td>
      <td className="py-2 px-2 text-right tabular-nums">{c.usage}</td>
      <td className="py-2 px-2">
        <Badge variant="outline" className={c.active ? 'border-emerald-700 text-emerald-300' : 'border-gray-600 text-gray-400'}>
          {c.active ? 'Active' : 'Inactive'}
        </Badge>
      </td>
      <td className="py-2 px-2 text-right whitespace-nowrap">
        <Button size="sm" variant="ghost" onClick={onEdit} className="h-7">Edit</Button>
        {c.key !== 'general' && (
          <Button size="sm" variant="ghost" onClick={onToggle} disabled={busy} className="h-7">
            {c.active ? 'Deactivate' : 'Activate'}
          </Button>
        )}
      </td>
    </tr>
  );
}