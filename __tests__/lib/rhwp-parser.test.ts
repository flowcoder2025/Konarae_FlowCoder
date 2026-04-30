import { parseHwpWithRhwp } from "@/lib/rhwp-parser";

class FakeHwpDocument {
  constructor(_data: Uint8Array) {}

  pageCount() {
    return 1;
  }

  getPageTextLayout(_page: number) {
    return JSON.stringify({
      runs: [
        { text: "붙임", paraIdx: 0 },
        { text: "4", paraIdx: 0 },
        { text: " 강의 계획서", paraIdx: 0 },
        { text: "※ 강의는 ", paraIdx: 1 },
        { text: "2", paraIdx: 1 },
        { text: "시간 운영을 기준으로 진행됩니다.", paraIdx: 1 },
      ],
    });
  }

  renderPageSvg(_page: number) {
    return "";
  }

  free() {}
}

describe("rhwp parser", () => {
  it("extracts plain text from rhwp page layout runs", async () => {
    const result = await parseHwpWithRhwp(Buffer.from("hwp"), {
      loadCore: async () => ({
        default: jest.fn().mockResolvedValue(undefined),
        HwpDocument: FakeHwpDocument,
      }),
    });

    expect(result).toEqual({
      success: true,
      text: "붙임4 강의 계획서\n※ 강의는 2시간 운영을 기준으로 진행됩니다.",
      metadata: { pages: 1 },
    });
  });
});
