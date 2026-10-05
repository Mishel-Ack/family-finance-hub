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
  | "member:changeMemberRole"
  | "member:removeAdmin"
  | "member:removeOwner"
  | "member:changeAdminRole"
  | "member:changeOwnerRole"
  | "member:assignAdminRole"
  | "member:leave"
  | "member:transferOwnership"
  | "member:updateDisplayName"
  | "family:create"
  | "invite:create"
  | "invite:createAdmin"
  | "invite:list"
  | "invite:revoke"
  | "budget:manage"
  | "category:manage"
  | "expense:create"
  | "expense:editAny"
  | "expense:editOwn"
  | "expense:deleteAny"
  | "expense:deleteOwn"
  | "split:create"
  | "split:manageAny"
  | "settlement:create"
  | "settlement:manageAny"
  | "settlement:deleteOwn"
  | "settlement:deleteAny"
  | "activity:read"
  | "readAll";

const PERMISSION_MATRIX: Record<Role, Set<Action>> = {
  OWNER: new Set<Action>([
    "family:delete",
    "family:rename",
    "member:add",
    "member:remove",
    "member:changeRole",
    "member:changeMemberRole",
    "member:removeAdmin",
    "member:changeAdminRole",
    "member:assignAdminRole",
    "member:transferOwnership",
    "member:leave",
    "member:updateDisplayName",
    "family:create",
    "invite:create",
    "invite:createAdmin",
    "invite:list",
    "invite:revoke",
    "budget:manage",
    "category:manage",
    "expense:create",
    "expense:editAny",
    "expense:editOwn",
    "expense:deleteAny",
    "expense:deleteOwn",
    "split:create",
    "split:manageAny",
    "settlement:create",
    "settlement:manageAny",
    "settlement:deleteOwn",
    "settlement:deleteAny",
    "readAll",
    "activity:read",
  ]),
  ADMIN: new Set<Action>([
    "family:rename",
    "member:add",
    "member:changeMemberRole",
    "invite:create",
    "invite:list",
    "invite:revoke",
    "member:remove",
    "member:leave",
    "member:updateDisplayName",
    "family:create",
    "budget:manage",
    "category:manage",
    "expense:create",
    "expense:editAny",
    "expense:editOwn",
    "expense:deleteAny",
    "expense:deleteOwn",
    "split:create",
    "split:manageAny",
    "settlement:create",
    "settlement:manageAny",
    "settlement:deleteAny",
    "readAll",
    "activity:read",
  ]),
  MEMBER: new Set<Action>([
    "expense:create",
    "expense:editOwn",
    "expense:deleteOwn",
    "split:create",
    "settlement:create",
    "settlement:deleteOwn",
    "readAll",
    "activity:read",
    "member:leave",
    "member:updateDisplayName",
    "family:create",
  ]),
  VIEWER: new Set<Action>([
    "readAll",
    "activity:read",
    "member:leave",
    "member:updateDisplayName",
    "family:create",
  ]),
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

export interface SessionUserContext {
  userId: string;
  user: { id: string; name: string; email: string };
  membership: { familyId: string; memberId: string; role: Role } | null;
}

let testAuthResolver: (() => Promise<AuthContext | null>) | undefined;

export function setAuthResolverForTests(resolver: (() => Promise<AuthContext | null>) | undefined) {
  if (process.env["NODE_ENV"] !== "test") {
    throw new Error("The auth test seam is only available in test mode");
  }
  testAuthResolver = resolver;
}

export async function requireSessionUser(): Promise<SessionUserContext> {
  let userId: string | undefined;
  if (testAuthResolver) {
    const testAuth = await testAuthResolver();
    if (!testAuth) throw httpError("Please sign in to continue", 401);
    userId = testAuth.userId;
  } else {
    const cookieHeader = getHeader("cookie");
    const payload = await parseSessionFromHeader(cookieHeader);
    userId = payload?.userId;
  }

  if (!userId) {
    throw httpError("Please sign in to continue", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
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

  return {
    userId: user.id,
    user,
    membership: membership?.family
      ? { familyId: membership.familyId, memberId: membership.id, role: membership.role }
      : null,
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const session = await requireSessionUser();
  if (!session.membership) {
    throw httpError("No family membership is available for this account", 401);
  }
  return { ...session.membership, userId: session.userId, user: session.user };
}

export async function requireMember(action?: Action): Promise<AuthContext> {
  const auth = await requireAuth();
  if (action) {
    assertCan(auth.role, action);
  }
  return auth;
}
