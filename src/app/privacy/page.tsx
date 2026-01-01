import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "FlowMate 개인정보처리방침",
};

// 정적 페이지 - 빌드 타임에 생성
export const dynamic = "force-static";

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold mb-2">FlowMate 개인정보처리방침</h1>
          <p className="text-muted-foreground mb-8">
            시행일: 2025년 1월 1일 | 최종 업데이트: 2025년 1월 10일
          </p>

          <p className="mb-8">
            주식회사 테크트리아이엔씨(이하 &quot;회사&quot;)는 정보주체의
            자유와 권리 보호를 위해 「개인정보 보호법」 및 관계 법령이 정한
            바를 준수하여, 적법하게 개인정보를 처리하고 안전하게 관리하고
            있습니다. 이에 「개인정보 보호법」 제30조에 따라 정보주체에게
            개인정보 처리에 관한 절차 및 기준을 안내하고, 이와 관련한 고충을
            신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이
            개인정보처리방침을 수립·공개합니다.
          </p>

          {/* 제1조 개인정보의 처리목적 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제1조 (개인정보의 처리목적)
            </h2>
            <p>
              회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는
              개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용
              목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의
              동의를 받는 등 필요한 조치를 이행할 예정입니다.
            </p>
            <ol className="list-decimal pl-6 space-y-3 mt-4">
              <li>
                <strong>회원 가입 및 관리</strong>
                <p className="text-muted-foreground mt-1">
                  회원 가입의사 확인, 회원제 서비스 제공에 따른 본인 식별·인증,
                  회원자격 유지·관리, 서비스 부정이용 방지, 각종 고지·통지,
                  고충처리 목적으로 개인정보를 처리합니다.
                </p>
              </li>
              <li>
                <strong>서비스 제공</strong>
                <p className="text-muted-foreground mt-1">
                  정부 지원사업 매칭, AI 사업계획서 생성, 사업계획서 평가 등
                  서비스 제공, 콘텐츠 제공, 맞춤서비스 제공, 본인인증 목적으로
                  개인정보를 처리합니다.
                </p>
              </li>
              <li>
                <strong>마케팅 및 광고</strong>
                <p className="text-muted-foreground mt-1">
                  신규 서비스(제품) 개발 및 맞춤 서비스 제공, 이벤트 및 광고성
                  정보 제공 및 참여기회 제공, 서비스의 유효성 확인, 접속빈도
                  파악 또는 회원의 서비스 이용에 대한 통계 등을 목적으로
                  개인정보를 처리합니다.
                </p>
              </li>
              <li>
                <strong>고충처리</strong>
                <p className="text-muted-foreground mt-1">
                  민원인의 신원 확인, 민원사항 확인, 사실조사를 위한 연락·통지,
                  처리결과 통보 목적으로 개인정보를 처리합니다.
                </p>
              </li>
            </ol>
          </section>

          {/* 제2조 개인정보의 처리 및 보유기간 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제2조 (개인정보의 처리 및 보유기간)
            </h2>
            <p>
              회사는 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터
              개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서
              개인정보를 처리·보유합니다.
            </p>
            <div className="overflow-x-auto mt-4">
              <table className="min-w-full border-collapse border border-border">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border px-4 py-2 text-left">
                      항목
                    </th>
                    <th className="border border-border px-4 py-2 text-left">
                      보유기간
                    </th>
                    <th className="border border-border px-4 py-2 text-left">
                      근거
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border px-4 py-2">
                      회원 정보
                    </td>
                    <td className="border border-border px-4 py-2">
                      회원 탈퇴 시까지
                    </td>
                    <td className="border border-border px-4 py-2">
                      정보주체 동의
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">
                      생성 콘텐츠 (사업계획서 등)
                    </td>
                    <td className="border border-border px-4 py-2">
                      삭제 요청 또는 탈퇴 시까지
                    </td>
                    <td className="border border-border px-4 py-2">
                      정보주체 동의
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">
                      서비스 이용 기록
                    </td>
                    <td className="border border-border px-4 py-2">3개월</td>
                    <td className="border border-border px-4 py-2">
                      서비스 품질 향상
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">
                      결제 기록
                    </td>
                    <td className="border border-border px-4 py-2">5년</td>
                    <td className="border border-border px-4 py-2">
                      전자상거래 등에서의 소비자보호에 관한 법률
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">
                      접속 로그 기록
                    </td>
                    <td className="border border-border px-4 py-2">3개월</td>
                    <td className="border border-border px-4 py-2">
                      통신비밀보호법
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제3조 처리하는 개인정보 항목 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제3조 (처리하는 개인정보 항목)
            </h2>
            <p>회사는 다음의 개인정보 항목을 처리하고 있습니다.</p>
            <div className="overflow-x-auto mt-4">
              <table className="min-w-full border-collapse border border-border">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border px-4 py-2 text-left">
                      구분
                    </th>
                    <th className="border border-border px-4 py-2 text-left">
                      수집 항목
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border px-4 py-2">필수</td>
                    <td className="border border-border px-4 py-2">
                      이메일 주소, 비밀번호(암호화), 이름, 접속 로그
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">선택</td>
                    <td className="border border-border px-4 py-2">
                      프로필 이미지, 사업자등록번호, 연락처, 기업 정보
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">
                      자동 수집
                    </td>
                    <td className="border border-border px-4 py-2">
                      생성 콘텐츠, 프롬프트 기록, IP 주소, 기기 정보, 브라우저
                      정보
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제4조 개인정보의 제3자 제공 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제4조 (개인정보의 제3자 제공)
            </h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                회사는 정보주체의 개인정보를 제1조(개인정보의 처리목적)에서 명시한
                범위 내에서만 처리하며, 정보주체의 동의, 법률의 특별한 규정 등
                「개인정보 보호법」 제17조 및 제18조에 해당하는 경우에만
                개인정보를 제3자에게 제공합니다.
              </li>
              <li>
                회사는 AI 기반 서비스 제공을 위해 다음과 같이 개인정보를
                처리합니다.
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>
                    <strong>Google LLC (Vertex AI / Gemini)</strong>: AI
                    사업계획서 생성 및 분석
                  </li>
                  <li>
                    <strong>OpenAI</strong>: 임베딩 및 텍스트 분석
                  </li>
                </ul>
              </li>
            </ol>
          </section>

          {/* 제5조 개인정보 처리의 위탁 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제5조 (개인정보 처리의 위탁)
            </h2>
            <p>
              회사는 원활한 개인정보 업무처리를 위하여 다음과 같이 개인정보
              처리업무를 위탁하고 있습니다.
            </p>
            <div className="overflow-x-auto mt-4">
              <table className="min-w-full border-collapse border border-border">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border px-4 py-2 text-left">
                      위탁받는 자
                    </th>
                    <th className="border border-border px-4 py-2 text-left">
                      위탁하는 업무 내용
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border px-4 py-2">
                      Vercel Inc.
                    </td>
                    <td className="border border-border px-4 py-2">
                      클라우드 호스팅 및 서비스 제공
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">
                      Supabase Inc.
                    </td>
                    <td className="border border-border px-4 py-2">
                      데이터베이스 및 스토리지 서비스
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제6조 정보주체의 권리·의무 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제6조 (정보주체의 권리·의무 및 행사방법)
            </h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                정보주체는 회사에 대해 언제든지 다음 각 호의 개인정보 보호 관련
                권리를 행사할 수 있습니다.
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>개인정보 열람 요구</li>
                  <li>오류 등이 있을 경우 정정 요구</li>
                  <li>삭제 요구</li>
                  <li>처리정지 요구</li>
                </ul>
              </li>
              <li>
                권리 행사는 서면, 전자우편, 모사전송(FAX) 등을 통하여 할 수
                있으며, 회사는 이에 대해 지체없이 조치하겠습니다.
              </li>
              <li>
                권리 행사는 정보주체의 법정대리인이나 위임을 받은 자 등 대리인을
                통하여 할 수 있습니다.
              </li>
            </ol>
          </section>

          {/* 제7조 개인정보의 파기 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제7조 (개인정보의 파기)
            </h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가
                불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.
              </li>
              <li>
                개인정보 파기의 절차 및 방법은 다음과 같습니다.
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>
                    <strong>파기절차</strong>: 불필요한 개인정보는 개인정보의
                    처리가 불필요한 것으로 인정되는 날로부터 5일 이내에
                    파기합니다.
                  </li>
                  <li>
                    <strong>파기방법</strong>: 전자적 파일 형태로 기록·저장된
                    개인정보는 기록을 재생할 수 없도록 파기합니다.
                  </li>
                </ul>
              </li>
            </ol>
          </section>

          {/* 제8조 개인정보의 안전성 확보조치 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제8조 (개인정보의 안전성 확보조치)
            </h2>
            <p>
              회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고
              있습니다.
            </p>
            <ol className="list-decimal pl-6 space-y-2 mt-3">
              <li>
                <strong>관리적 조치</strong>: 내부관리계획 수립·시행, 정기적
                직원 교육
              </li>
              <li>
                <strong>기술적 조치</strong>: 개인정보처리시스템 등의 접근권한
                관리, 접근통제시스템 설치, 개인정보의 암호화, 보안프로그램
                설치
              </li>
              <li>
                <strong>물리적 조치</strong>: 전산실, 자료보관실 등의 접근통제
              </li>
            </ol>
          </section>

          {/* 제9조 개인정보 보호책임자 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제9조 (개인정보 보호책임자)
            </h2>
            <p>
              회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보
              처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와
              같이 개인정보 보호책임자를 지정하고 있습니다.
            </p>
            <div className="bg-muted p-4 rounded-lg mt-4">
              <p>
                <strong>개인정보 보호책임자</strong>
              </p>
              <p className="mt-2">성명: 박현일</p>
              <p>직책: 대표이사</p>
              <p>
                이메일:{" "}
                <a
                  href="mailto:flowcoder25@gmail.com"
                  className="text-primary hover:underline"
                >
                  flowcoder25@gmail.com
                </a>
              </p>
            </div>
          </section>

          {/* 제10조 권익침해 구제방법 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제10조 (권익침해 구제방법)
            </h2>
            <p>
              정보주체는 아래의 기관에 대해 개인정보 침해에 대한 피해구제, 상담
              등을 문의하실 수 있습니다.
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)
              </li>
              <li>
                개인정보침해신고센터: 118 (privacy.kisa.or.kr)
              </li>
              <li>대검찰청: 1301 (www.spo.go.kr)</li>
              <li>경찰청: 182 (ecrm.cyber.go.kr)</li>
            </ul>
          </section>

          {/* 제11조 AI 데이터 처리 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제11조 (AI 데이터 처리)
            </h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                회사는 AI 기반 서비스 제공을 위해 이용자가 입력한 정보를
                처리합니다. 입력된 정보는 AI 모델 학습에 사용되지 않으며, 오직
                서비스 제공 목적으로만 처리됩니다.
              </li>
              <li>
                AI 생성물에는 워터마크, 메타데이터 등의 형태로 &quot;AI
                생성물&quot; 표시가 포함될 수 있습니다.
              </li>
              <li>
                이용자가 입력한 기업 정보, 프롬프트 등은 서비스 품질 향상을
                위해 익명화된 형태로 분석될 수 있습니다.
              </li>
            </ol>
          </section>

          {/* 제12조 개인정보처리방침 변경 */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              제12조 (개인정보처리방침 변경)
            </h2>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                이 개인정보처리방침은 2025년 1월 1일부터 적용됩니다.
              </li>
              <li>
                이전의 개인정보처리방침은 서비스 내에서 확인하실 수 있습니다.
              </li>
            </ol>
          </section>

          {/* Footer Links */}
          <div className="mt-12 pt-8 border-t flex flex-wrap gap-4 text-sm">
            <Link href="/terms" className="text-primary hover:underline">
              이용약관
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
