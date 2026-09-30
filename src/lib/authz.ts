import { getHeader } from "@/lib/http-utils";
import { parseSessionFromHeader } from "@/services/auth.server";
import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http-error";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type Action =
  | "family:delete"
  | "family:rename"
  | "member:add"
  | "member:remove"
  | "member:changeRole"
  | "budget:manage"
  | "category:manage"
  | "expense:create"
  | "expense:editAny"
  | "expense:editOwn"
  | "expense:deleteAny"
  | "expense:deleteOwn"
  | "readAll";

const PERMISSION_MATRIX: Record<Role, Set<Action>> = {
  OWNER: new Set<Action>([
    "family:delete",
    "family:rename",
    "member:add",
    "member:remove",
    "member:changeRole",
    "budget:manage",
    "category:manage",
    "expense:create",
    "expense:editAny",
    "expense:editOwn",
    "expense:deleteAny",
    "expense:deleteOwn",
    "readAll",
  ]),
  ADMIN: new Set<Action>([
    "family:rename",
    "member:add",
    "member:remove",
    "budget:manage",
    "category:manage",
    "expense:create",
    "expense:editAny",
    "expense:editOwn",
    "expense:deleteAny",
    "expense:deleteOwn",
    "readAll",
  ]),
  MEMBER: new Set<Action>(["expense:create", "expense:editOwn", "expense:deleteOwn", "readAll"]),
  VIEWER: new Set<Action>(["readAll"]),
};

export function can(role: Role, action: Action): boolean {
  const permissions = PERMISSION_MATRIX[role];
  return permissions ? permissions.has(action) : false;
}

export function assertCan(role: Role, action: Action) {
  if (!can(role, action)) {
    throw httpError("You do not have permission to perform this action", 403);
  }
}

export interface AuthContext {
  userId: string;
  familyId: string;
  memberId: string;
  role: Role;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const cookieHeader = getHeader("cookie");
  const payload = await parseSessionFromHeader(cookieHeader);

  if (!payload || !payload.userId) {
    throw httpError("Please sign in to continue", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    throw httpError("Please sign in to continue", 401);
  }

  const membership = await prisma.familyMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { family: true },
  });

  if (!membership || !membership.family) {
    throw httpError("No family membership is available for this account", 401);
  }

  return {
    userId: user.id,
    familyId: membership.familyId,
    memberId: membership.id,
    role: (membership.role as Role) || "MEMBER",
    user,
  };
}

export async function requireMember(action?: Action): Promise<AuthContext> {
  const auth = await requireAuth();
  if (action) {
    assertCan(auth.role, action);
  }
  return auth;
}
