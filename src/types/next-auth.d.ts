import { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    /**
     * Epoch ms of the last admin password sign-in. Set only by the jwt
     * callback on an admin credentials sign-in; absent for social sessions.
     */
    adminAuthAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    /** See `Session.adminAuthAt`. */
    adminAuthAt?: number;
  }
}
