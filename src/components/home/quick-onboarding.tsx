"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowRight, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// 업종 분류 (간소화)
const INDUSTRIES = [
  { value: "manufacturing", label: "제조업" },
  { value: "it_software", label: "IT/소프트웨어" },
  { value: "bio_medical", label: "바이오/의료" },
  { value: "retail_service", label: "유통/서비스" },
  { value: "food_beverage", label: "식품/음료" },
  { value: "construction", label: "건설/건축" },
  { value: "logistics", label: "물류/운송" },
  { value: "contents_media", label: "콘텐츠/미디어" },
  { value: "energy_environment", label: "에너지/환경" },
  { value: "other", label: "기타" },
] as const;

// 기업 규모
const COMPANY_SIZES = [
  { value: "startup", label: "예비/초기 창업 (1~5인)" },
  { value: "small", label: "소기업 (5~50인)" },
  { value: "medium", label: "중기업 (50~300인)" },
  { value: "midsize", label: "중견기업 (300인 이상)" },
] as const;

// 관심 분야 (매칭 카테고리와 동기화)
const INTEREST_CATEGORIES = [
  "인력",
  "수출",
  "창업",
  "기술",
  "자금",
  "판로",
  "경영",
  "R&D",
  "글로벌",
  "사업화",
] as const;

interface QuickOnboardingProps {
  onComplete?: () => void;
}

export function QuickOnboarding({ onComplete }: QuickOnboardingProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [industry, setIndustry] = useState<string>("");
  const [companySize, setCompanySize] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);

  const toggleInterest = (category: string) => {
    setInterests((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : prev.length < 5
        ? [...prev, category]
        : prev
    );
  };

  const canProceedStep1 = industry !== "";
  const canProceedStep2 = companySize !== "";
  const canSubmit = industry && companySize;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      // Create quick company profile
      const res = await fetch("/api/companies/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry,
          companySize,
          interests,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "등록에 실패했습니다");
      }

      const { companyId } = await res.json();

      // Trigger matching
      await fetch("/api/matching/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });

      // Refresh page to show results
      router.refresh();
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-lg">빠른 시작</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          간단한 정보만 입력하면 맞춤 지원사업을 찾아드려요
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                s < step
                  ? "bg-primary text-primary-foreground"
                  : s === step
                  ? "bg-primary/20 text-primary border-2 border-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
          ))}
        </div>

        {/* Step 1: Industry */}
        {step === 1 && (
          <div className="space-y-4">
            <Label className="text-base font-medium">
              어떤 업종인가요? <span className="text-destructive">*</span>
            </Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="업종을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind.value} value={ind.value}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
            >
              다음
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 2: Company Size */}
        {step === 2 && (
          <div className="space-y-4">
            <Label className="text-base font-medium">
              기업 규모는요? <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={companySize}
              onValueChange={setCompanySize}
              className="space-y-2"
            >
              {COMPANY_SIZES.map((size) => (
                <div
                  key={size.value}
                  className={cn(
                    "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    companySize === size.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => setCompanySize(size.value)}
                >
                  <RadioGroupItem value={size.value} id={size.value} />
                  <Label htmlFor={size.value} className="cursor-pointer flex-1">
                    {size.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
              >
                이전
              </Button>
              <Button
                className="flex-1"
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
              >
                다음
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Interests (Optional) */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">
                관심 있는 분야가 있나요?
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                선택사항이에요. 최대 5개까지 선택할 수 있어요.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {INTEREST_CATEGORIES.map((category) => (
                <Badge
                  key={category}
                  variant={interests.includes(category) ? "default" : "outline"}
                  className={cn(
                    "cursor-pointer transition-colors px-3 py-1.5",
                    interests.includes(category)
                      ? "bg-primary hover:bg-primary/90"
                      : "hover:bg-primary/10"
                  )}
                  onClick={() => toggleInterest(category)}
                >
                  {category}
                  {interests.includes(category) && (
                    <Check className="h-3 w-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(2)}
                disabled={loading}
              >
                이전
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={loading || !canSubmit}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    매칭 중...
                  </>
                ) : (
                  <>
                    매칭 결과 보기
                    <Sparkles className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Skip link */}
        {step < 3 && (
          <div className="text-center">
            <button
              className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
              onClick={() => router.push("/companies/new")}
            >
              상세 정보 입력하기
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
