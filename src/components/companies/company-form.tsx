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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Lightbulb, Upload, FileText, CheckCircle2, Sparkles } from "lucide-react";

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

  // 사업자등록증 업로드 관련 state
  const [businessRegFile, setBusinessRegFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzed, setAnalyzed] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
  });

  // 사업자등록증 분석 함수
  const handleFileAnalyze = async (file: File) => {
    try {
      setAnalyzing(true);
      setAnalyzeProgress(10);
      setBusinessRegFile(file);

      const formData = new FormData();
      formData.append("file", file);

      setAnalyzeProgress(30);

      const response = await fetch("/api/documents/analyze-temp", {
        method: "POST",
        body: formData,
      });

      setAnalyzeProgress(60);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "분석 실패");
      }

      const result = await response.json();
      setAnalyzeProgress(80);

      // 추출된 정보를 폼 필드에 자동 입력
      if (result.data) {
        const data = result.data as any;

        // 상호/기업명 (businessName)
        if (data.businessName) {
          setValue("name", data.businessName);

          // 기업 형태 추출 (주식회사, 유한회사 등)
          const companyTypeMatch = data.businessName.match(/(주식회사|유한회사|합자회사|합명회사|유한책임회사)/);
          if (companyTypeMatch) {
            setValue("companyType", companyTypeMatch[1]);
          }
        }

        // 사업자등록번호 (businessNumber - 숫자만 추출)
        if (data.businessNumber) {
          const bizNum = data.businessNumber.replace(/[^0-9]/g, "");
          setValue("businessNumber", bizNum);
        }

        // 대표자명 (representativeName)
        if (data.representativeName) {
          setValue("representativeName", data.representativeName);
        }

        // 개업일 (openingDate)
        if (data.openingDate) {
          setValue("establishedDate", data.openingDate);
        }

        // 주소 (address)
        if (data.address) {
          setValue("address", data.address);
        }

        // 업태 (businessType)
        if (data.businessType) {
          setValue("businessCategory", data.businessType);
        }

        // 종목 (businessItem)
        if (data.businessItem) {
          setValue("mainBusiness", data.businessItem);
        }

        toast.success("사업자등록증 정보가 자동으로 입력되었습니다!");
        setAnalyzed(true);
      }

      setAnalyzeProgress(100);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "분석 실패");
      setBusinessRegFile(null);
    } finally {
      setTimeout(() => {
        setAnalyzing(false);
        setAnalyzeProgress(0);
      }, 500);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 타입 검증
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("PDF 또는 이미지 파일만 업로드 가능합니다.");
      return;
    }

    // 파일 크기 검증 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    handleFileAnalyze(file);
  };

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

      // 사업자등록증 파일이 있으면 문서로 저장
      if (businessRegFile) {
        try {
          console.log("[CompanyForm] Uploading document for company:", company.id);
          console.log("[CompanyForm] File:", businessRegFile.name, businessRegFile.size);

          const docFormData = new FormData();
          docFormData.append("file", businessRegFile);
          docFormData.append("documentType", "business_registration");

          const docResponse = await fetch(`/api/companies/${company.id}/documents/upload`, {
            method: "POST",
            body: docFormData,
          });

          if (!docResponse.ok) {
            const docError = await docResponse.json();
            console.error("[CompanyForm] Document upload failed:", docError);
            throw new Error(docError.error || "문서 업로드 실패");
          }

          const docResult = await docResponse.json();
          console.log("[CompanyForm] Document uploaded successfully:", docResult);

          toast.success("기업이 등록되고 사업자등록증이 저장되었습니다");
        } catch (docError) {
          console.error("[CompanyForm] Document save error:", docError);
          toast.warning("기업이 등록되었지만 문서 저장에 실패했습니다");
        }
      } else {
        console.log("[CompanyForm] No business registration file to upload");
        toast.success("기업이 성공적으로 등록되었습니다");
      }

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
        {/* 사업자등록증 업로드 카드 */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              사업자등록증 자동 입력
              <span className="text-xs font-normal text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                선택사항
              </span>
            </CardTitle>
            <CardDescription>
              사업자등록증을 업로드하면 AI가 자동으로 정보를 분석하여 아래 양식에 입력합니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!businessRegFile ? (
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-muted-foreground/25 rounded-lg bg-muted/50">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4 text-center">
                  PDF 또는 이미지 파일을 업로드하세요
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("business-reg-file")?.click()}
                  disabled={analyzing}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  파일 선택
                </Button>
                <input
                  id="business-reg-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1">
                      {analyzed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{businessRegFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(businessRegFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBusinessRegFile(null);
                        setAnalyzed(false);
                      }}
                      disabled={analyzing}
                    >
                      변경
                    </Button>
                  </div>
                </div>

                {analyzing && (
                  <div>
                    <Progress value={analyzeProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      AI가 문서를 분석하고 있습니다... {analyzeProgress}%
                    </p>
                  </div>
                )}

                {analyzed && (
                  <div className="p-3 bg-green-50 text-green-700 rounded-md text-sm flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p>
                      정보가 자동으로 입력되었습니다. 내용을 확인하고 필요시 수정해주세요.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
