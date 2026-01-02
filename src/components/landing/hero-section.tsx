"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
};

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container relative mx-auto max-w-5xl px-4 py-20 text-center">
        {/* Badge */}
        <motion.div
          {...fadeInUp}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="inline-flex items-center gap-2 px-4 py-2 mb-8 text-sm font-medium rounded-full bg-primary/10 text-primary"
        >
          <Sparkles className="w-4 h-4" />
          AI 기반 정부 지원사업 매칭 플랫폼
        </motion.div>

        {/* Headline */}
        <motion.h1
          {...fadeInUp}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          <span className="text-foreground">정부 지원사업,</span>
          <br />
          <span className="text-primary">AI가 찾아드립니다</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          {...fadeInUp}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="max-w-2xl mx-auto mt-6 text-lg text-muted-foreground sm:text-xl"
        >
          수백 개의 지원사업 중 귀사에 적합한 사업을 AI가 분석하고,
          <br className="hidden sm:block" />
          사업계획서 작성부터 제출 전 평가까지 한 번에 지원합니다.
        </motion.p>

        {/* Stats preview */}
        <motion.div
          {...fadeInUp}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-8 mt-8 text-sm text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">1,000+</span>
            <span>지원사업 수집</span>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">AI</span>
            <span>맞춤 매칭</span>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">자동</span>
            <span>사업계획서</span>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          {...scaleIn}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 mt-10 sm:flex-row"
        >
          <Button size="lg" className="w-full sm:w-auto" asChild>
            <Link href="/login">
              무료로 시작하기
              <Sparkles className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/projects">
              지원사업 둘러보기
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </motion.div>

        {/* Trust note */}
        <motion.p
          {...fadeInUp}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-8 text-sm text-muted-foreground"
        >
          신용카드 불필요 • 무료 플랜으로 바로 시작
        </motion.p>
      </div>
    </section>
  );
}
