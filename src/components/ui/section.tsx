import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const sectionVariants = cva("w-full", {
  variants: {
    spacing: {
      none: "py-0",
      sm: "py-8 md:py-12",
      default: "py-12 md:py-20",
      lg: "py-20 md:py-32",
      xl: "py-24 md:py-40",
    },
    background: {
      default: "bg-background",
      muted: "bg-muted",
      primary: "bg-primary/5",
      "primary-solid": "bg-primary text-primary-foreground",
      transparent: "bg-transparent",
    },
    border: {
      none: "",
      top: "border-t border-border",
      bottom: "border-b border-border",
      both: "border-y border-border",
    },
  },
  defaultVariants: {
    spacing: "default",
    background: "default",
    border: "none",
  },
})

function Section({
  className,
  spacing,
  background,
  border,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof sectionVariants>) {
  return (
    <section
      data-slot="section"
      className={cn(sectionVariants({ spacing, background, border }), className)}
      {...props}
    />
  )
}

export { Section, sectionVariants }
