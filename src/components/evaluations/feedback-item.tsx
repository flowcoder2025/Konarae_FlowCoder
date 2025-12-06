import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface FeedbackItemProps {
  feedback: {
    criteriaName: string;
    score: number | null;
    feedback: string;
    suggestions: string[];
  };
}

export function FeedbackItem({ feedback }: FeedbackItemProps) {
  const score = feedback.score || 0;
  const scoreColor =
    score >= 80
      ? "text-green-600"
      : score >= 60
      ? "text-blue-600"
      : score >= 40
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold flex-1">{feedback.criteriaName}</h3>
        <div className="text-right ml-4">
          <div className={`text-3xl font-bold ${scoreColor}`}>
            {score}
          </div>
          <div className="text-xs text-muted-foreground">/ 100점</div>
        </div>
      </div>

      <Progress value={score} className="h-2 mb-4" />

      <div className="mb-4">
        <h4 className="text-sm font-semibold mb-2">평가 의견</h4>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {feedback.feedback}
        </p>
      </div>

      {feedback.suggestions && feedback.suggestions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">개선 제안</h4>
          <div className="space-y-2">
            {feedback.suggestions.map((suggestion, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  {idx + 1}
                </Badge>
                <p className="text-sm text-muted-foreground flex-1">
                  {suggestion}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
