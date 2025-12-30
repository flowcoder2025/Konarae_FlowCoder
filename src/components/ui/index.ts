/**
 * Flow UI Component Module
 * Primary Color 기반 디자인 시스템
 *
 * 사용법:
 * import { Button, Card, Heading } from "@/components/ui"
 *
 * @see /claude.md - 전역 규칙
 * @see /src/components/claude.md - 컴포넌트 가이드
 */

// ============================================
// Interactive Components
// ============================================
export { Button, buttonVariants } from "./button"
export { Input } from "./input"
export { Badge, badgeVariants } from "./badge"

// ============================================
// Layout Components
// ============================================
export { Container, containerVariants } from "./container"
export { Section, sectionVariants } from "./section"
export { Stack, HStack, VStack, stackVariants } from "./stack"
export { Grid, GridItem, gridVariants, gridItemVariants } from "./grid"
export { Divider, dividerVariants } from "./divider"

// ============================================
// Typography Components
// ============================================
export { Heading, headingVariants } from "./heading"
export { Text, textVariants } from "./text"

// ============================================
// Visual Components
// ============================================
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "./card"
export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  avatarVariants,
  avatarGroupVariants,
} from "./avatar"
export { IconBox, iconBoxVariants } from "./icon-box"

// ============================================
// Feedback Components
// ============================================
export { EmptyState, InlineEmptyState } from "./empty-state"
export type { EmptyStateVariant } from "./empty-state"

// ============================================
// Type Exports
// ============================================
export type { VariantProps } from "class-variance-authority"
