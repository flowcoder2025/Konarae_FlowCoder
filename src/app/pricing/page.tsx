import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Sparkles, Zap, Shield, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "가격 안내 | FlowMate",
  description: "FlowMate 크레딧 가격 및 서비스 요금 안내",
};

export const dynamic = "force-static";

const FREE_FEATURES = [
  "매일 자동 매칭 - 무제한",
  "지원사업 탐색 및 검색",
  "마스터 프로필 관리",
  "증빙 보관함 (10GB)",
  "알림 및 캘린더 연동",
  "패키징 & Zip 생성",
];

const CREDIT_FEATURES = [
  {
    name: "부족항목 진단",
    description: "공고 요구사항 대비 부족한 증빙/자격 분석",
    standardCredit: 15,
    standardPrice: "3,000원",
    proCredit: 30,
    proPrice: "6,000원",
    proLabel: "심층 분석",
  },
  {
    name: "AI 계획서 생성",
    description: "마스터 프로필 기반 사업계획서 초안 자동 생성",
    standardCredit: 60,
    standardPrice: "12,000원",
    proCredit: 120,
    proPrice: "24,000원",
    proLabel: "고급 모델",
  },
  {
    name: "제출 전 검증",
    description: "정합성, 누락, 형식 오류 자동 점검",
    standardCredit: 15,
    standardPrice: "3,000원",
    proCredit: 30,
    proPrice: "6,000원",
    proLabel: "심층 검증",
  },
];

