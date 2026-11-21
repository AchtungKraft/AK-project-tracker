import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Renders a shared action list with one consistent style; disabled actions explain why. */
export default function ActionButtons({ actions, onAction, size = 'sm', className }) {
  if (!actions.length) return null;
  const reason = actions.find((a) => a.disabled && a.reason)?.reason;
  return (
    <div className="space-y-1">
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {actions.map(({ key, label, icon: Icon, primary, disabled }) => (
          <Button key={key} type="button" variant={primary ? 'default' : 'outline'} disabled={disabled} onClick={() => onAction(key)}
            className={cn("gap-1.5 text-xs", size === 'lg' ? "h-11 flex-1 basis-[calc(50%-0.375rem)]" : "h-9 px-2.5",
              !primary && "border-gray-700 text-gray-100")}>
            {Icon && <Icon className="w-4 h-4 shrink-0" />}<span className="truncate">{label}</span>
          </Button>
        ))}
      </div>
      {reason && <p className="text-[11px] leading-tight text-amber-300">{reason}</p>}
    </div>
  );
}