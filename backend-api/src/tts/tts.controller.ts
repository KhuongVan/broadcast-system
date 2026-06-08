import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { GenerateTtsInput } from './tts.types';
import { TtsService } from './tts.service';

@Controller('/api/tts')
@UseGuards(AdminAuthGuard)
export class TtsController {
  constructor(private readonly tts: TtsService) {}

  @Get('/voices')
  voices() {
    return this.tts.listVoices();
  }

  @Post('/generate')
  async generate(@Body() body: GenerateTtsInput) {
    return this.tts.generate(body);
  }
}