const CREDIT_PACKAGES = [
  {
    credits: 50,
    price: 10000,
    perCredit: 200,
    discount: 0,
    popular: false,
  },
  {
    credits: 100,
    price: 20000,
    perCredit: 200,
    discount: 0,
    popular: false,
  },
  {
    credits: 300,
    price: 54000,
    perCredit: 180,
    discount: 10,
    popular: true,
  },
  {
    credits: 500,
    price: 85000,
    perCredit: 170,
    discount: 15,
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          홈으로 돌아가기
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">심플한 크레딧 기반 요금제</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            기본 기능은 <span className="text-primary font-semibold">영구 무료</span>.
            AI 기능이 필요할 때만 크레딧을 사용하세요.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="border rounded-2xl p-8 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Free Forever</h2>
                <p className="text-green-600 dark:text-green-400 font-medium">월 0원 - 영구 무료</p>
              </div>
            </div>
            <p className="text-muted-foreground mb-6">
              지원사업 매칭부터 프로필 관리까지, 핵심 기능을 무료로 이용하세요.
            </p>
            <ul className="space-y-3">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full mt-8" variant="outline" asChild>
              <Link href="/login">무료로 시작하기</Link>
            </Button>
          </div>

          <div className="border rounded-2xl p-8 border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Credit</h2>
                <p className="text-primary font-medium">1 Credit = 200원</p>
              </div>
            </div>
            <p className="text-muted-foreground mb-6">
              AI 분석, 생성, 검증 기능을 필요한 만큼만 사용하세요.
            </p>
            <div className="space-y-4">
              {CREDIT_FEATURES.map((feature) => (
                <div key={feature.name} className="bg-background/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{feature.name}</h3>
                    <Badge variant="outline" className="font-mono">
                      {feature.standardCredit}C
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
            <Button className="w-full mt-8" asChild>
              <Link href="/login">시작하기</Link>
            </Button>
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">크레딧 기능 상세</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4 font-semibold">기능</th>
                  <th className="text-center py-4 px-4 font-semibold">
                    <div className="flex items-center justify-center gap-2">
                      <Shield className="h-4 w-4" />
                      Standard
                    </div>
                  </th>
                  <th className="text-center py-4 px-4 font-semibold">
                    <div className="flex items-center justify-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      Pro
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CREDIT_FEATURES.map((feature) => (
                  <tr key={feature.name} className="border-b">
                    <td className="py-4 px-4">
                      <div className="font-medium">{feature.name}</div>
                      <div className="text-sm text-muted-foreground">{feature.description}</div>
                    </td>
                    <td className="text-center py-4 px-4">
                      <div className="font-semibold text-primary">{feature.standardCredit} Credit</div>
                      <div className="text-sm text-muted-foreground">{feature.standardPrice}</div>
                    </td>
                    <td className="text-center py-4 px-4">
                      <div className="font-semibold text-amber-600">{feature.proCredit} Credit</div>
                      <div className="text-sm text-muted-foreground">{feature.proPrice}</div>
                      <Badge variant="secondary" className="mt-1 text-xs">{feature.proLabel}</Badge>
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/30">
                  <td className="py-4 px-4 font-medium">평균 1건 완료</td>
                  <td className="text-center py-4 px-4">
                    <div className="font-bold text-lg">90 Credit</div>
                    <div className="text-muted-foreground">18,000원</div>
                  </td>
                  <td className="text-center py-4 px-4">
                    <div className="font-bold text-lg text-amber-600">180 Credit</div>
                    <div className="text-muted-foreground">36,000원</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-2">크레딧 패키지</h2>
          <p className="text-center text-muted-foreground mb-8">
            대량 구매 시 최대 15% 할인
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CREDIT_PACKAGES.map((pkg) => (
              <div
                key={pkg.credits}
                className={`relative border rounded-xl p-6 text-center transition-all hover:shadow-lg ${
                  pkg.popular
                    ? "border-primary bg-primary/5 scale-105"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {pkg.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    인기
                  </Badge>
                )}
                <div className="text-3xl font-bold mb-1">{pkg.credits}</div>
                <div className="text-muted-foreground mb-4">Credit</div>
                <div className="text-2xl font-bold text-primary mb-1">
                  {pkg.price.toLocaleString()}원
                </div>
                <div className="text-sm text-muted-foreground mb-2">
                  Credit당 {pkg.perCredit}원
                </div>
                {pkg.discount > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    {pkg.discount}% 할인
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-muted/30 rounded-2xl p-8 mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">자주 묻는 질문</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">크레딧 유효기간이 있나요?</h3>
              <p className="text-muted-foreground">
                유료 구매 크레딧은 유효기간이 없습니다. 보너스 크레딧은 지급일로부터 30일간 유효합니다.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">환불이 가능한가요?</h3>
              <p className="text-muted-foreground">
                미사용 크레딧은 구매일로부터 7일 이내 전액 환불 가능합니다.{" "}
                <Link href="/refund" className="text-primary hover:underline">환불약관</Link> 참조
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Standard와 Pro의 차이는?</h3>
              <p className="text-muted-foreground">
                Pro는 더 정밀한 AI 모델을 사용하여 심층 분석과 고품질 결과물을 제공합니다.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">무료 기능만으로도 충분한가요?</h3>
              <p className="text-muted-foreground">
                네! 공고 매칭, 프로필 관리, 증빙 보관 등 핵심 기능은 완전 무료입니다. AI 기능은 필요할 때만 사용하세요.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center bg-primary/5 rounded-2xl p-8 border border-primary/20">
          <h2 className="text-2xl font-bold mb-4">지금 시작하세요</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            가입 즉시 무료 기능을 모두 이용할 수 있습니다.
            <br />
            크레딧은 AI 기능이 필요할 때 구매하세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/login">무료로 시작하기</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/terms">이용약관 확인</Link>
            </Button>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t flex flex-wrap gap-4 text-sm justify-center">
          <Link href="/terms" className="text-muted-foreground hover:text-primary">
            이용약관
          </Link>
          <Link href="/privacy" className="text-muted-foreground hover:text-primary">
            개인정보처리방침
          </Link>
          <Link href="/refund" className="text-muted-foreground hover:text-primary">
            환불약관
          </Link>
        </div>
      </div>
    </div>
  );
}
