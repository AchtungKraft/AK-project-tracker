import React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

function StarRating({ value, max = 5 }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "w-3.5 h-3.5",
            i < (value || 0) ? "text-amber-400 fill-amber-400" : "text-gray-700"
          )}
        />
      ))}
    </div>
  );
}

function RatingRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400">{label}</span>
      <StarRating value={value} />
    </div>
  );
}

export default function VendorRatingsDisplay({ vendor }) {
  const hasRatings = vendor.quality_rating || vendor.speed_rating || vendor.communication_rating || vendor.value_rating;
  if (!hasRatings) return null;

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 space-y-1.5">
      <RatingRow label="Quality" value={vendor.quality_rating} />
      <RatingRow label="Speed" value={vendor.speed_rating} />
      <RatingRow label="Communication" value={vendor.communication_rating} />
      <RatingRow label="Value" value={vendor.value_rating} />
    </div>
  );
}

export function RatingInput({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-300">{label}</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(value === i + 1 ? null : i + 1)}
            className="p-0.5 hover:scale-110 transition-transform"
          >
            <Star
              className={cn(
                "w-4 h-4 cursor-pointer",
                i < (value || 0) ? "text-amber-400 fill-amber-400" : "text-gray-600 hover:text-gray-400"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}