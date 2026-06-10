import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { EmergencySourcesService } from './emergency-sources.service';
import { EmergencySourceInput } from './emergency-source.types';

@Controller('/api/emergency-sources')
export class EmergencySourcesController {
  constructor(private readonly service: EmergencySourcesService) {}

  @Get()
  async list() {
    const sources = await this.service.listSources();
    return { sources };
  }

  @Post()
  async create(@Body() body: Partial<EmergencySourceInput>) {
    const source = await this.service.createSource(body);
    return { source };
  }

  @Put(':sourceId')
  async update(@Param('sourceId') sourceId: string, @Body() body: Partial<EmergencySourceInput>) {
    const source = await this.service.updateSource(sourceId, body);
    return { source };
  }

  @Delete(':sourceId')
  async delete(@Param('sourceId') sourceId: string) {
    await this.service.deleteSource(sourceId);
    return { success: true };
  }
}
