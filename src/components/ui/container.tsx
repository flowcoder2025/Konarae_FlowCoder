import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const containerVariants = cva("mx-auto w-full", {
  variants: {
    size: {
      sm: "max-w-screen-sm",
      md: "max-w-screen-md",
      lg: "max-w-screen-lg",
      xl: "max-w-screen-xl",
      "2xl": "max-w-screen-2xl",
      full: "max-w-full",
    },
    padding: {
      none: "px-0",
      sm: "px-4",
      default: "px-4 md:px-6 lg:px-8",
      lg: "px-6 md:px-8 lg:px-12",
    },
    centered: {
      true: "flex flex-col items-center",
      false: "",
    },
  },
  defaultVariants: {
    size: "xl",
    padding: "default",
    centered: false,
  },
})

function Container({
  className,
  size,
  padding,
  centered,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof containerVariants>) {
  return (
    <div
      data-slot="container"
      className={cn(containerVariants({ size, padding, centered }), className)}
      {...props}
    />
  )
}

export { Container, containerVariants }
