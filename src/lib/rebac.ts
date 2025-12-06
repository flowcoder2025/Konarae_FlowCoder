/**
 * ReBAC (Relationship-Based Access Control) Permission System
 * Based on FDP Architecture - Supabase + Prisma + NextAuth
 */

import { prisma } from "./prisma";

// Permission definitions
export const PERMISSIONS = {
  company: {
    owner: ["admin", "member", "viewer"], // inherits all
    admin: ["member", "viewer"],
    member: ["viewer"],
    viewer: [],
  },
  business_plan: {
    owner: ["editor", "viewer"],
    editor: ["viewer"],
    viewer: [],
  },
  matching_result: {
    owner: ["viewer"],
    viewer: [],
  },
} as const;

type Namespace = keyof typeof PERMISSIONS;
type Relation<N extends Namespace> = keyof (typeof PERMISSIONS)[N];

/**
 * Grant permission to a user
 */
export async function grant<N extends Namespace>(
  namespace: N,
  objectId: string,
  relation: Relation<N>,
  subjectType: "user" | "group",
  subjectId: string
) {
  return prisma.relationTuple.create({
    data: {
      namespace,
      objectId,
      relation: relation as string,
      subjectType,
      subjectId,
    },
  });
}

/**
 * Revoke permission from a user
 */
export async function revoke<N extends Namespace>(
  namespace: N,
  objectId: string,
  relation: Relation<N>,
  subjectType: "user" | "group",
  subjectId: string
) {
  return prisma.relationTuple.deleteMany({
    where: {
      namespace,
      objectId,
      relation: relation as string,
      subjectType,
      subjectId,
    },
  });
}

/**
 * Check if user has permission (with inheritance)
 */
export async function check<N extends Namespace>(
  userId: string,
  namespace: N,
  objectId: string,
  requiredRelation: Relation<N>
): Promise<boolean> {
  const permissions = PERMISSIONS[namespace];
  const inherited = (permissions[requiredRelation] || []) as readonly string[];
  const allowedRelations = [requiredRelation as string, ...inherited];

  const count = await prisma.relationTuple.count({
    where: {
      namespace,
      objectId,
      relation: {
        in: allowedRelations as string[],
      },
      subjectType: "user",
      subjectId: userId,
    },
  });

  return count > 0;
}

/**
 * List all objects where user has specific permission
 */
export async function list<N extends Namespace>(
  userId: string,
  namespace: N,
  relation?: Relation<N>
) {
  const where: any = {
    namespace,
    subjectType: "user",
    subjectId: userId,
  };

  if (relation) {
    const permissions = PERMISSIONS[namespace];
    const inherited = (permissions[relation] || []) as readonly string[];
    const allowedRelations = [relation as string, ...inherited];
    where.relation = { in: allowedRelations };
  }

  return prisma.relationTuple.findMany({
    where,
    select: {
      objectId: true,
      relation: true,
    },
  });
}

/**
 * Get user's role for a specific object
 */
export async function getRole<N extends Namespace>(
  userId: string,
  namespace: N,
  objectId: string
): Promise<string | null> {
  const tuple = await prisma.relationTuple.findFirst({
    where: {
      namespace,
      objectId,
      subjectType: "user",
      subjectId: userId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return tuple?.relation || null;
}

/**
 * Initialize permission definitions in database
 */
export async function initializePermissions() {
  for (const [namespace, relations] of Object.entries(PERMISSIONS)) {
    for (const [relation, inherits] of Object.entries(relations)) {
      await prisma.relationDefinition.upsert({
        where: {
          namespace_relation: {
            namespace,
            relation,
          },
        },
        update: {
          inherits,
        },
        create: {
          namespace,
          relation,
          inherits,
        },
      });
    }
  }
}

/**
 * Helper: Check company permission
 */
export async function checkCompanyPermission(
  userId: string,
  companyId: string,
  requiredRole: "owner" | "admin" | "member" | "viewer"
) {
  return check(userId, "company", companyId, requiredRole);
}

/**
 * Helper: Check business plan permission
 */
export async function checkBusinessPlanPermission(
  userId: string,
  businessPlanId: string,
  requiredRole: "owner" | "editor" | "viewer"
) {
  return check(userId, "business_plan", businessPlanId, requiredRole);
}
