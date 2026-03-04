import { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  HeroSection,
  PainPointsSection,
  FeaturesSection,
  HowItWorksSection,
  SocialProofSection,
  CTASection,
  Footer,
} from "@/components/landing";

export const metadata: Metadata = {
  title: "FlowMate - 정부 지원사업 자동 매칭 플랫폼",
  description:
    "1,000개 이상 정부 지원사업에서 내 기업에 맞는 프로그램을 85% 정확도로 자동 매칭. AI가 사업계획서 초안까지 작성해드립니다. 신청 준비 시간 70% 절감.",
};

export default async function HomePage() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-col min-h-screen">
      <HeroSection />
      <PainPointsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <SocialProofSection />
      <CTASection />
      <Footer />
    </main>
  );
}
