"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";

const companyFormSchema = z.object({
  // 기본 정보
  name: z.string().min(1, "기업명은 필수입니다"),
  businessNumber: z.string().regex(/^\d{10}$/, "사업자등록번호는 10자리 숫자입니다"),
  corporationNumber: z.string().optional(),
  representativeName: z.string().min(1, "대표자명은 필수입니다"),
  establishedDate: z.string().min(1, "설립일은 필수입니다"),
  companyType: z.string().min(1, "기업 형태는 필수입니다"),
  // 연락처
  phone: z.string().min(1, "전화번호는 필수입니다"),
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
  // 주소
  address: z.string().min(1, "주소는 필수입니다"),
  addressDetail: z.string().optional(),
  zipcode: z.string().optional(),
  // 사업 정보 (매칭용 상세정보)
  businessCategory: z.string().optional(),
  mainBusiness: z.string().optional(),
  businessItemsText: z.string().optional(), // 쉼표로 구분된 문자열
  // 기업 소개
  introduction: z.string().optional(),
  vision: z.string().optional(),
  mission: z.string().optional(),
});

type CompanyFormValues = z.infer<typeof companyFormSchema>;

export function CompanyForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
  });

  const onSubmit = async (data: CompanyFormValues) => {
    setIsSubmitting(true);
    try {
      // businessItemsText를 배열로 변환
      const { businessItemsText, ...rest } = data;
      const businessItems = businessItemsText
        ? businessItemsText.split(",").map((item) => item.trim()).filter(Boolean)
        : [];

      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...rest, businessItems }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "기업 등록에 실패했습니다");
      }

      const company = await response.json();
      toast.success("기업이 성공적으로 등록되었습니다");
      router.push(`/companies/${company.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "오류가 발생했습니다");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
            <CardDescription>기업의 기본 정보를 입력해주세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">기업명 *</Label>
                <Input id="name" {...register("name")} placeholder="주식회사 코나래" />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessNumber">사업자등록번호 *</Label>
                <Input
                  id="businessNumber"
                  {...register("businessNumber")}
                  placeholder="1234567890"
                  maxLength={10}
                />
                {errors.businessNumber && (
                  <p className="text-sm text-destructive">{errors.businessNumber.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="representativeName">대표자명 *</Label>
                <Input
                  id="representativeName"
                  {...register("representativeName")}
                  placeholder="홍길동"
                />
                {errors.representativeName && (
                  <p className="text-sm text-destructive">{errors.representativeName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="establishedDate">설립일 *</Label>
                <Input
                  id="establishedDate"
                  type="date"
                  {...register("establishedDate")}
                />
                {errors.establishedDate && (
                  <p className="text-sm text-destructive">{errors.establishedDate.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyType">기업 형태 *</Label>
              <Input
                id="companyType"
                {...register("companyType")}
                placeholder="주식회사, 유한회사 등"
              />
              {errors.companyType && (
                <p className="text-sm text-destructive">{errors.companyType.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>연락처 정보</CardTitle>
            <CardDescription>기업의 연락처 정보를 입력해주세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">전화번호 *</Label>
                <Input
                  id="phone"
                  {...register("phone")}
                  placeholder="02-1234-5678"
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">이메일 *</Label>
                <Input
                  id="email"
                  type="email"
                  {...register("email")}
                  placeholder="contact@konarae.com"
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>주소 정보</CardTitle>
            <CardDescription>기업의 주소를 입력해주세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">주소 *</Label>
              <Input
                id="address"
                {...register("address")}
                placeholder="서울특별시 강남구 테헤란로 123"
              />
              {errors.address && (
                <p className="text-sm text-destructive">{errors.address.message}</p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="addressDetail">상세 주소</Label>
                <Input
                  id="addressDetail"
                  {...register("addressDetail")}
                  placeholder="4층 401호"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipcode">우편번호</Label>
                <Input
                  id="zipcode"
                  {...register("zipcode")}
                  placeholder="06234"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              사업 정보
              <span className="text-xs font-normal text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                매칭 정확도 향상
              </span>
            </CardTitle>
            <CardDescription className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
              <span>
                상세한 사업 정보를 입력하면 지원사업 매칭 정확도가 크게 향상됩니다.
                업종, 사업내용, 주요 아이템을 구체적으로 작성해주세요.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="businessCategory">업종</Label>
                <Input
                  id="businessCategory"
                  {...register("businessCategory")}
                  placeholder="예: 소프트웨어 개발, 제조업, 서비스업"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mainBusiness">주요 사업내용</Label>
                <Input
                  id="mainBusiness"
                  {...register("mainBusiness")}
                  placeholder="예: 인공지능 기반 데이터 분석 솔루션 개발"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessItemsText">주요 아이템/제품</Label>
              <Input
                id="businessItemsText"
                {...register("businessItemsText")}
                placeholder="쉼표로 구분하여 입력 (예: AI챗봇, 데이터분석, 클라우드서비스)"
              />
              <p className="text-xs text-muted-foreground">
                여러 아이템은 쉼표(,)로 구분하여 입력해주세요
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>기업 소개</CardTitle>
            <CardDescription>기업의 비전과 미션을 입력해주세요 (선택사항)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="introduction">기업 소개</Label>
              <Textarea
                id="introduction"
                {...register("introduction")}
                placeholder="기업의 설립 배경, 핵심 역량, 주요 성과 등을 자유롭게 작성해주세요"
                rows={4}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vision">비전</Label>
                <Input
                  id="vision"
                  {...register("vision")}
                  placeholder="예: 데이터로 세상을 더 스마트하게"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mission">미션</Label>
                <Input
                  id="mission"
                  {...register("mission")}
                  placeholder="예: 혁신적인 AI 기술로 고객 성공 지원"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "등록 중..." : "기업 등록"}
          </Button>
        </div>
      </div>
    </form>
  );
}
