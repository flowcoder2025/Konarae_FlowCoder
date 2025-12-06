import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const headingVariants = cva("font-bold tracking-tight", {
  variants: {
    size: {
      xs: "text-lg md:text-xl",
      sm: "text-xl md:text-2xl",
      default: "text-2xl md:text-3xl",
      lg: "text-3xl md:text-4xl",
      xl: "text-4xl md:text-5xl",
      "2xl": "text-5xl md:text-6xl",
      "3xl": "text-6xl md:text-7xl",
    },
    accent: {
      none: "text-foreground",
      primary: "text-primary",
      gradient:
        "bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent",
      underline: "text-foreground relative inline-block after:absolute after:bottom-0 after:left-0 after:h-1 after:w-full after:bg-primary after:rounded-full",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
  },
  defaultVariants: {
    size: "default",
    accent: "none",
    align: "left",
  },
})

type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"

interface HeadingProps
  extends React.ComponentProps<"h1">,
    VariantProps<typeof headingVariants> {
  as?: HeadingLevel
  asChild?: boolean
}

function Heading({
  className,
  size,
  accent,
  align,
  as: Tag = "h2",
  asChild = false,
  ...props
}: HeadingProps) {
  const Comp = asChild ? Slot : Tag

  return (
    <Comp
      data-slot="heading"
      className={cn(headingVariants({ size, accent, align }), className)}
      {...props}
    />
  )
}

export { Heading, headingVariants }
