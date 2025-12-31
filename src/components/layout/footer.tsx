"use client";

/**
 * Footer Component
 *
 * 전역 하단 푸터
 * - 로고/브랜드
 * - 주요 링크
 * - 저작권 정보
 */

import Link from "next/link";
import Image from "next/image";
import { SupportModal } from "@/components/support/support-modal";

const footerLinks = {
  service: [
    { label: "서비스 소개", href: "/about" },
    { label: "이용 가이드", href: "/guide" },
    { label: "자주 묻는 질문", href: "/faq" },
  ],
  legal: [
    { label: "이용약관", href: "/terms" },
    { label: "개인정보처리방침", href: "/privacy" },
    { label: "환불약관", href: "/refund" },
  ],
};

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl py-6 sm:py-10">
        {/* 상단: 로고 + 링크 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 mb-6">
          {/* 로고 & 설명 */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/home" className="flex items-center gap-2 mb-2">
              <Image
                src="/Flow_icon.png"
                alt="FlowMate"
                width={28}
                height={28}
                className="rounded-lg"
              />
              <span className="font-semibold">FlowMate</span>
            </Link>
            <p className="text-xs text-muted-foreground">
              정부 지원사업 매칭의 새로운 기준
            </p>
          </div>

          {/* 서비스 링크 */}
          <div>
            <h3 className="font-medium mb-2 text-xs">서비스</h3>
            <ul className="space-y-1">
              {footerLinks.service.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 법적 링크 */}
          <div>
            <h3 className="font-medium mb-2 text-xs">법적 고지</h3>
            <ul className="space-y-1">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 고객 지원 */}
          <div>
            <h3 className="font-medium mb-2 text-xs">고객 지원</h3>
            <ul className="space-y-1">
              <li>
                <SupportModal
                  triggerClassName="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                />
              </li>
              <li>
                <a
                  href="https://about.flow-coder.com/#contact"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  제휴 문의
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* 하단: 저작권 */}
        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground text-center">
            © {currentYear} FlowMate. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
