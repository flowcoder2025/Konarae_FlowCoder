"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Building2, TrendingUp, Clock } from "lucide-react";

const stats = [
  {
    icon: FileText,
    value: 1000,
    suffix: "+",
    label: "수집된 지원사업",
    description: "실시간으로 업데이트되는 정부 지원사업 공고",
  },
  {
    icon: Building2,
    value: 100,
    suffix: "+",
    label: "등록 기업",
    description: "FlowMate를 활용하는 중소기업과 스타트업",
  },
  {
    icon: TrendingUp,
    value: 85,
    suffix: "%",
    label: "매칭 정확도",
    description: "AI 기반 다차원 매칭 알고리즘의 성능",
  },
  {
    icon: Clock,
    value: 70,
    suffix: "%",
    label: "시간 절감",
    description: "사업계획서 작성 시간 평균 단축률",
  },
];

// Animated counter component
function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (hasAnimated) return;

    const controls = animate(0, value, {
      duration: 2,
      onUpdate: (v) => setDisplayValue(Math.round(v)),
      onComplete: () => setHasAnimated(true),
    });

    return () => controls.stop();
  }, [value, hasAnimated]);

  return (
    <span className="text-4xl font-bold text-primary">
      {displayValue.toLocaleString()}{suffix}
    </span>
  );
}

const containerVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
};

export function SocialProofSection() {
  return (
    <Section spacing="lg">
      <div className="container max-w-5xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <Badge variant="outline" className="mb-4">
            성과
          </Badge>
          <h2 className="text-3xl font-bold sm:text-4xl">
            <span className="text-primary">FlowMate</span>의 성과
          </h2>
          <p className="max-w-xl mx-auto mt-4 text-muted-foreground">
            AI 기반 지원사업 매칭 플랫폼으로 더 나은 결과를 만들어가고 있습니다.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-100px" }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              transition={{ duration: 0.5 }}
            >
              <Card className="h-full text-center transition-shadow border hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10">
                    <stat.icon className="w-6 h-6 text-primary" />
                  </div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                  >
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                  </motion.div>
                  <p className="mt-2 font-medium text-foreground">{stat.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Placeholder for testimonials */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 text-center"
        >
          <div className="p-8 border rounded-lg bg-muted/50 border-dashed">
            <p className="text-muted-foreground">
              고객 후기 및 파트너사 로고는 서비스 확장 시 추가될 예정입니다.
            </p>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}
