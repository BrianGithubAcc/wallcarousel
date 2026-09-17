export interface Playlist {
  id: string
  name: string
  imageIds: string[]
}

export interface PlaylistStore {
  playlists: Playlist[]
}
