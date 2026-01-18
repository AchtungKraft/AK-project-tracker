import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-red-600 text-white shadow hover:bg-red-700",
        secondary:
          "border-transparent bg-gray-700 text-gray-100 hover:bg-gray-600",
        destructive:
          "border-transparent bg-red-700 text-white shadow hover:bg-red-800",
        outline: "text-gray-200 border-gray-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }