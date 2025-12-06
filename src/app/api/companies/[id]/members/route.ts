import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission, grant } from "@/lib/rebac";
import { z } from "zod";

const inviteMemberSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
  role: z.enum(["admin", "member", "viewer"], {
    errorMap: () => ({ message: "역할은 admin, member, viewer 중 하나여야 합니다" }),
  }),
});

/**
 * POST /api/companies/[id]/members
 * Invite member (requires admin+ permission)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: companyId } = await params;

    // Check permission
    const hasPermission = await checkCompanyPermission(session.user.id, companyId, "admin");
    if (!hasPermission) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const body = await req.json();
    const { email, role } = inviteMemberSchema.parse(body);

    // Find user by email
    const invitedUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!invitedUser) {
      return NextResponse.json(
        { error: "해당 이메일의 사용자를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Check if already a member
    const existingMember = await prisma.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId,
          userId: invitedUser.id,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "이미 멤버로 등록된 사용자입니다" },
        { status: 400 }
      );
    }

    // Add member with transaction
    const member = await prisma.$transaction(async (tx) => {
      const newMember = await tx.companyMember.create({
        data: {
          companyId,
          userId: invitedUser.id,
          role,
          joinedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      // Grant permission using ReBAC
      await grant("company", companyId, role as any, "user", invitedUser.id);

      return newMember;
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error inviting member:", error);
    return NextResponse.json(
      { error: "멤버 초대에 실패했습니다" },
      { status: 500 }
    );
  }
}
