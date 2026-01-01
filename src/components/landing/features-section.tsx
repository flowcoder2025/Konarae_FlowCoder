"use client";

import { motion } from "framer-motion";
import { Section } from "@/components/ui/section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Target, FileEdit, CheckCircle } from "lucide-react";

const features = [
  {
    icon: Search,
    badge: "자동 수집",
    title: "지원사업 크롤링 & 요약",
    description: "정부기관 포털에서 지원사업 공고를 자동으로 수집하고, AI가 핵심 내용을 요약해 드립니다.",
    highlights: [
      "K-Startup, 테크노파크, 소상공인24 등 주요 채널",
      "HWP/PDF 문서 자동 파싱 및 구조화",
      "AI 기반 핵심 정보 요약",
      "실시간 업데이트 및 마감일 알림",
    ],
  },
  {
    icon: Target,
    badge: "AI 매칭",
    title: "기업-지원사업 매칭",
    description: "귀사의 업종, 규모, 기술력을 분석하여 적합한 지원사업을 AI가 추천합니다.",
    highlights: [
      "다차원 매칭 알고리즘 (의미 + 규칙 기반)",
      "기업 프로필 기반 적합도 점수 산출",
      "개인화된 추천 및 매칭 이유 설명",
      "매칭 선호도 학습 및 지속적 개선",
    ],
  },
  {
    icon: FileEdit,
    badge: "AI 작성",
    title: "AI 사업계획서 초안",
    description: "기업 정보와 지원사업 요건을 반영한 사업계획서 초안을 AI가 자동으로 작성합니다.",
    highlights: [
      "지원사업별 맞춤형 템플릿 제공",
      "기업 프로필 + 지원사업 + 신규 사업 통합",
      "섹션별 AI 생성 및 사용자 편집",
      "PDF, DOCX, HWP 포맷 내보내기",
    ],
  },
  {
    icon: CheckCircle,
    badge: "사전 평가",
    title: "사업계획서 평가 피드백",
    description: "제출 전에 평가 기준에 따라 사업계획서를 미리 점검하고 개선점을 안내합니다.",
    highlights: [
      "지원사업 평가 기준에 따른 자동 평가",
      "항목별 점수 및 상세 피드백",
      "구체적인 개선 제안",
      "기존 문서 업로드 평가 지원",
    ],
  },
];

const containerVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
};

export function FeaturesSection() {
  return (
    <Section spacing="lg">
      <div className="container max-w-6xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <Badge variant="outline" className="mb-4">
            핵심 기능
          </Badge>
          <h2 className="text-3xl font-bold sm:text-4xl">
            <span className="text-primary">FlowMate</span>가 해결합니다
          </h2>
          <p className="max-w-2xl mx-auto mt-4 text-muted-foreground">
            정부 지원사업 활용의 전 과정을 AI가 지원합니다.
            <br className="hidden sm:block" />
            수집부터 작성, 평가까지 한 곳에서 해결하세요.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-100px" }}
          className="grid gap-8 md:grid-cols-2"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              transition={{ duration: 0.5 }}
            >
              <Card className="h-full transition-all border hover:border-primary/50 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <Badge variant="secondary" className="mb-1">
                        {feature.badge}
                      </Badge>
                      <CardTitle className="text-xl">{feature.title}</CardTitle>
                    </div>
                  </div>
                  <CardDescription className="mt-2 text-base">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.highlights.map((highlight, hIndex) => (
                      <li key={hIndex} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                        <span className="text-muted-foreground">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  );
}
