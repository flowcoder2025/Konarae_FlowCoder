import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "이용약관",
  description: "FlowMate 서비스 이용약관",
};

// 정적 페이지 - 빌드 타임에 생성
export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          홈으로 돌아가기
        </Link>

        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="text-3xl font-bold mb-2">FlowMate 서비스 이용약관</h1>
          <p className="text-muted-foreground mb-8">시행일: 2025년 1월 1일</p>

          {/* 제1장 총칙 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제1장 총칙</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">제1조 (목적)</h3>
            <p>
              본 약관은 주식회사 테크트리아이엔씨(이하 &quot;회사&quot;)가 제공하는
              FlowMate 서비스(이하 &quot;서비스&quot;)의 이용과 관련하여 회사와
              이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">제2조 (정의)</h3>
            <p>본 약관에서 사용하는 용어의 정의는 다음과 같습니다.</p>
            <ol className="list-decimal pl-6 space-y-2 mt-3">
              <li>
                <strong>&quot;서비스&quot;</strong>란 회사가 제공하는 정부
                지원사업 매칭 및 AI 사업계획서 작성 플랫폼을 의미합니다.
              </li>
              <li>
                <strong>&quot;이용자&quot;</strong>란 본 약관에 따라 회사가
                제공하는 서비스를 이용하는 회원을 의미합니다.
              </li>
              <li>
                <strong>&quot;회원&quot;</strong>이란 회사와 서비스 이용계약을
                체결하고 이용자 아이디(ID)를 부여받은 자를 의미합니다.
              </li>
              <li>
                <strong>&quot;크레딧&quot;</strong>이란 서비스 내에서 AI
                사업계획서 생성, 평가 등의 기능을 이용하기 위해 사용되는 가상
                재화를 의미합니다.
              </li>
              <li>
                <strong>&quot;콘텐츠&quot;</strong>란 서비스를 통해 생성된
                사업계획서, 분석 보고서 등 모든 창작물을 의미합니다.
              </li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제3조 (약관의 효력 및 변경)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                본 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게
                공지함으로써 효력이 발생합니다.
              </li>
              <li>
                회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수
                있으며, 변경 시 적용일자 및 변경사유를 명시하여 현행 약관과 함께
                서비스 초기화면에 그 적용일자 7일 이전부터 적용일자 전일까지
                공지합니다.
              </li>
              <li>
                이용자가 변경된 약관에 동의하지 않는 경우, 이용자는 서비스
                이용계약을 해지할 수 있습니다.
              </li>
            </ol>
          </section>

          {/* 제2장 서비스 이용계약 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제2장 서비스 이용계약
            </h2>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제4조 (이용계약의 체결)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                이용계약은 이용자가 본 약관의 내용에 동의한 후 회원가입 신청을
                하고, 회사가 이를 승낙함으로써 체결됩니다.
              </li>
              <li>
                회원가입은 만 14세 이상의 개인 또는 사업자등록을 완료한 기업이
                신청할 수 있습니다.
              </li>
              <li>
                회사는 다음 각 호에 해당하는 경우 이용신청을 승낙하지 않거나
                사후에 이용계약을 해지할 수 있습니다.
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>타인의 정보를 도용하여 신청한 경우</li>
                  <li>허위 정보를 기재하거나 필수 정보를 누락한 경우</li>
                  <li>
                    이전에 회원 자격을 상실한 적이 있는 자가 재가입을 신청한
                    경우
                  </li>
                  <li>관련 법령에 위배되거나 공서양속을 저해할 우려가 있는 경우</li>
                </ul>
              </li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제5조 (회원 탈퇴 및 자격 상실)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                회원은 언제든지 서비스 내 설정 메뉴를 통해 탈퇴를 요청할 수
                있으며, 회사는 즉시 회원 탈퇴를 처리합니다.
              </li>
              <li>
                회원이 본 약관을 위반한 경우, 회사는 사전 통지 없이 이용계약을
                해지하고 회원 자격을 상실시킬 수 있습니다.
              </li>
              <li>
                탈퇴 시 회원의 개인정보는 관련 법령에 따라 일정 기간 보관 후
                파기됩니다.
              </li>
            </ol>
          </section>

          {/* 제3장 계약 당사자의 의무 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제3장 계약 당사자의 의무
            </h2>

            <h3 className="text-lg font-medium mt-6 mb-3">제6조 (회사의 의무)</h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                회사는 관련 법령과 본 약관이 정하는 바에 따라 지속적이고 안정적인
                서비스를 제공하기 위해 최선을 다합니다.
              </li>
              <li>
                회사는 이용자의 개인정보 보호를 위해 보안시스템을 갖추고
                개인정보처리방침을 공시하고 준수합니다.
              </li>
              <li>
                회사는 서비스 이용과 관련한 이용자의 불만 또는 피해구제 요청을
                적절하게 처리합니다.
              </li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제7조 (이용자의 의무)
            </h3>
            <p>이용자는 다음 각 호의 행위를 하여서는 안 됩니다.</p>
            <ol className="list-decimal pl-6 space-y-2 mt-3">
              <li>타인의 정보를 도용하거나 허위 정보를 등록하는 행위</li>
              <li>
                서비스를 이용하여 얻은 정보를 회사의 사전 승낙 없이 복제, 배포,
                출판하거나 상업적으로 이용하는 행위
              </li>
              <li>
                회사 또는 제3자의 저작권, 상표권 등 지적재산권을 침해하는 행위
              </li>
              <li>불법적이거나 부정한 목적으로 서비스를 이용하는 행위</li>
              <li>
                서비스의 정상적인 운영을 방해하거나 시스템에 과부하를 주는 행위
              </li>
              <li>
                다른 이용자의 개인정보를 무단으로 수집, 저장, 공개하는 행위
              </li>
              <li>관련 법령에 위반되는 행위</li>
            </ol>
          </section>

          {/* 제4장 서비스 이용 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제4장 서비스 이용</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제8조 (서비스의 제공)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 합니다.</li>
              <li>
                회사는 시스템 점검, 증설, 교체 등의 사유로 서비스 제공을 일시
                중단할 수 있으며, 이 경우 사전에 공지합니다. 다만, 긴급한 경우
                사후에 공지할 수 있습니다.
              </li>
              <li>
                회사는 서비스의 품질 향상을 위해 서비스의 내용을 변경할 수
                있습니다.
              </li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제9조 (서비스의 범위)
            </h3>
            <p>회사가 제공하는 서비스는 다음과 같습니다.</p>
            <ol className="list-decimal pl-6 space-y-2 mt-3">
              <li>정부 지원사업 정보 수집 및 요약 서비스</li>
              <li>기업-지원사업 AI 매칭 서비스</li>
              <li>AI 기반 사업계획서 초안 작성 서비스</li>
              <li>사업계획서 평가 및 피드백 서비스</li>
              <li>기타 회사가 정하는 서비스</li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제10조 (마케팅 정보 수신)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                회사는 이용자의 동의를 받아 이메일, 문자 등의 방법으로 마케팅
                정보를 발송할 수 있습니다.
              </li>
              <li>
                이용자는 언제든지 마케팅 정보 수신에 대한 동의를 철회할 수
                있습니다.
              </li>
            </ol>
          </section>

          {/* 제5장 크레딧 및 결제 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제5장 크레딧 및 결제</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제11조 (크레딧의 구매 및 사용)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                이용자는 서비스 내에서 크레딧을 구매하여 AI 사업계획서 생성, 평가
                등의 유료 기능을 이용할 수 있습니다.
              </li>
              <li>
                크레딧의 가격 및 사용 조건은 서비스 내에 별도로 공지합니다.
              </li>
              <li>
                유료 구매 크레딧은 유효기간이 없으며, 보너스 크레딧은 지급일로부터
                30일 이내에 사용해야 하며 이후 소멸됩니다.
              </li>
              <li>
                크레딧은 타인에게 양도하거나 선물할 수 없으며, 현금으로 환급되지
                않습니다.
              </li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제12조 (결제 및 환불)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                크레딧 구매 시 결제는 신용카드, 계좌이체 등 회사가 정한 방법으로
                할 수 있습니다.
              </li>
              <li>
                환불에 관한 사항은 별도의 환불약관에 따릅니다.
              </li>
            </ol>
          </section>

          {/* 제6장 저작권 및 콘텐츠 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제6장 저작권 및 콘텐츠
            </h2>

            <h3 className="text-lg font-medium mt-6 mb-3">제13조 (저작권)</h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                서비스의 저작권 및 지적재산권은 회사에 귀속됩니다.
              </li>
              <li>
                이용자가 서비스를 통해 생성한 콘텐츠의 저작권은 이용자에게
                귀속됩니다. 다만, 회사는 서비스 운영, 마케팅 등의 목적으로 해당
                콘텐츠를 사용할 수 있습니다.
              </li>
              <li>
                이용자는 서비스를 이용함으로써 얻은 정보를 회사의 사전 승낙 없이
                영리 목적으로 이용하거나 제3자에게 이용하게 할 수 없습니다.
              </li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제14조 (콘텐츠 관리)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                회사는 이용자가 생성한 콘텐츠가 관련 법령에 위반되거나 제3자의
                권리를 침해하는 경우, 해당 콘텐츠를 삭제하거나 이용을 제한할 수
                있습니다.
              </li>
              <li>
                이용자는 자신이 생성한 콘텐츠에 대한 법적 책임을 부담합니다.
              </li>
            </ol>
          </section>

          {/* 제7장 손해배상 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제7장 손해배상</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제15조 (손해배상의 범위)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                회사는 무료로 제공되는 서비스와 관련하여 발생한 손해에 대해
                책임을 지지 않습니다.
              </li>
              <li>
                회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등
                불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 책임이
                면제됩니다.
              </li>
              <li>
                회사는 이용자의 귀책사유로 인한 서비스 장애에 대해 책임을 지지
                않습니다.
              </li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제16조 (면책조항)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                회사는 서비스를 통해 제공되는 정보의 정확성, 완전성, 신뢰성을
                보장하지 않습니다.
              </li>
              <li>
                이용자가 서비스를 통해 얻은 정보를 바탕으로 한 투자, 사업 결정
                등으로 인한 손해에 대해 회사는 책임을 지지 않습니다.
              </li>
              <li>
                AI 기반 서비스의 결과물은 참고용으로만 사용되어야 하며, 최종
                판단과 책임은 이용자에게 있습니다.
              </li>
            </ol>
          </section>

          {/* 제8장 기타 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">제8장 기타</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제17조 (분쟁 해결)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                회사와 이용자 간에 발생한 분쟁에 관한 소송은 대구지방법원을
                전속적 관할 법원으로 합니다.
              </li>
              <li>
                본 약관과 서비스 이용에 관하여는 대한민국 법률이 적용됩니다.
              </li>
            </ol>
          </section>

          {/* 제9장 AI 생성물 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제9장 AI 생성물 및 법령 준수
            </h2>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제18조 (AI 생성물의 표시)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                서비스를 통해 생성된 모든 콘텐츠는 AI 생성물입니다.
              </li>
              <li>
                회사는 AI 생성물에 워터마크, 메타데이터 등의 형태로
                &quot;AI 생성물&quot; 표시를 부착할 수 있습니다.
              </li>
              <li>
                이용자는 AI 생성물 표시를 임의로 제거하거나 변경할 수 없으며,
                이를 위반한 경우 관련 법령에 따른 책임을 부담합니다.
              </li>
            </ol>

            <h3 className="text-lg font-medium mt-6 mb-3">
              제19조 (법령 준수 책임)
            </h3>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                AI 생성물은 현행 저작권법상 보호 대상이 아닐 수 있으며, 이에 따른
                법적 리스크는 이용자가 부담합니다.
              </li>
              <li>
                이용자는 AI 생성물을 활용할 때 관련 법령을 준수할 책임이 있습니다.
              </li>
            </ol>
          </section>

          {/* 부칙 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">부칙</h2>
            <ol className="list-decimal pl-6 space-y-2">
              <li>본 약관은 2025년 1월 1일부터 시행됩니다.</li>
              <li>
                제9장의 AI 기본법 관련 조항은 2026년 1월 22일부터 효력이
                발생합니다.
              </li>
            </ol>
          </section>

          {/* Footer Links */}
          <div className="mt-12 pt-8 border-t flex flex-wrap gap-4 text-sm">
            <Link href="/privacy" className="text-primary hover:underline">
              개인정보처리방침
            </Link>
            <Link href="/refund" className="text-primary hover:underline">
              환불약관
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
