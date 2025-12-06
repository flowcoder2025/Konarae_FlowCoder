import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const stackVariants = cva("flex", {
  variants: {
    direction: {
      row: "flex-row",
      "row-reverse": "flex-row-reverse",
      column: "flex-col",
      "column-reverse": "flex-col-reverse",
    },
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
      baseline: "items-baseline",
    },
    justify: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly",
    },
    gap: {
      none: "gap-0",
      xs: "gap-1",
      sm: "gap-2",
      default: "gap-4",
      lg: "gap-6",
      xl: "gap-8",
      "2xl": "gap-12",
    },
    wrap: {
      nowrap: "flex-nowrap",
      wrap: "flex-wrap",
      "wrap-reverse": "flex-wrap-reverse",
    },
    responsive: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    {
      direction: "column",
      responsive: true,
      className: "md:flex-row",
    },
    {
      direction: "row",
      responsive: true,
      className: "flex-col md:flex-row",
    },
  ],
  defaultVariants: {
    direction: "column",
    align: "stretch",
    justify: "start",
    gap: "default",
    wrap: "nowrap",
    responsive: false,
  },
})

interface StackProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof stackVariants> {
  asChild?: boolean
}

function Stack({
  className,
  direction,
  align,
  justify,
  gap,
  wrap,
  responsive,
  asChild = false,
  ...props
}: StackProps) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="stack"
      className={cn(
        stackVariants({ direction, align, justify, gap, wrap, responsive }),
        className
      )}
      {...props}
    />
  )
}

function HStack({
  className,
  ...props
}: Omit<StackProps, "direction">) {
  return <Stack direction="row" className={className} {...props} />
}

function VStack({
  className,
  ...props
}: Omit<StackProps, "direction">) {
  return <Stack direction="column" className={className} {...props} />
}

export { Stack, HStack, VStack, stackVariants }
