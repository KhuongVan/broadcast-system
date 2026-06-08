import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { PlaylistsService } from './playlists.service';

@Controller('/api/playlists')
@UseGuards(AdminAuthGuard)
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  async list() {
    return { playlists: await this.playlists.listPlaylists() };
  }

  @Post()
  async create(@Body() body: { name?: string }) {
    return { playlist: await this.playlists.createPlaylist(body.name || 'Danh sách phát mới') };
  }

  @Get('/:playlistId')
  async get(@Param('playlistId') playlistId: string) {
    const playlist = await this.playlists.getPlaylist(playlistId);
    if (!playlist) throw new NotFoundException('Khong tim thay danh sach phat.');
    return { playlist };
  }

  @Put('/:playlistId')
  async update(@Param('playlistId') playlistId: string, @Body() body: { name?: string }) {
    const playlist = await this.playlists.updatePlaylist(playlistId, body.name || 'Danh sách phát');
    if (!playlist) throw new NotFoundException('Khong tim thay danh sach phat.');
    return { playlist };
  }

  @Delete('/:playlistId')
  async delete(@Param('playlistId') playlistId: string) {
    await this.playlists.deletePlaylist(playlistId);
    return { success: true };
  }

  @Post('/:playlistId/items')
  async addItem(@Param('playlistId') playlistId: string, @Body() body: { fileId?: string }) {
    if (!body.fileId) throw new NotFoundException('Khong tim thay file.');
    return { playlist: await this.playlists.addItem(playlistId, body.fileId) };
  }

  @Delete('/:playlistId/items/:playlistItemId')
  async deleteItem(@Param('playlistItemId') playlistItemId: string) {
    await this.playlists.deleteItem(playlistItemId);
    return { success: true };
  }
}
