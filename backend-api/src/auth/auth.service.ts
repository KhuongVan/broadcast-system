import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { promisify } from 'util';
import { config } from '../config';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from './auth.types';

const SESSION_COOKIE = 'admin_session';
const scrypt = promisify(scryptCallback);

type SessionRecord = {
  user: CurrentUser;
  expiresAt: number;
};

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly storage: StorageService) {
    if (!config.adminUsername || !config.adminPassword) {
      throw new Error('Thieu ADMIN_USERNAME hoac ADMIN_PASSWORD.');
    }
  }

  async login(username: string, password: string) {
    this.cleanupExpiredSessions();

    const user = await this.storage.getAuthUserByUsername(username);
    if (user) {
      if (!user.active || !(await this.verifyPassword(password, user.passwordHash))) return null;

      const token = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + config.sessionTtlSeconds * 1000;
      this.sessions.set(token, {
        user: {
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          communeId: user.communeId,
          communeName: user.communeName,
        },
        expiresAt,
      });
      return { token, expiresAt };
    }

    if (this.secureEquals(username, config.adminUsername) && this.secureEquals(password, config.adminPassword)) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + config.sessionTtlSeconds * 1000;
      this.sessions.set(token, {
        user: {
          userId: 'env-system-admin',
          username,
          displayName: 'System Admin',
          role: 'SYSTEM_ADMIN',
          communeId: null,
          communeName: null,
        },
        expiresAt,
      });
      return { token, expiresAt };
    }

    return null;
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

  getRequestUser(request: Request) {
    return this.getRequestSession(request)?.user || null;
  }

  getRequestSession(request: Request) {
    const token = this.getSessionTokenFromRequest(request);
    if (!token || !this.isTokenAuthenticated(token)) return null;
    return this.sessions.get(token) || null;
  }

  getCookieHeaderUser(cookieHeader?: string | string[]) {
    const cookies = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
    const token = this.getCookieValue(cookies, SESSION_COOKIE);
    if (!token || !this.isTokenAuthenticated(token)) return null;
    return this.sessions.get(token)?.user || null;
  }

  isCookieHeaderAuthenticated(cookieHeader?: string | string[]) {
    return Boolean(this.getCookieHeaderUser(cookieHeader));
  }

  async hashPassword(password: string) {
    const salt = randomBytes(16).toString('base64url');
    const key = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt}$${key.toString('base64url')}`;
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

  private async verifyPassword(password: string, passwordHash: string) {
    const [algorithm, salt, expectedKey] = passwordHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !expectedKey) return false;

    const key = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(expectedKey, 'base64url');
    return key.length === expected.length && timingSafeEqual(key, expected);
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }
}
