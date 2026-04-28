import { render } from "@testing-library/react";
import {
  ProjectAnalysisConfidenceWarning,
  shouldShowAnalysisConfidenceWarning,
} from "@/components/projects/project-analysis-confidence-warning";

describe("ProjectAnalysisConfidenceWarning", () => {
  it("shows warning only for low confidence", () => {
    expect(shouldShowAnalysisConfidenceWarning("low")).toBe(true);
    expect(shouldShowAnalysisConfidenceWarning(null)).toBe(false);
    expect(shouldShowAnalysisConfidenceWarning(undefined)).toBe(false);
    expect(shouldShowAnalysisConfidenceWarning("medium")).toBe(false);
    expect(shouldShowAnalysisConfidenceWarning("high")).toBe(false);
  });

  it("renders Korean warning copy for low confidence", () => {
    const { container } = render(<ProjectAnalysisConfidenceWarning confidence="low" />);

    expect(container.textContent).toContain("AI 분석 신뢰도가 낮아 원문 확인이 필요합니다.");
  });

  it("renders nothing for null confidence", () => {
    const { container } = render(<ProjectAnalysisConfidenceWarning confidence={null} />);

    expect(container.textContent).toBe("");
  });
});
