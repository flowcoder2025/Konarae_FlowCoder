/**
 * Authenticated App Layout
 *
 * 인증된 사용자용 레이아웃
 * - 상단 네비게이션 바
 * - 메인 컨텐츠 영역
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Navbar, Footer } from "@/components/layout";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
      />
      <main className="flex-1 px-4 md:px-6 lg:px-8">{children}</main>
      <Footer />
    </div>
  );
}
