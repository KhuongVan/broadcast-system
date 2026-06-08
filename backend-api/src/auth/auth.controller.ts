import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('/api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('/login')
  login(
    @Body() body: { username?: string; password?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = this.auth.login(body.username || '', body.password || '');
    if (!session) {
      throw new UnauthorizedException('Sai ten dang nhap hoac mat khau.');
    }

    this.auth.setSessionCookie(response, session.token);
    return { authenticated: true };
  }

  @Post('/logout')
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.auth.logout(request);
    this.auth.clearSessionCookie(response);
    return { authenticated: false };
  }

  @Get('/me')
  me(@Req() request: Request) {
    const session = this.auth.getRequestSession(request);
    return {
      authenticated: Boolean(session),
      username: session?.username || null,
      expiresAt: session ? new Date(session.expiresAt).toISOString() : null,
    };
  }
}
