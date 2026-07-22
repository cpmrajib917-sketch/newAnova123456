export interface Anime {
  id: string;
  title: string;
  poster: string;
  banner?: string;
  type?: string;
  status?: string;
  episodes?: number;
  rating?: string;
  description?: string;
  genres?: string[];
  studio?: string;
  subAvailable?: boolean;
  dubAvailable?: boolean;
  hindiAvailable?: boolean;
  multiAvailable?: boolean;
  categories?: Record<string, boolean>;
  visibility?: 'public' | 'draft';
  al_id?: string | number;
  mal_id?: string | number;
}

export interface Episode {
  id: string;
  number: number;
  title?: string;
  filler?: boolean;
}

export interface WatchProgress {
  animeId: string;
  animeTitle: string;
  animePoster: string;
  episode: number;
  server: string;
  audio: string;
  time: number;
  duration: number;
  updatedAt: number;
}

export interface Reply {
  id: string;
  commentId: string;
  username: string;
  email: string;
  avatar: string;
  body: string;
  timestamp: number;
  likes: number;
  likedBy: string[];
}

export interface Comment {
  id: string;
  animeId: string;
  episodeNumber?: number;
  username: string;
  email: string;
  avatar: string;
  body: string;
  timestamp: number;
  likes: number;
  likedBy: string[];
  pinned: boolean;
  reported: boolean;
  replies: Reply[];
}

export type StorageProviderType = 'cloudinary' | 'cloudflare_r2' | 'bunny' | 'aws_s3' | 'backblaze_b2' | 'imagekit';

export interface StorageProviderConfig {
  id: string;
  name: string;
  provider: StorageProviderType;
  cloudName?: string; // For Cloudinary
  apiKey?: string;     // For Cloudinary/S3
  apiSecret?: string;  // For Cloudinary/S3
  folder?: string;     // Cloudinary/R2/S3 folder path
  defaultFolder?: string; // Default upload folder
  status: 'enabled' | 'disabled';
  priority: number;
  notes?: string;
  createdAt: number;
  
  // Analytics/status tracked dynamically
  totalUploads?: number;
  successCount?: number;
  successRate?: number;
  lastUploadTime?: number;
  health?: string;
}

export interface UploadHistoryItem {
  id: string;
  animeTitle?: string;
  episodeNumber?: string | number;
  fileType: string; // e.g. 'poster', 'banner', 'video-sub', etc.
  fileName: string;
  url: string;
  storageId: string;
  storageName: string;
  provider: StorageProviderType;
  uploadedAt: number;
  uploader: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

