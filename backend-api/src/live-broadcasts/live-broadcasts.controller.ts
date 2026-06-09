import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { LiveBroadcastCreateInput } from './live-broadcast.types';
import { LiveBroadcastsService } from './live-broadcasts.service';

@Controller('/api/live-broadcasts')
@UseGuards(AdminAuthGuard)
export class LiveBroadcastsController {
  constructor(private readonly liveBroadcasts: LiveBroadcastsService) {}

  @Get()
  async list() {
    return { sessions: await this.liveBroadcasts.listSessions() };
  }

  @Post()
  async create(@Body() body: Partial<LiveBroadcastCreateInput>) {
    return { session: await this.liveBroadcasts.createSession(body) };
  }

  @Put('/:sessionId/finish')
  async finish(@Param('sessionId') sessionId: string, @Body() body: { message?: string }) {
    return { session: await this.liveBroadcasts.finishSession(sessionId, body.message || null) };
  }

  @Put('/:sessionId/fail')
  async fail(@Param('sessionId') sessionId: string, @Body() body: { message?: string }) {
    return { session: await this.liveBroadcasts.failSession(sessionId, body.message || null) };
  }

  @Delete('/:sessionId')
  async delete(@Param('sessionId') sessionId: string) {
    return { session: await this.liveBroadcasts.deleteSession(sessionId) };
  }
}
