import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { JsonLd } from "@/components/seo/json-ld";

const GA_MEASUREMENT_ID = "G-QRKWZT1Y5R";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mate.flow-coder.com";
const SITE_NAME = "FlowMate";
const SITE_DESCRIPTION = "정부지원사업 공고의 조건, 혜택, 준비 전략을 한 화면에서 정리하는 FlowMate 지원사업 전략 보드";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - 지원사업 전략 보드`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "정부지원사업",
    "중소기업 지원",
    "스타트업 지원금",
    "사업계획서 AI",
    "지원사업 매칭",
    "창업지원",
    "R&D 지원",
    "소상공인 지원",
  ],
  authors: [{ name: "FlowMate", url: SITE_URL }],
  creator: "FlowMate",
  publisher: "FlowMate",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  verification: {
    other: {
      "naver-site-verification": process.env.NAVER_SITE_VERIFICATION || "",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} - 지원사업 전략 보드`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} - 지원사업 전략 보드`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - 지원사업 전략 보드`,
    description: SITE_DESCRIPTION,
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: SITE_URL,
  },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <JsonLd />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
