import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = this.auth.getRequestUser(request);
    if (!user) throw new UnauthorizedException('Vui long dang nhap.');

    request.currentUser = user;
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) || [];
    if (roles.length && !roles.includes(user.role)) {
      throw new ForbiddenException('Ban khong co quyen thuc hien thao tac nay.');
    }

    return true;
  }
}
