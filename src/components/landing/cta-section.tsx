"use client";

import { motion } from "framer-motion";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";

export function CTASection() {
  return (
    <Section spacing="lg" className="relative overflow-hidden bg-primary">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
      </div>

      <div className="container relative max-w-4xl px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl font-bold text-primary-foreground sm:text-4xl md:text-5xl">
            지금 바로 시작하세요
          </h2>
          <p className="max-w-xl mx-auto mt-4 text-lg text-primary-foreground/80">
            귀사에 맞는 지원사업을 AI가 찾아드립니다.
            <br />
            무료로 시작하고, 사업계획서까지 한 번에 완성하세요.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-col items-center justify-center gap-4 mt-10 sm:flex-row"
        >
          <Button
            size="lg"
            className="w-full sm:w-auto bg-white text-primary hover:bg-white/90"
            asChild
          >
            <Link href="/login">
              무료로 시작하기
              <Sparkles className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto border-white/30 text-primary-foreground hover:bg-white/10"
            asChild
          >
            <Link href="/pricing">
              요금제 보기
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-6 mt-10 text-sm text-primary-foreground/70"
        >
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            신용카드 불필요
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            무료 플랜 제공
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            언제든지 취소 가능
          </span>
        </motion.div>
      </div>
    </Section>
  );
}
