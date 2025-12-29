import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateKST, formatOrganization } from "@/lib/utils";

interface BusinessPlanCardProps {
  businessPlan: {
    id: string;
    title: string;
    status: string;
    updatedAt: Date;
    company: {
      id: string;
      name: string;
    };
    project?: {
      id: string;
      name: string;
      organization: string;
      sourceUrl?: string | null;
    } | null;
    _count?: {
      sections: number;
    };
  };
}

const STATUS_VARIANTS: Record<
  string,
  "default" | "outline" | "secondary" | "destructive"
> = {
  draft: "outline",
  in_progress: "secondary",
  completed: "default",
  submitted: "default",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  in_progress: "작성 중",
  completed: "완료",
  submitted: "제출",
};

export function BusinessPlanCard({ businessPlan }: BusinessPlanCardProps) {
  return (
    <Link href={`/business-plans/${businessPlan.id}`}>
      <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold mb-1">
              {businessPlan.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {businessPlan.company.name}
            </p>
          </div>
          <Badge variant={STATUS_VARIANTS[businessPlan.status] || "outline"}>
            {STATUS_LABELS[businessPlan.status] || businessPlan.status}
          </Badge>
        </div>

        {businessPlan.project && (
          <div className="mb-3 text-sm">
            <span className="text-muted-foreground">지원사업: </span>
            <span className="font-medium">{businessPlan.project.name}</span>
            <span className="text-muted-foreground">
              {" "}
              ({formatOrganization(businessPlan.project.organization, businessPlan.project.sourceUrl)})
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            섹션: {businessPlan._count?.sections || 0}개
          </span>
          <span>
            수정: {formatDateKST(businessPlan.updatedAt)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
