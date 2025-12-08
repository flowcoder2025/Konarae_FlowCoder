import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Edge-compatible middleware using auth.config (no Prisma)
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
