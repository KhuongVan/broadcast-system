import { Injectable, NotFoundException } from '@nestjs/common';
import { CurrentUser, getUserCommuneScope } from '../auth/auth.types';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class PlaylistsService {
  constructor(private readonly storage: StorageService) {}

  listPlaylists(user?: CurrentUser) {
    return this.storage.listPlaylists(user ? getUserCommuneScope(user) : null);
  }

  getPlaylist(playlistId: string, user?: CurrentUser) {
    return this.storage.getPlaylist(playlistId, user ? getUserCommuneScope(user) : null);
  }

  createPlaylist(name: string, user: CurrentUser) {
    return this.storage.createPlaylist(name, getUserCommuneScope(user));
  }

  updatePlaylist(playlistId: string, name: string, user: CurrentUser) {
    return this.storage.updatePlaylist(playlistId, name, getUserCommuneScope(user));
  }

  deletePlaylist(playlistId: string, user: CurrentUser) {
    return this.storage.deletePlaylist(playlistId, getUserCommuneScope(user));
  }

  async addItem(playlistId: string, fileId: string, user: CurrentUser) {
    const communeId = getUserCommuneScope(user);
    const [playlist, file] = await Promise.all([
      this.storage.getPlaylist(playlistId, communeId),
      this.storage.getFile(fileId, communeId),
    ]);
    if (!playlist) throw new NotFoundException('Khong tim thay danh sach phat.');
    if (!file) throw new NotFoundException('Khong tim thay file.');
    return this.storage.addPlaylistItem(playlistId, fileId);
  }

  deleteItem(playlistItemId: string) {
    return this.storage.deletePlaylistItem(playlistItemId);
  }
}
