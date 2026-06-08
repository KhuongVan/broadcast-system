import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class PlaylistsService {
  constructor(private readonly storage: StorageService) {}

  listPlaylists() {
    return this.storage.listPlaylists();
  }

  getPlaylist(playlistId: string) {
    return this.storage.getPlaylist(playlistId);
  }

  createPlaylist(name: string) {
    return this.storage.createPlaylist(name);
  }

  updatePlaylist(playlistId: string, name: string) {
    return this.storage.updatePlaylist(playlistId, name);
  }

  deletePlaylist(playlistId: string) {
    return this.storage.deletePlaylist(playlistId);
  }

  addItem(playlistId: string, fileId: string) {
    return this.storage.addPlaylistItem(playlistId, fileId);
  }

  deleteItem(playlistItemId: string) {
    return this.storage.deletePlaylistItem(playlistItemId);
  }
}
