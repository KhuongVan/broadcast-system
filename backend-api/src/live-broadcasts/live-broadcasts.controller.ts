import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../auth/auth.types';
import { LiveBroadcastCreateInput } from './live-broadcast.types';
import { LiveBroadcastsService } from './live-broadcasts.service';

@Controller('/api/live-broadcasts')
@UseGuards(AdminAuthGuard)
export class LiveBroadcastsController {
  constructor(private readonly liveBroadcasts: LiveBroadcastsService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserType) {
    return { sessions: await this.liveBroadcasts.listSessions(user) };
  }

  @Post()
  async create(@Body() body: Partial<LiveBroadcastCreateInput>, @CurrentUser() user: CurrentUserType) {
    return { session: await this.liveBroadcasts.createSession(body, user) };
  }

  @Put('/:sessionId/finish')
  async finish(@Param('sessionId') sessionId: string, @Body() body: { message?: string }, @CurrentUser() user: CurrentUserType) {
    return { session: await this.liveBroadcasts.finishSession(sessionId, body.message || null, user) };
  }

  @Put('/:sessionId/fail')
  async fail(@Param('sessionId') sessionId: string, @Body() body: { message?: string }, @CurrentUser() user: CurrentUserType) {
    return { session: await this.liveBroadcasts.failSession(sessionId, body.message || null, user) };
  }

  @Delete('/:sessionId')
  async delete(@Param('sessionId') sessionId: string, @CurrentUser() user: CurrentUserType) {
    return { session: await this.liveBroadcasts.deleteSession(sessionId, user) };
  }
}
