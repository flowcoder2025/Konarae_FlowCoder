import { render, screen, waitFor } from "@testing-library/react";
import { ProjectDescriptionRenderer } from "@/components/projects/project-description-renderer";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe("ProjectDescriptionRenderer", () => {
  it("renders full markdown content without expand or collapse controls", async () => {
    jest.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(100);

    const { container } = render(
      <ProjectDescriptionRenderer
        markdownContent={"### 사업개요\n전체 공고 내용입니다.\n\n### 지원내용\n마지막 줄까지 보여야 합니다."}
        content="fallback"
        collapsedHeight={10}
      />
    );

    expect(container.textContent).toContain("사업개요");
    expect(container.textContent).toContain("마지막 줄까지 보여야 합니다.");
    await waitFor(() => expect(screen.queryByText("더 보기")).toBeNull());
    expect(screen.queryByText("접기")).toBeNull();
  });
});
