"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings2, Loader2, Check, X, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ component: "matching-preferences-form" });

// 유효한 카테고리 (validators.ts와 동기화)
const CATEGORIES = [
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

// 지역
const REGIONS = [
  "전국",
  "서울",
  "경기",
  "인천",
  "강원",
  "충북",
  "충남",
  "대전",
  "세종",
  "전북",
  "전남",
  "광주",
  "경북",
  "경남",
  "대구",
  "울산",
  "부산",
  "제주",
] as const;

interface MatchingPreferences {
  categories: string[];
  minAmount: string | null;
  maxAmount: string | null;
  regions: string[];
  subRegions: string[];
  excludeKeywords: string[];
  updatedAt?: string;
}

interface MatchingPreferencesFormProps {
  companyId: string;
  canEdit: boolean;
}

export function MatchingPreferencesForm({
  companyId,
  canEdit,
}: MatchingPreferencesFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<MatchingPreferences | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedSubRegions, setSelectedSubRegions] = useState<string[]>([]);
  const [newSubRegion, setNewSubRegion] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  // Fetch preferences
  useEffect(() => {
    fetchPreferences();
  }, [companyId]);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/companies/${companyId}/matching-preferences`);
      if (!res.ok) throw new Error("Failed to fetch preferences");

      const data = await res.json();
      if (data.preferences) {
        setPreferences(data.preferences);
        setSelectedCategories(data.preferences.categories || []);
        setSelectedRegions(data.preferences.regions || []);
        setSelectedSubRegions(data.preferences.subRegions || []);
        setMinAmount(data.preferences.minAmount || "");
        setMaxAmount(data.preferences.maxAmount || "");
        setExcludeKeywords(data.preferences.excludeKeywords || []);
      }
    } catch (err) {
      logger.error("Error fetching preferences", { error: err });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (selectedCategories.length === 0) {
      setError("최소 1개의 관심 분야를 선택해주세요");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/companies/${companyId}/matching-preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: selectedCategories,
          minAmount: minAmount || undefined,
          maxAmount: maxAmount || undefined,
          regions: selectedRegions,
          subRegions: selectedSubRegions,
          excludeKeywords,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다");
      }

      const data = await res.json();
      setPreferences(data.preferences);
      setIsEditing(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (preferences) {
      setSelectedCategories(preferences.categories || []);
      setSelectedRegions(preferences.regions || []);
      setSelectedSubRegions(preferences.subRegions || []);
      setMinAmount(preferences.minAmount || "");
      setMaxAmount(preferences.maxAmount || "");
      setExcludeKeywords(preferences.excludeKeywords || []);
    } else {
      setSelectedCategories([]);
      setSelectedRegions([]);
      setSelectedSubRegions([]);
      setMinAmount("");
      setMaxAmount("");
      setExcludeKeywords([]);
    }
    setIsEditing(false);
    setError(null);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleRegion = (region: string) => {
    if (region === "전국") {
      setSelectedRegions((prev) =>
        prev.includes("전국") ? [] : ["전국"]
      );
    } else {
      setSelectedRegions((prev) => {
        const newRegions = prev.filter((r) => r !== "전국");
        return newRegions.includes(region)
          ? newRegions.filter((r) => r !== region)
          : [...newRegions, region];
      });
    }
  };

  const addSubRegion = () => {
    const trimmed = newSubRegion.trim();
    if (trimmed && !selectedSubRegions.includes(trimmed)) {
      setSelectedSubRegions([...selectedSubRegions, trimmed]);
      setNewSubRegion("");
    }
  };

  const removeSubRegion = (subRegion: string) => {
    setSelectedSubRegions(selectedSubRegions.filter((s) => s !== subRegion));
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !excludeKeywords.includes(newKeyword.trim())) {
      setExcludeKeywords([...excludeKeywords, newKeyword.trim()]);
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setExcludeKeywords(excludeKeywords.filter((k) => k !== keyword));
  };

  const formatAmount = (value: string) => {
    const num = parseInt(value.replace(/,/g, ""), 10);
    if (isNaN(num)) return "";
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              매칭 선호도 설정
            </CardTitle>
            <CardDescription>
              관심 분야와 조건을 설정하면 매일 자동으로 맞춤 지원사업을 찾아드립니다
            </CardDescription>
          </div>
          {canEdit && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              {preferences ? "수정" : "설정하기"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 text-green-600 rounded-lg text-sm flex items-center gap-2">
            <Check className="h-4 w-4" />
            저장되었습니다. 내일부터 자동 매칭이 실행됩니다.
          </div>
        )}

        {!preferences && !isEditing ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">
              매칭 선호도를 설정하면 매일 자동으로 맞춤 지원사업을 추천받을 수 있습니다.
            </p>
            {canEdit && (
              <Button onClick={() => setIsEditing(true)}>
                <Settings2 className="h-4 w-4 mr-2" />
                선호도 설정하기
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* 관심 분야 */}
            <div>
              <Label className="text-sm font-medium mb-3 block">
                관심 분야 {isEditing && <span className="text-destructive">*</span>}
              </Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <Badge
                    key={category}
                    variant={selectedCategories.includes(category) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer transition-colors",
                      isEditing && "hover:bg-primary/80"
                    )}
                    onClick={() => isEditing && toggleCategory(category)}
                  >
                    {category}
                    {isEditing && selectedCategories.includes(category) && (
                      <Check className="h-3 w-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
            </div>

            {/* 지원금 규모 */}
            <div>
              <Label className="text-sm font-medium mb-3 block">지원금 규모 (원)</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="최소 금액"
                  value={minAmount ? formatAmount(minAmount) : ""}
                  onChange={(e) => setMinAmount(e.target.value.replace(/,/g, ""))}
                  disabled={!isEditing}
                  className="max-w-[150px]"
                />
                <span className="text-muted-foreground">~</span>
                <Input
                  placeholder="최대 금액"
                  value={maxAmount ? formatAmount(maxAmount) : ""}
                  onChange={(e) => setMaxAmount(e.target.value.replace(/,/g, ""))}
                  disabled={!isEditing}
                  className="max-w-[150px]"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                비워두면 금액 제한 없이 검색합니다
              </p>
            </div>

            {/* 지역 (광역시·도) */}
            <div>
              <Label className="text-sm font-medium mb-3 block">지역 (광역시·도)</Label>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((region) => (
                  <Badge
                    key={region}
                    variant={selectedRegions.includes(region) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer transition-colors",
                      isEditing && "hover:bg-primary/80",
                      region === "전국" && selectedRegions.includes("전국") && "bg-primary"
                    )}
                    onClick={() => isEditing && toggleRegion(region)}
                  >
                    {region}
                    {isEditing && selectedRegions.includes(region) && (
                      <Check className="h-3 w-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                선택하지 않으면 전국으로 검색합니다
              </p>
            </div>

            {/* 시·군·구 */}
            <div>
              <Label className="text-sm font-medium mb-3 block">시·군·구 (세부 지역)</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedSubRegions.map((subRegion) => (
                  <Badge key={subRegion} variant="secondary" className="gap-1">
                    {subRegion}
                    {isEditing && (
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => removeSubRegion(subRegion)}
                      />
                    )}
                  </Badge>
                ))}
                {selectedSubRegions.length === 0 && !isEditing && (
                  <span className="text-sm text-muted-foreground">전체</span>
                )}
              </div>
              {isEditing && (
                <div className="flex gap-2">
                  <Input
                    placeholder="시·군·구 입력 (예: 남양주시, 강남구)"
                    value={newSubRegion}
                    onChange={(e) => setNewSubRegion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubRegion())}
                    className="max-w-[250px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSubRegion}
                    disabled={!newSubRegion.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                비워두면 선택한 광역시·도 전체를 검색합니다
              </p>
            </div>

            {/* 제외 키워드 */}
            <div>
              <Label className="text-sm font-medium mb-3 block">제외 키워드</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {excludeKeywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="gap-1">
                    {keyword}
                    {isEditing && (
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => removeKeyword(keyword)}
                      />
                    )}
                  </Badge>
                ))}
                {excludeKeywords.length === 0 && !isEditing && (
                  <span className="text-sm text-muted-foreground">없음</span>
                )}
              </div>
              {isEditing && (
                <div className="flex gap-2">
                  <Input
                    placeholder="제외할 키워드 입력"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                    className="max-w-[200px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addKeyword}
                    disabled={!newKeyword.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                이 키워드가 포함된 사업은 매칭에서 제외됩니다
              </p>
            </div>

            {/* 버튼 */}
            {isEditing && (
              <div className="flex gap-2 pt-4 border-t">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    "저장"
                  )}
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                  취소
                </Button>
              </div>
            )}

            {/* 마지막 업데이트 */}
            {preferences?.updatedAt && !isEditing && (
              <p className="text-xs text-muted-foreground pt-4 border-t">
                마지막 업데이트: {new Date(preferences.updatedAt).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
