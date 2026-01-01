"use client";

import { motion } from "framer-motion";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Building2, Sparkles, FileCheck, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Building2,
    title: "기업 정보 등록",
    description: "간단한 기업 정보를 입력하세요. 업종, 규모, 기술력 등 핵심 정보만으로 충분합니다.",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "AI 맞춤 매칭",
    description: "AI가 1,000개 이상의 지원사업 중 귀사에 적합한 사업을 분석하고 추천합니다.",
  },
  {
    number: "03",
    icon: FileCheck,
    title: "사업계획서 완성",
    description: "선택한 지원사업에 맞는 사업계획서 초안을 AI가 작성하고, 평가 피드백을 제공합니다.",
  },
];

const containerVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export function HowItWorksSection() {
  return (
    <Section spacing="lg" background="muted">
      <div className="container max-w-5xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <Badge variant="outline" className="mb-4">
            이용 방법
          </Badge>
          <h2 className="text-3xl font-bold sm:text-4xl">
            3단계로 <span className="text-primary">간단하게</span> 시작하세요
          </h2>
          <p className="max-w-xl mx-auto mt-4 text-muted-foreground">
            복잡한 절차 없이 빠르게 지원사업 매칭과 사업계획서 작성을 시작할 수 있습니다.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-100px" }}
          className="relative"
        >
          {/* Connection line - desktop */}
          <div className="absolute hidden md:block top-[60px] left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-border">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.5 }}
            />
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                transition={{ duration: 0.5 }}
                className="relative"
              >
                <div className="flex flex-col items-center text-center">
                  {/* Step number circle */}
                  <motion.div
                    className="relative z-10 flex items-center justify-center w-24 h-24 mb-6 rounded-full bg-background border-2 border-primary shadow-lg"
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <step.icon className="w-10 h-10 text-primary" />
                    <span className="absolute -top-2 -right-2 flex items-center justify-center w-8 h-8 text-sm font-bold text-primary-foreground bg-primary rounded-full">
                      {step.number}
                    </span>
                  </motion.div>

                  {/* Content */}
                  <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {step.description}
                  </p>
                </div>

                {/* Arrow for mobile */}
                {index < steps.length - 1 && (
                  <div className="flex justify-center my-4 md:hidden">
                    <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </Section>
  );
}
