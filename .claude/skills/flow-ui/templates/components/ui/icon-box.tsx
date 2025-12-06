import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const iconBoxVariants = cva(
  "inline-flex items-center justify-center shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      size: {
        xs: "size-6 [&_svg]:size-3",
        sm: "size-8 [&_svg]:size-4",
        default: "size-10 [&_svg]:size-5",
        lg: "size-12 [&_svg]:size-6",
        xl: "size-14 [&_svg]:size-7",
        "2xl": "size-16 [&_svg]:size-8",
      },
      variant: {
        ghost: "bg-transparent",
        subtle: "bg-primary/10 text-primary",
        solid: "bg-primary text-primary-foreground",
        outline: "border-2 border-primary text-primary bg-transparent",
        muted: "bg-muted text-muted-foreground",
      },
      rounded: {
        none: "rounded-none",
        sm: "rounded-sm",
        default: "rounded-md",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "subtle",
      rounded: "lg",
    },
  }
)

interface IconBoxProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof iconBoxVariants> {
  asChild?: boolean
}

function IconBox({
  className,
  size,
  variant,
  rounded,
  asChild = false,
  ...props
}: IconBoxProps) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="icon-box"
      className={cn(iconBoxVariants({ size, variant, rounded }), className)}
      {...props}
    />
  )
}

export { IconBox, iconBoxVariants }
