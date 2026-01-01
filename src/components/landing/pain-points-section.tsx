"use client";

import { motion } from "framer-motion";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { FileSearch, FileText, Clock, AlertCircle } from "lucide-react";

const painPoints = [
  {
    icon: FileSearch,
    title: "수백 개의 공고, 어디서 시작해야 할지 모르겠다",
    description: "K-Startup, 테크노파크, 소상공인24... 너무 많은 채널에서 정보가 쏟아집니다.",
  },
  {
    icon: FileText,
    title: "공고 문서가 너무 복잡하고 길다",
    description: "HWP, PDF 수십 장의 공고문을 일일이 읽고 우리 회사에 맞는지 확인하기 어렵습니다.",
  },
  {
    icon: Clock,
    title: "사업계획서 작성에 너무 많은 시간이 든다",
    description: "매번 비슷한 내용을 처음부터 작성하고, 평가 기준에 맞는지 확신이 없습니다.",
  },
  {
    icon: AlertCircle,
    title: "제출 전에 부족한 점을 알 수 없다",
    description: "선정 결과가 나오고 나서야 무엇이 부족했는지 알게 됩니다.",
  },
];

const containerVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export function PainPointsSection() {
  return (
    <Section spacing="lg" background="muted" className="relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-50 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--primary)_1px,transparent_1px)] bg-[length:24px_24px] opacity-5" />
      </div>

      <div className="container relative max-w-5xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-bold sm:text-4xl">
            이런 <span className="text-primary">고민</span>, 있으셨나요?
          </h2>
          <p className="max-w-2xl mx-auto mt-4 text-muted-foreground">
            중소기업과 스타트업이 정부 지원사업을 활용하면서 겪는 공통적인 어려움입니다.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-100px" }}
          className="grid gap-6 md:grid-cols-2"
        >
          {painPoints.map((point, index) => (
            <motion.div key={index} variants={itemVariants} transition={{ duration: 0.5 }}>
              <Card className="h-full transition-shadow border-0 shadow-sm hover:shadow-md bg-background">
                <CardContent className="flex gap-4 p-6">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg shrink-0 bg-destructive/10">
                    <point.icon className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{point.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{point.description}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  );
}
