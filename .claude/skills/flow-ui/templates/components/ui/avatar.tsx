import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const avatarVariants = cva(
  "relative inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full bg-muted",
  {
    variants: {
      size: {
        xs: "size-6 text-xs",
        sm: "size-8 text-sm",
        default: "size-10 text-base",
        lg: "size-12 text-lg",
        xl: "size-14 text-xl",
        "2xl": "size-16 text-2xl",
      },
      border: {
        none: "",
        default: "ring-2 ring-background",
        primary: "ring-2 ring-primary",
      },
    },
    defaultVariants: {
      size: "default",
      border: "none",
    },
  }
)

interface AvatarProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof avatarVariants> {}

function Avatar({ className, size, border, ...props }: AvatarProps) {
  return (
    <div
      data-slot="avatar"
      className={cn(avatarVariants({ size, border }), className)}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  src,
  alt = "",
  ...props
}: React.ComponentProps<"img">) {
  return (
    <img
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      src={src}
      alt={alt}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center bg-primary/10 text-primary font-medium",
        className
      )}
      {...props}
    />
  )
}

const avatarGroupVariants = cva("flex -space-x-2", {
  variants: {
    size: {
      xs: "-space-x-1.5",
      sm: "-space-x-2",
      default: "-space-x-3",
      lg: "-space-x-4",
      xl: "-space-x-5",
      "2xl": "-space-x-6",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

interface AvatarGroupProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof avatarGroupVariants> {
  max?: number
}

function AvatarGroup({
  className,
  size,
  max,
  children,
  ...props
}: AvatarGroupProps) {
  const childrenArray = React.Children.toArray(children)
  const visibleChildren = max ? childrenArray.slice(0, max) : childrenArray
  const remainingCount = max ? childrenArray.length - max : 0

  return (
    <div
      data-slot="avatar-group"
      className={cn(avatarGroupVariants({ size }), className)}
      {...props}
    >
      {visibleChildren}
      {remainingCount > 0 && (
        <Avatar size={size} border="default">
          <AvatarFallback>+{remainingCount}</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  avatarVariants,
  avatarGroupVariants,
}
