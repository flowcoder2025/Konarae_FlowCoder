/**
 * Who may read or change the RAG embeddings of one source
 * (`document_embeddings`, keyed by source type + source id).
 *
 * - support_project: public announcements. Any signed-in user reads; only an
 *   admin (password sign-in + role=admin, `getAdminSession`) writes.
 * - company: ReBAC viewer reads, company admin (or owner) writes.
 * - business_plan: ReBAC viewer reads, owner writes.
 *
 * Search across sources (`hybridSearch`) cannot filter by source id, so a
 * non-admin may only search support_project; see `/api/rag/search`.
 */

import { getAdminSession } from "@/lib/auth-utils";
import { checkBusinessPlanPermission, checkCompanyPermission } from "@/lib/rebac";
import type { SourceType } from "@/lib/rag";

export type EmbeddingAccess = "read" | "write";

/** `userId` is the id of the session already checked by the caller. */
export async function canAccessEmbeddings(
  userId: string,
  sourceType: SourceType,
  sourceId: string,
  access: EmbeddingAccess
): Promise<boolean> {
  switch (sourceType) {
    case "support_project":
      return access === "read" || (await getAdminSession()) !== null;
    case "company":
      return checkCompanyPermission(userId, sourceId, access === "write" ? "admin" : "viewer");
    case "business_plan":
      return checkBusinessPlanPermission(userId, sourceId, access === "write" ? "owner" : "viewer");
    default: {
      const unknown: never = sourceType;
      throw new Error(`Unknown embedding source type: ${String(unknown)}`);
    }
  }
}
