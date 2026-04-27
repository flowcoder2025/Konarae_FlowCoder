import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ProjectPublicDto } from "@/lib/projects/public-dto";

function formatDate(value: string | null) {
  if (!value) return "기한 미정";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}

function formatDeadline(project: ProjectPublicDto) {
  return project.isPermanent ? "상시모집" : formatDate(project.deadline);
}

export function PublicProjectCard({ project }: { project: ProjectPublicDto }) {
  return (
    <Link className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href={`/projects/${project.id}`}>
      <Card className="flex h-full flex-col p-5 transition-colors hover:border-primary">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge>{project.category}</Badge>
          <Badge variant="outline">{project.region}</Badge>
          {project.trust.analysisStatus === "analyzed" && <Badge variant="outline">AI 분석 완료</Badge>}
        </div>
        <h3 className="mb-2 line-clamp-2 text-lg font-semibold">{project.title}</h3>
        <p className="mb-3 text-sm text-muted-foreground">{project.organization}</p>
        <p className="mb-4 line-clamp-3 text-sm text-muted-foreground">{project.summary}</p>
        <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
          <span className="font-medium text-primary">{project.amount.summary ?? "지원금액 확인 필요"}</span>
          <span className="text-muted-foreground">{formatDeadline(project)}</span>
        </div>
      </Card>
    </Link>
  );
}
