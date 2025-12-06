import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const textVariants = cva("", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
      default: "text-base",
      lg: "text-lg",
      xl: "text-xl",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      inherit: "text-inherit",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
    leading: {
      none: "leading-none",
      tight: "leading-tight",
      snug: "leading-snug",
      normal: "leading-normal",
      relaxed: "leading-relaxed",
      loose: "leading-loose",
    },
  },
  defaultVariants: {
    size: "default",
    tone: "default",
    weight: "normal",
    align: "left",
    leading: "normal",
  },
})

interface TextProps
  extends Omit<React.ComponentProps<"p">, "color">,
    VariantProps<typeof textVariants> {
  as?: "p" | "span" | "div"
  asChild?: boolean
}

function Text({
  className,
  size,
  tone,
  weight,
  align,
  leading,
  as: Tag = "p",
  asChild = false,
  ...props
}: TextProps) {
  const Comp = asChild ? Slot : Tag

  return (
    <Comp
      data-slot="text"
      className={cn(textVariants({ size, tone, weight, align, leading }), className)}
      {...props}
    />
  )
}

export { Text, textVariants }
