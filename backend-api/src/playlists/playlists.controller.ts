import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../auth/auth.types';
import { PlaylistsService } from './playlists.service';

@Controller('/api/playlists')
@UseGuards(AdminAuthGuard)
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserType) {
    return { playlists: await this.playlists.listPlaylists(user) };
  }

  @Post()
  async create(@Body() body: { name?: string }, @CurrentUser() user: CurrentUserType) {
    return { playlist: await this.playlists.createPlaylist(body.name || 'Danh sách phát mới', user) };
  }

  @Get('/:playlistId')
  async get(@Param('playlistId') playlistId: string, @CurrentUser() user: CurrentUserType) {
    const playlist = await this.playlists.getPlaylist(playlistId, user);
    if (!playlist) throw new NotFoundException('Khong tim thay danh sach phat.');
    return { playlist };
  }

  @Put('/:playlistId')
  async update(@Param('playlistId') playlistId: string, @Body() body: { name?: string }, @CurrentUser() user: CurrentUserType) {
    const playlist = await this.playlists.updatePlaylist(playlistId, body.name || 'Danh sách phát', user);
    if (!playlist) throw new NotFoundException('Khong tim thay danh sach phat.');
    return { playlist };
  }

  @Delete('/:playlistId')
  async delete(@Param('playlistId') playlistId: string, @CurrentUser() user: CurrentUserType) {
    await this.playlists.deletePlaylist(playlistId, user);
    return { success: true };
  }

  @Post('/:playlistId/items')
  async addItem(@Param('playlistId') playlistId: string, @Body() body: { fileId?: string }, @CurrentUser() user: CurrentUserType) {
    if (!body.fileId) throw new NotFoundException('Khong tim thay file.');
    return { playlist: await this.playlists.addItem(playlistId, body.fileId, user) };
  }

  @Delete('/:playlistId/items/:playlistItemId')
  async deleteItem(@Param('playlistItemId') playlistItemId: string) {
    await this.playlists.deleteItem(playlistItemId);
    return { success: true };
  }
}
