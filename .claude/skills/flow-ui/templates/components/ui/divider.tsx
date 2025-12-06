import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const dividerVariants = cva("shrink-0", {
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "h-full w-px",
    },
    variant: {
      default: "bg-border",
      muted: "bg-muted",
      primary: "bg-primary",
      "primary-subtle": "bg-primary/20",
      gradient: "bg-gradient-to-r from-transparent via-primary to-transparent",
    },
    spacing: {
      none: "",
      sm: "my-2",
      default: "my-4",
      lg: "my-8",
    },
    thickness: {
      thin: "",
      default: "",
      thick: "",
    },
  },
  compoundVariants: [
    {
      orientation: "horizontal",
      thickness: "thin",
      className: "h-px",
    },
    {
      orientation: "horizontal",
      thickness: "default",
      className: "h-[2px]",
    },
    {
      orientation: "horizontal",
      thickness: "thick",
      className: "h-1",
    },
    {
      orientation: "vertical",
      thickness: "thin",
      className: "w-px",
    },
    {
      orientation: "vertical",
      thickness: "default",
      className: "w-[2px]",
    },
    {
      orientation: "vertical",
      thickness: "thick",
      className: "w-1",
    },
    {
      orientation: "vertical",
      spacing: "sm",
      className: "mx-2 my-0",
    },
    {
      orientation: "vertical",
      spacing: "default",
      className: "mx-4 my-0",
    },
    {
      orientation: "vertical",
      spacing: "lg",
      className: "mx-8 my-0",
    },
  ],
  defaultVariants: {
    orientation: "horizontal",
    variant: "default",
    spacing: "default",
    thickness: "default",
  },
})

interface DividerProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof dividerVariants> {
  decorative?: boolean
}

function Divider({
  className,
  orientation,
  variant,
  spacing,
  thickness,
  decorative = true,
  ...props
}: DividerProps) {
  return (
    <div
      data-slot="divider"
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : (orientation ?? undefined)}
      className={cn(
        dividerVariants({ orientation, variant, spacing, thickness }),
        className
      )}
      {...props}
    />
  )
}

export { Divider, dividerVariants }
