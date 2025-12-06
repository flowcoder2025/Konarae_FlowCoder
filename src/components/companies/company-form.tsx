"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const companyFormSchema = z.object({
  name: z.string().min(1, "기업명은 필수입니다"),
  businessNumber: z.string().regex(/^\d{10}$/, "사업자등록번호는 10자리 숫자입니다"),
  corporationNumber: z.string().optional(),
  representativeName: z.string().min(1, "대표자명은 필수입니다"),
  establishedDate: z.string().min(1, "설립일은 필수입니다"),
  companyType: z.string().min(1, "기업 형태는 필수입니다"),
  phone: z.string().min(1, "전화번호는 필수입니다"),
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
  address: z.string().min(1, "주소는 필수입니다"),
  addressDetail: z.string().optional(),
  zipcode: z.string().optional(),
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
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
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
