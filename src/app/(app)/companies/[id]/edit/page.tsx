"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lightbulb, Loader2, ArrowLeft, FolderOpen } from "lucide-react";
import Link from "next/link";
import { use } from "react";

const companyEditSchema = z.object({
  name: z.string().min(1, "기업명은 필수입니다"),
  representativeName: z.string().min(1, "대표자명은 필수입니다"),
  companyType: z.string().min(1, "기업 형태는 필수입니다"),
  phone: z.string().min(1, "전화번호는 필수입니다"),
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
  address: z.string().min(1, "주소는 필수입니다"),
  addressDetail: z.string().optional(),
  zipcode: z.string().optional(),
  businessCategory: z.string().optional(),
  mainBusiness: z.string().optional(),
  businessItemsText: z.string().optional(),
  introduction: z.string().optional(),
  vision: z.string().optional(),
  mission: z.string().optional(),
  isVenture: z.boolean().optional(),
  isInnoBiz: z.boolean().optional(),
  isMainBiz: z.boolean().optional(),
  isSocial: z.boolean().optional(),
  isWomen: z.boolean().optional(),
  isDisabled: z.boolean().optional(),
});

type CompanyEditValues = z.infer<typeof companyEditSchema>;

export default function CompanyEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CompanyEditValues>({
    resolver: zodResolver(companyEditSchema),
  });

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const response = await fetch(`/api/companies/${id}`);
        if (!response.ok) {
          throw new Error("기업 정보를 불러올 수 없습니다");
        }
        const company = await response.json();

        setValue("name", company.name);
        setValue("representativeName", company.representativeName);
        setValue("companyType", company.companyType);
        setValue("phone", company.phone);
        setValue("email", company.email);
        setValue("address", company.address);
        setValue("addressDetail", company.addressDetail || "");
        setValue("zipcode", company.zipcode || "");
        setValue("businessCategory", company.businessCategory || "");
        setValue("mainBusiness", company.mainBusiness || "");
        setValue("businessItemsText", company.businessItems?.join(", ") || "");
        setValue("introduction", company.introduction || "");
        setValue("vision", company.vision || "");
        setValue("mission", company.mission || "");
        setValue("isVenture", company.isVenture || false);
        setValue("isInnoBiz", company.isInnoBiz || false);
        setValue("isMainBiz", company.isMainBiz || false);
        setValue("isSocial", company.isSocial || false);
        setValue("isWomen", company.isWomen || false);
        setValue("isDisabled", company.isDisabled || false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "오류가 발생했습니다");
        router.push(`/companies/${id}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompany();
  }, [id, setValue, router]);

  const onSubmit = async (data: CompanyEditValues) => {
    setIsSubmitting(true);
    try {
      const { businessItemsText, ...rest } = data;
      const businessItems = businessItemsText
        ? businessItemsText.split(",").map((item) => item.trim()).filter(Boolean)
        : [];

      const response = await fetch(`/api/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, businessItems }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "기업 수정에 실패했습니다");
      }

      toast.success("기업 정보가 수정되었습니다");
      router.push(`/companies/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "오류가 발생했습니다");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-6xl">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="mb-8">
        <Link
          href={`/companies/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          기업 상세로 돌아가기
        </Link>
        <h1 className="text-3xl font-bold">기업 정보 수정</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>기본 정보</CardTitle>
              <CardDescription>기업의 기본 정보를 수정해주세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">기업명 *</Label>
                  <Input id="name" {...register("name")} />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="representativeName">대표자명 *</Label>
                  <Input id="representativeName" {...register("representativeName")} />
                  {errors.representativeName && (
                    <p className="text-sm text-destructive">{errors.representativeName.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyType">기업 형태 *</Label>
                <Input id="companyType" {...register("companyType")} placeholder="주식회사, 유한회사 등" />
                {errors.companyType && (
                  <p className="text-sm text-destructive">{errors.companyType.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>연락처 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">전화번호 *</Label>
                  <Input id="phone" {...register("phone")} />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">이메일 *</Label>
                  <Input id="email" type="email" {...register("email")} />
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
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">주소 *</Label>
                <Input id="address" {...register("address")} />
                {errors.address && (
                  <p className="text-sm text-destructive">{errors.address.message}</p>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="addressDetail">상세 주소</Label>
                  <Input id="addressDetail" {...register("addressDetail")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipcode">우편번호</Label>
                  <Input id="zipcode" {...register("zipcode")} />
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
                    placeholder="예: 소프트웨어 개발, 제조업"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mainBusiness">주요 사업내용</Label>
                  <Input
                    id="mainBusiness"
                    {...register("mainBusiness")}
                    placeholder="예: AI 기반 데이터 분석 솔루션"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessItemsText">주요 아이템/제품</Label>
                <Input
                  id="businessItemsText"
                  {...register("businessItemsText")}
                  placeholder="쉼표로 구분 (예: AI챗봇, 데이터분석)"
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
              <CardDescription>기업의 비전과 미션을 입력해주세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="introduction">기업 소개</Label>
                <Textarea
                  id="introduction"
                  {...register("introduction")}
                  placeholder="기업의 설립 배경, 핵심 역량, 주요 성과 등"
                  rows={4}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vision">비전</Label>
                  <Input id="vision" {...register("vision")} placeholder="예: 데이터로 세상을 더 스마트하게" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mission">미션</Label>
                  <Input id="mission" {...register("mission")} placeholder="예: 혁신적인 AI 기술로 고객 성공 지원" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>인증 현황</CardTitle>
              <CardDescription>보유한 인증을 선택해주세요</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="isVenture" className="cursor-pointer">벤처기업</Label>
                  <Switch
                    id="isVenture"
                    checked={watch("isVenture")}
                    onCheckedChange={(checked) => setValue("isVenture", checked)}
                  />
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="isInnoBiz" className="cursor-pointer">이노비즈</Label>
                  <Switch
                    id="isInnoBiz"
                    checked={watch("isInnoBiz")}
                    onCheckedChange={(checked) => setValue("isInnoBiz", checked)}
                  />
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="isMainBiz" className="cursor-pointer">메인비즈</Label>
                  <Switch
                    id="isMainBiz"
                    checked={watch("isMainBiz")}
                    onCheckedChange={(checked) => setValue("isMainBiz", checked)}
                  />
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="isSocial" className="cursor-pointer">사회적기업</Label>
                  <Switch
                    id="isSocial"
                    checked={watch("isSocial")}
                    onCheckedChange={(checked) => setValue("isSocial", checked)}
                  />
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="isWomen" className="cursor-pointer">여성기업</Label>
                  <Switch
                    id="isWomen"
                    checked={watch("isWomen")}
                    onCheckedChange={(checked) => setValue("isWomen", checked)}
                  />
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="isDisabled" className="cursor-pointer">장애인기업</Label>
                  <Switch
                    id="isDisabled"
                    checked={watch("isDisabled")}
                    onCheckedChange={(checked) => setValue("isDisabled", checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                기업 문서 관리
              </CardTitle>
              <CardDescription>
                각종 서류를 업로드하면 AI가 자동으로 분석하여 매칭 및 사업계획서 작성에 활용합니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">사업자등록증, 재무제표, 인증서 등</span> 10종류의 문서를 업로드할 수 있습니다
                    </p>
                  </div>
                  <Link href={`/companies/${id}/documents`}>
                    <Button variant="outline" className="w-full">
                      <FolderOpen className="h-4 w-4 mr-2" />
                      문서 관리 페이지로 이동
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/companies/${id}`)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  저장 중...
                </>
              ) : (
                "저장"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
