import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const gridVariants = cva("grid", {
  variants: {
    cols: {
      1: "grid-cols-1",
      2: "grid-cols-1 md:grid-cols-2",
      3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
      5: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
      6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
      12: "grid-cols-12",
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
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
    },
    justify: {
      start: "justify-items-start",
      center: "justify-items-center",
      end: "justify-items-end",
      stretch: "justify-items-stretch",
    },
    flow: {
      row: "grid-flow-row",
      col: "grid-flow-col",
      dense: "grid-flow-dense",
      "row-dense": "grid-flow-row-dense",
      "col-dense": "grid-flow-col-dense",
    },
  },
  defaultVariants: {
    cols: 3,
    gap: "default",
    align: "stretch",
    justify: "stretch",
    flow: "row",
  },
})

interface GridProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof gridVariants> {
  asChild?: boolean
}

function Grid({
  className,
  cols,
  gap,
  align,
  justify,
  flow,
  asChild = false,
  ...props
}: GridProps) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="grid"
      className={cn(gridVariants({ cols, gap, align, justify, flow }), className)}
      {...props}
    />
  )
}

const gridItemVariants = cva("", {
  variants: {
    colSpan: {
      1: "col-span-1",
      2: "col-span-2",
      3: "col-span-3",
      4: "col-span-4",
      6: "col-span-6",
      12: "col-span-12",
      full: "col-span-full",
    },
    rowSpan: {
      1: "row-span-1",
      2: "row-span-2",
      3: "row-span-3",
      4: "row-span-4",
      full: "row-span-full",
    },
  },
  defaultVariants: {
    colSpan: 1,
    rowSpan: 1,
  },
})

interface GridItemProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof gridItemVariants> {
  asChild?: boolean
}

function GridItem({
  className,
  colSpan,
  rowSpan,
  asChild = false,
  ...props
}: GridItemProps) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="grid-item"
      className={cn(gridItemVariants({ colSpan, rowSpan }), className)}
      {...props}
    />
  )
}

export { Grid, GridItem, gridVariants, gridItemVariants }
