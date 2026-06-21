import { AudioFileRecord } from '../audio-files/audio-file.types';

export type PlaylistItemRecord = {
  playlistItemId: string;
  playlistId: string;
  fileId: string;
  sortOrder: number;
  createdAt: string;
  file: AudioFileRecord;
};

export type PlaylistRecord = {
  playlistId: string;
  name: string;
  communeId: string | null;
  createdAt: string;
  updatedAt: string;
  totalFiles: number;
  totalSize: number;
  items: PlaylistItemRecord[];
};
