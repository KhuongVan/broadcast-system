import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AuthService } from './auth.service';
import { SystemAdminOnly } from './roles.decorator';

type UserBody = {
  username?: string;
  password?: string;
  displayName?: string | null;
  role?: string;
  communeId?: string | null;
  active?: boolean;
};

@Controller()
@UseGuards(AdminAuthGuard)
@SystemAdminOnly()
export class AdminUsersController {
  constructor(
    private readonly storage: StorageService,
    private readonly auth: AuthService,
  ) {}

  @Get('/api/communes')
  async listCommunes() {
    return { communes: await this.storage.listCommunes() };
  }

  @Post('/api/communes')
  async createCommune(@Body() body: { name?: string; code?: string; status?: 'ACTIVE' | 'INACTIVE' }) {
    const input = this.normalizeCommune(body);
    return { commune: await this.storage.createCommune(input) };
  }

  @Put('/api/communes/:communeId')
  async updateCommune(@Param('communeId') communeId: string, @Body() body: { name?: string; code?: string; status?: 'ACTIVE' | 'INACTIVE' }) {
    const commune = await this.storage.updateCommune(communeId, this.normalizeCommune(body));
    if (!commune) throw new NotFoundException('Khong tim thay xa.');
    return { commune };
  }

  @Get('/api/users')
  async listUsers() {
    return { users: await this.storage.listUsers() };
  }

  @Post('/api/users')
  async createUser(@Body() body: UserBody) {
    const input = await this.normalizeUser(body, true);
    return { user: await this.storage.createUser(input) };
  }

  @Put('/api/users/:userId')
  async updateUser(@Param('userId') userId: string, @Body() body: UserBody) {
    const input = await this.normalizeUser(body, false);
    const user = await this.storage.updateUser({ userId, ...input });
    if (!user) throw new NotFoundException('Khong tim thay user.');
    return { user };
  }

  @Post('/api/users/:userId/reset-password')
  async resetPassword(@Param('userId') userId: string, @Body() body: { password?: string }) {
    const password = String(body.password || '');
    if (password.length < 8) throw new BadRequestException('Mat khau phai co it nhat 8 ky tu.');
    const user = await this.storage.resetUserPassword(userId, await this.auth.hashPassword(password));
    if (!user) throw new NotFoundException('Khong tim thay user.');
    return { user };
  }

  private normalizeCommune(body: { name?: string; code?: string; status?: 'ACTIVE' | 'INACTIVE' }) {
    const name = String(body.name || '').trim();
    const code = String(body.code || '').trim().toUpperCase();
    const status: 'ACTIVE' | 'INACTIVE' = body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (!name) throw new BadRequestException('Vui long nhap ten xa.');
    if (!code) throw new BadRequestException('Vui long nhap ma xa.');
    return { name, code, status };
  }

  private async normalizeUser(body: UserBody, requirePassword: boolean) {
    const username = this.normalizeUsername(body.username);
    const password = String(body.password || '');
    const role = body.role === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'COMMUNE_USER';
    const communeId = role === 'SYSTEM_ADMIN' ? null : String(body.communeId || '').trim();
    const displayName = String(body.displayName || '').trim() || null;
    const active = body.active !== false;

    if (requirePassword && !username) throw new BadRequestException('Vui long nhap username.');
    if (requirePassword && password.length < 8) throw new BadRequestException('Mat khau phai co it nhat 8 ky tu.');
    if (role === 'COMMUNE_USER' && !communeId) throw new BadRequestException('User xa phai duoc gan voi mot xa.');
    const commune = communeId ? await this.storage.getCommune(communeId) : null;
    if (communeId && !commune) throw new BadRequestException('Xa khong ton tai.');
    if (role === 'COMMUNE_USER' && commune) {
      const prefix = `${this.slugUsernamePart(commune.code)}_`;
      if (!username.startsWith(prefix)) {
        throw new BadRequestException(`Username user xa phai bat dau bang ${prefix}.`);
      }
    }

    return {
      username,
      passwordHash: requirePassword ? await this.auth.hashPassword(password) : '',
      displayName,
      role,
      communeId,
      active,
    };
  }

  private normalizeUsername(value: unknown) {
    const username = String(value || '').trim().toLowerCase();
    if (!username) return '';
    if (username.length < 3 || username.length > 64) {
      throw new BadRequestException('Username phai dai tu 3 den 64 ky tu.');
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      throw new BadRequestException('Username chi duoc gom chu thuong a-z, so 0-9 va dau gach duoi.');
    }
    return username;
  }

  private slugUsernamePart(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
  }
}
