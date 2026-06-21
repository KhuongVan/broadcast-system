import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CurrentUser as CurrentUserType } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmergencyBroadcastsService } from './emergency-broadcasts.service';
import { EmergencyBroadcastStartInput } from './emergency-broadcast.types';

@Controller('/api/emergency-broadcasts')
@UseGuards(AdminAuthGuard)
export class EmergencyBroadcastsController {
  constructor(private readonly service: EmergencyBroadcastsService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserType) {
    const sessions = await this.service.listSessions(user);
    return { sessions };
  }

  @Post('/start')
  async start(@Body() body: Partial<EmergencyBroadcastStartInput>, @CurrentUser() user: CurrentUserType) {
    const session = await this.service.startSession(body, user);
    return { session };
  }

  @Post(':sessionId/stop')
  async stop(@Param('sessionId') sessionId: string, @CurrentUser() user: CurrentUserType) {
    const session = await this.service.stopSession(sessionId, user);
    return { session };
  }
}
