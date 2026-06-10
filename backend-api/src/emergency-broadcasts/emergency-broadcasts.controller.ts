import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EmergencyBroadcastsService } from './emergency-broadcasts.service';
import { EmergencyBroadcastStartInput } from './emergency-broadcast.types';

@Controller('/api/emergency-broadcasts')
export class EmergencyBroadcastsController {
  constructor(private readonly service: EmergencyBroadcastsService) {}

  @Get()
  async list() {
    const sessions = await this.service.listSessions();
    return { sessions };
  }

  @Post('/start')
  async start(@Body() body: Partial<EmergencyBroadcastStartInput>) {
    const session = await this.service.startSession(body);
    return { session };
  }

  @Post(':sessionId/stop')
  async stop(@Param('sessionId') sessionId: string) {
    const session = await this.service.stopSession(sessionId);
    return { session };
  }
}
