import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export function Roles(...roles: string[]) {
  return SetMetadata(ROLES_KEY, roles);
}

export const SystemAdminOnly = () => Roles('SYSTEM_ADMIN');
