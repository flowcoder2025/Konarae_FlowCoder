"use client";

import Link from "next/link";

const footerLinks = {
  product: {
    title: "제품",
    links: [
      { label: "지원사업 검색", href: "/projects" },
      { label: "AI 매칭", href: "/matching" },
      { label: "사업계획서", href: "/business-plans" },
      { label: "요금제", href: "/pricing" },
    ],
  },
  company: {
    title: "회사",
    links: [
      { label: "이용약관", href: "/terms" },
      { label: "개인정보처리방침", href: "/privacy" },
      { label: "환불정책", href: "/refund" },
    ],
  },
  support: {
    title: "지원",
    links: [
      { label: "문의하기", href: "mailto:support@flowmate.kr" },
    ],
  },
};

export function Footer() {
  return (
    <footer className="bg-muted/50 border-t">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="text-xl font-bold text-primary">
              FlowMate
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              AI 기반 정부 지원사업
              <br />
              매칭 플랫폼
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([key, section]) => (
            <div key={key}>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="my-8 border-t border-border" />

        <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} FlowMate. All rights reserved.</p>
          <p>Made with AI for Korean SMEs</p>
        </div>
      </div>
    </footer>
  );
}
