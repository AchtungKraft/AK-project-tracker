import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[--action-primary-bg] text-[--action-primary-text] shadow hover:bg-[--action-primary-bg-hover] active:bg-[--action-primary-bg-active] disabled:bg-[--action-primary-disabled-bg] disabled:text-[--action-primary-disabled-text] disabled:opacity-100",
        destructive:
          "bg-[--action-destructive-bg] text-[--action-destructive-text] shadow-sm hover:bg-[--action-destructive-bg-hover] disabled:bg-[--action-disabled-bg] disabled:text-[--action-disabled-text] disabled:opacity-100",
        outline:
          "border border-[--action-utility-border] bg-[--action-utility-bg] text-[--action-utility-text] shadow-sm hover:bg-[--action-utility-bg-hover] hover:text-white disabled:bg-[--action-disabled-bg] disabled:text-[--action-disabled-text] disabled:border-[--action-disabled-border] disabled:opacity-100",
        secondary:
          "bg-[--action-secondary-bg] text-[--action-secondary-text] border border-[--action-secondary-border] shadow-sm hover:bg-[--action-secondary-bg-hover] hover:text-white disabled:bg-[--action-disabled-bg] disabled:text-[--action-disabled-text] disabled:opacity-100",
        ghost: 
          "bg-transparent text-gray-300 hover:bg-[--action-utility-bg-hover] hover:text-white md:bg-transparent disabled:bg-[--action-disabled-bg] disabled:text-[--action-disabled-text] disabled:opacity-100",
        link: "text-blue-400 underline-offset-4 hover:underline hover:text-blue-300 disabled:text-[--action-disabled-text] disabled:opacity-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      data-variant={variant || "default"}
      aria-disabled={props.disabled ? "true" : undefined}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }