import { Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { config } from '../config';

const SESSION_COOKIE = 'admin_session';

type SessionRecord = {
  username: string;
  expiresAt: number;
};

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor() {
    if (!config.adminUsername || !config.adminPassword) {
      throw new Error('Thieu ADMIN_USERNAME hoac ADMIN_PASSWORD.');
    }
  }

  login(username: string, password: string) {
    this.cleanupExpiredSessions();

    if (!this.secureEquals(username, config.adminUsername) || !this.secureEquals(password, config.adminPassword)) {
      return null;
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + config.sessionTtlSeconds * 1000;
    this.sessions.set(token, { username, expiresAt });
    return { token, expiresAt };
  }

  logout(request: Request) {
    const token = this.getSessionTokenFromRequest(request);
    if (token) this.sessions.delete(token);
  }

  setSessionCookie(response: Response, token: string) {
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionTtlSeconds * 1000,
      path: '/',
    });
  }

  clearSessionCookie(response: Response) {
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
    });
  }

  isRequestAuthenticated(request: Request) {
    const token = this.getSessionTokenFromRequest(request);
    return token ? this.isTokenAuthenticated(token) : false;
  }

  getRequestSession(request: Request) {
    const token = this.getSessionTokenFromRequest(request);
    if (!token || !this.isTokenAuthenticated(token)) return null;
    return this.sessions.get(token) || null;
  }

  isCookieHeaderAuthenticated(cookieHeader?: string | string[]) {
    const cookies = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
    const token = this.getCookieValue(cookies, SESSION_COOKIE);
    return token ? this.isTokenAuthenticated(token) : false;
  }

  private isTokenAuthenticated(token: string) {
    const session = this.sessions.get(token);
    if (!session) return false;

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return false;
    }

    return true;
  }

  private getSessionTokenFromRequest(request: Request) {
    return this.getCookieValue(request.headers.cookie || '', SESSION_COOKIE);
  }

  private getCookieValue(cookieHeader: string, name: string) {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [rawKey, ...rawValue] = cookie.trim().split('=');
      if (rawKey === name) return decodeURIComponent(rawValue.join('='));
    }
    return '';
  }

  private secureEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }
}
