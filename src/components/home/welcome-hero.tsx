"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Sparkles, Target, Shield, Zap } from "lucide-react";
import Link from "next/link";

interface WelcomeHeroProps {
  userName: string | null;
  hasCompany: boolean;
}

export function WelcomeHero({ userName, hasCompany }: WelcomeHeroProps) {
  // Returning user with company
  if (hasCompany) {
    return (
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          {userName ? `${userName}님, 안녕하세요!` : "안녕하세요!"}
        </h1>
        <p className="text-muted-foreground">
          오늘도 지원사업 성공을 위해 함께해요
        </p>
      </div>
    );
  }

  // First time user - show onboarding hero
  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
      <CardContent className="py-12 px-8">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            AI 기반 지원사업 매칭 서비스
          </div>

          <h1 className="text-4xl font-bold tracking-tight">
            {userName ? (
              <>{userName}님을 위한<br />맞춤 지원사업을 찾아드려요</>
            ) : (
              <>기업에 딱 맞는<br />지원사업을 찾아드려요</>
            )}
          </h1>

          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            기업 정보만 입력하면 적합한 지원사업을 추천해드리고,
            <br />
            제출까지 체계적으로 도와드려요
          </p>

          <div className="flex justify-center gap-4 pt-4">
            <Button size="lg" asChild>
              <Link href="/company">
                시작하기
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/projects">
                지원사업 둘러보기
              </Link>
            </Button>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 p-4 bg-background/80 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium">AI 맞춤 매칭</p>
              <p className="text-sm text-muted-foreground">적합도 분석</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-background/80 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium">부족항목 진단</p>
              <p className="text-sm text-muted-foreground">사전 검증</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-background/80 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium">제출 전 점검</p>
              <p className="text-sm text-muted-foreground">자동 검증</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
