import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { DeviceClientService } from './device-client.service';
import { DeviceClientRequest } from './device-client.types';

@Injectable()
export class DeviceClientAuthGuard implements CanActivate {
  constructor(private readonly deviceClient: DeviceClientService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<DeviceClientRequest>();
    const authHeader = request.headers.authorization || '';
    const token = this.extractBearerToken(Array.isArray(authHeader) ? authHeader[0] : authHeader);

    if (!token) throw new UnauthorizedException('Vui long gui device token.');

    const device = await this.deviceClient.authenticateToken(token);
    request.deviceClient = device;
    return true;
  }

  private extractBearerToken(header: string) {
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
  }
}
