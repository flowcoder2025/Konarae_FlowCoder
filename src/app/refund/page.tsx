import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "환불약관",
  description: "FlowMate 환불약관",
};

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          홈으로 돌아가기
        </Link>

        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="text-3xl font-bold mb-2">FlowMate 환불약관</h1>
          <p className="text-muted-foreground mb-8">시행일: 2025년 1월 1일</p>

          <p className="mb-8">
            주식회사 테크트리아이엔씨(이하 &quot;회사&quot;)는 FlowMate
            서비스(이하 &quot;서비스&quot;) 이용과 관련하여 다음과 같이 환불
            정책을 운영합니다.
          </p>

          {/* 제1조 청약철회 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제1조 (청약철회)</h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                이용자는 크레딧 구매일로부터 <strong>7일 이내</strong>에
                청약철회를 요청할 수 있습니다.
              </li>
              <li>
                다만, 다음 각 호에 해당하는 경우에는 청약철회가 제한됩니다.
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>구매한 크레딧을 일부라도 사용한 경우</li>
                  <li>청약철회 기간(7일)이 경과한 경우</li>
                </ul>
              </li>
              <li>
                청약철회는 서비스 내 문의하기 또는 이메일
                (flowcoder25@gmail.com)을 통해 요청할 수 있습니다.
              </li>
            </ol>
          </section>

          {/* 제2조 환불 불가 사유 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제2조 (환불 불가 사유)
            </h2>
            <p>다음 각 호에 해당하는 경우에는 환불이 불가합니다.</p>
            <ol className="list-decimal pl-6 space-y-2 mt-3">
              <li>구매한 크레딧을 일부라도 사용한 경우</li>
              <li>무료로 지급받은 크레딧 또는 보너스 크레딧</li>
              <li>이벤트, 프로모션 등을 통해 할인 적용된 크레딧</li>
              <li>제3자에게 양도하거나 선물한 크레딧</li>
              <li>
                이용자의 귀책사유로 계정이 정지된 경우의 잔여 크레딧
              </li>
              <li>청약철회 기간(7일)이 경과한 경우</li>
              <li>
                AI 생성물의 기술적 특성상 결과물이 이용자의 기대와 상이한 경우
              </li>
            </ol>
          </section>

          {/* 제3조 환불 절차 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제3조 (환불 절차)</h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                환불 요청은 서비스 내 문의하기 또는 이메일
                (flowcoder25@gmail.com)을 통해 접수합니다.
              </li>
              <li>
                환불 요청 시 다음 정보를 함께 제출해야 합니다.
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>회원 이메일 주소</li>
                  <li>결제일 및 결제 금액</li>
                  <li>환불 사유</li>
                </ul>
              </li>
              <li>
                회사는 환불 요청을 접수한 날로부터 3영업일 이내에 환불 가능
                여부를 통보합니다.
              </li>
            </ol>
          </section>

          {/* 제4조 환불 처리 기간 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제4조 (환불 처리 기간)
            </h2>
            <p>환불 승인 후 결제 수단에 따라 다음과 같이 처리됩니다.</p>
            <div className="overflow-x-auto mt-4">
              <table className="min-w-full border-collapse border border-border">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border px-4 py-2 text-left">
                      결제 수단
                    </th>
                    <th className="border border-border px-4 py-2 text-left">
                      환불 처리 기간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border px-4 py-2">신용카드</td>
                    <td className="border border-border px-4 py-2">
                      결제 취소 후 3~7 영업일 (카드사에 따라 상이)
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">계좌이체</td>
                    <td className="border border-border px-4 py-2">
                      3영업일 이내 계좌 환불
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제5조 부분 환불 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제5조 (부분 환불)</h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                구매한 크레딧을 일부 사용한 경우에는 부분 환불이 불가합니다.
              </li>
              <li>
                복수의 결제 건이 있는 경우, 각 결제 건에 대해 개별적으로 환불
                가능 여부를 판단합니다.
              </li>
            </ol>
          </section>

          {/* 제6조 서비스 장애 보상 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제6조 (서비스 장애 보상)
            </h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                회사의 귀책사유로 서비스가 24시간 이상 연속으로 중단된 경우,
                이용자에게 다음 중 하나의 방법으로 보상합니다.
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>이용기간 연장</li>
                  <li>크레딧 보상</li>
                </ul>
              </li>
              <li>
                보상은 서비스 중단 기간 및 이용자의 피해 정도에 따라 회사가
                합리적으로 결정합니다.
              </li>
              <li>
                천재지변, 전쟁, 기간통신사업자의 서비스 중단 등 불가항력으로
                인한 서비스 중단은 보상 대상에서 제외됩니다.
              </li>
            </ol>
          </section>

          {/* 제7조 AI 생성물 관련 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제7조 (AI 생성물 관련)
            </h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                AI 기반 서비스의 특성상 생성된 결과물이 이용자의 기대와 상이할
                수 있으며, 이는 환불 사유에 해당하지 않습니다.
              </li>
              <li>
                AI 사업계획서, 분석 결과 등은 참고용으로만 사용되어야 하며,
                결과물의 활용에 대한 책임은 이용자에게 있습니다.
              </li>
              <li>
                회사는 AI 생성물의 정확성, 완전성, 적합성을 보장하지 않습니다.
              </li>
            </ol>
          </section>

          {/* 제8조 고객센터 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제8조 (고객센터)</h2>
            <p>
              환불 관련 문의는 다음 연락처를 통해 접수할 수 있습니다.
            </p>
            <div className="bg-muted p-4 rounded-lg mt-4">
              <p>
                <strong>고객센터</strong>
              </p>
              <p className="mt-2">
                이메일:{" "}
                <a
                  href="mailto:flowcoder25@gmail.com"
                  className="text-primary hover:underline"
                >
                  flowcoder25@gmail.com
                </a>
              </p>
              <p>운영시간: 평일 10:00 ~ 18:00 (공휴일 제외)</p>
            </div>
          </section>

          {/* 부칙 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">부칙</h2>
            <ol className="list-decimal pl-6 space-y-2">
              <li>본 환불약관은 2025년 1월 1일부터 시행됩니다.</li>
              <li>
                AI 기본법 관련 조항은 2026년 1월 22일부터 효력이 발생합니다.
              </li>
            </ol>
          </section>

          {/* Footer Links */}
          <div className="mt-12 pt-8 border-t flex flex-wrap gap-4 text-sm">
            <Link href="/terms" className="text-primary hover:underline">
              이용약관
            </Link>
            <Link href="/privacy" className="text-primary hover:underline">
              개인정보처리방침
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
