import { Request } from 'express';

export type UserRole = 'SYSTEM_ADMIN' | 'COMMUNE_USER' | string;

export type CurrentUser = {
  userId: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  communeId: string | null;
  communeName: string | null;
};

export type AuthenticatedRequest = Request & {
  currentUser?: CurrentUser;
};

export function isSystemAdmin(user: CurrentUser) {
  return user.role === 'SYSTEM_ADMIN';
}

export function getUserCommuneScope(user: CurrentUser) {
  return isSystemAdmin(user) ? null : user.communeId;
}
