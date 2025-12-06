import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission, revoke } from "@/lib/rebac";

/**
 * DELETE /api/companies/[id]/members/[userId]
 * Remove member (requires admin+ permission)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: companyId, userId } = await params;

    // Check permission
    const hasPermission = await checkCompanyPermission(session.user.id, companyId, "admin");
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    // Get member to find role
    const member = await prisma.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId,
          userId,
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "멤버를 찾을 수 없습니다" }, { status: 404 });
    }

    // Cannot remove owner
    if (member.role === "owner") {
      return NextResponse.json(
        { error: "소유자는 삭제할 수 없습니다" },
        { status: 400 }
      );
    }

    // Remove member with transaction
    await prisma.$transaction(async (tx) => {
      await tx.companyMember.delete({
        where: {
          companyId_userId: {
            companyId,
            userId,
          },
        },
      });

      // Revoke permission using ReBAC
      await revoke("company", companyId, member.role as any, "user", userId);
    });

    return NextResponse.json({ message: "멤버가 삭제되었습니다" });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "멤버 삭제에 실패했습니다" },
      { status: 500 }
    );
  }
}
