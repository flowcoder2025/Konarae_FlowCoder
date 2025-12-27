/**
 * Navbar Component
 *
 * 전역 상단 네비게이션 바
 * - 로고/브랜드
 * - 주요 네비게이션 링크
 * - 사용자 메뉴 (데스크탑: 드롭다운, 모바일: 통합 메뉴)
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserMenu } from "./user-menu";
import { CreditBalance } from "@/components/credits/credit-balance";
import { cn } from "@/lib/utils";
import {
  Home,
  Building2,
  Search,
  FolderKanban,
  Kanban,
  Settings,
  Menu,
  X,
  User,
  Shield,
  LogOut,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    label: "홈",
    href: "/home",
    icon: Home,
  },
  {
    label: "지원사업",
    href: "/projects",
    icon: Search,
  },
  {
    label: "내 프로젝트",
    href: "/my-projects",
    icon: FolderKanban,
  },
  {
    label: "파이프라인",
    href: "/pipeline",
    icon: Kanban,
  },
  {
    label: "기업설정",
    href: "/company",
    icon: Building2,
  },
  {
    label: "설정",
    href: "/settings/notifications",
    icon: Settings,
  },
];

interface NavbarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  isAdmin?: boolean;
}

/**
 * http:// URL을 https://로 변환 (Mixed Content 경고 방지)
 */
function ensureHttps(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
}

export function Navbar({ user, isAdmin = false }: NavbarProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/home") {
      return pathname === "/home";
    }
    return pathname.startsWith(href);
  };

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || user.email?.[0]?.toUpperCase() || "U";

  const safeImageUrl = ensureHttps(user.image);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl flex h-14 items-center">
        {/* Logo */}
        <Link href="/home" className="flex items-center gap-2 mr-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">K</span>
          </div>
          <span className="hidden font-semibold sm:inline-block">Konarae</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side: User Menu */}
        <div className="ml-auto flex items-center gap-2">
          {/* Desktop: UserMenu 드롭다운 */}
          <div className="hidden md:block">
            <UserMenu user={user} isAdmin={isAdmin} />
          </div>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation - 통합 메뉴 */}
      {isMobileMenuOpen && (
        <div id="mobile-menu" className="md:hidden border-t bg-background">
          <div className="container mx-auto px-4 max-w-7xl py-4 space-y-4">
            {/* 사용자 정보 섹션 */}
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar className="h-10 w-10">
                <AvatarImage src={safeImageUrl} alt={user.name || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
            </div>

            {/* 크레딧 정보 */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-md">
              <span className="text-xs text-muted-foreground">보유 크레딧</span>
              <CreditBalance size="sm" showIcon={true} />
            </div>

            <div className="h-px bg-border" />

            {/* 네비게이션 링크 */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="h-px bg-border" />

            {/* 추가 메뉴 */}
            <nav className="space-y-1">
              <Link
                href="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <User className="h-5 w-5" />
                대시보드
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Shield className="h-5 w-5" />
                  관리자 패널
                </Link>
              )}
            </nav>

            <div className="h-px bg-border" />

            {/* 로그아웃 */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleSignOut();
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              로그아웃
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
