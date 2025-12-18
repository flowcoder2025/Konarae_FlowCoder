import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

interface BusinessPlanLayoutProps {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://konarae.com";

export async function generateMetadata({
  params,
}: BusinessPlanLayoutProps): Promise<Metadata> {
  const { id } = await params;

  const businessPlan = await prisma.businessPlan.findUnique({
    where: { id },
    select: {
      title: true,
      status: true,
      project: {
        select: {
          name: true,
          category: true,
        },
      },
      company: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!businessPlan) {
    return {
      title: "사업계획서를 찾을 수 없습니다",
      description: "요청하신 사업계획서를 찾을 수 없습니다.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const statusLabel =
    businessPlan.status === "draft"
      ? "초안"
      : businessPlan.status === "in_progress"
      ? "작성 중"
      : businessPlan.status === "completed"
      ? "완료"
      : "제출";

  const projectName = businessPlan.project?.name || "지원사업";
  const projectCategory = businessPlan.project?.category || "";
  const title = businessPlan.title || `${projectName} 사업계획서`;

  return {
    title: `${title} (${statusLabel})`,
    description: `${businessPlan.company.name}의 ${projectName} 지원사업 사업계획서`,
    keywords: [
      "사업계획서",
      businessPlan.company.name,
      projectName,
      projectCategory,
      "AI 작성",
    ].filter(Boolean),
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: `${title} | Konarae`,
      description: `${businessPlan.company.name}의 사업계획서`,
      type: "article",
      url: `${SITE_URL}/business-plans/${id}`,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
  };
}

export default function BusinessPlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
