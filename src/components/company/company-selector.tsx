"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ChevronDown, Plus, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface CompanyOption {
  id: string;
  name: string;
  isOwner: boolean;
}

interface CompanySelectorProps {
  companies: CompanyOption[];
  currentCompanyId: string;
  onSelect?: (companyId: string) => void;
}

export function CompanySelector({
  companies,
  currentCompanyId,
  onSelect,
}: CompanySelectorProps) {
  const router = useRouter();
  const currentCompany = companies.find((c) => c.id === currentCompanyId);

  const handleSelect = (companyId: string) => {
    if (onSelect) {
      onSelect(companyId);
    } else {
      // Default behavior: navigate with query param
      router.push(`/company?id=${companyId}`);
    }
  };

  if (companies.length <= 1) {
    // Single company - just show name without dropdown
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{currentCompany?.name || "내 기업"}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[200px] truncate">
            {currentCompany?.name || "기업 선택"}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onClick={() => handleSelect(company.id)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{company.name}</span>
            </div>
            {company.id === currentCompanyId && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/companies/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            새 기업 추가
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
