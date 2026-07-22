// @ts-nocheck
import { ref, get, update, push, set } from 'firebase/database';
import { db } from './firebase';
import { StorageProviderConfig, UploadHistoryItem, StorageProviderType } from '../types';

// Helper to calculate SHA-1 client-side using browser SubtleCrypto
async function sha1(str: string): Promise<string> {
  const buffer = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-1", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// -------------------------------------------------------------
// CACHING AND OPTIMIZATION HELPERS
// -------------------------------------------------------------
const signatureCache = new Map<string, string>();
async function cachedSha1(str: string): Promise<string> {
  if (signatureCache.has(str)) {
    return signatureCache.get(str)!;
  }
  const result = await sha1(str);
  signatureCache.set(str, result);
  return result;
}

// Client-Side Image Optimizer: Convert to WebP, Strip EXIF Metadata, Resize if larger than configured limit
async function optimizeImage(file: File): Promise<Blob | File> {
  if (typeof window === 'undefined' || !window.HTMLCanvasElement) {
    return file;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      
      const MAX_WIDTH = 1200; // Configured resizing limit
      const MAX_HEIGHT = 1200;
      let width = img.width;
      let height = img.height;
      
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        if (width > height) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        } else {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Render to canvas to automatically strip EXIF metadata
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const optimizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                type: 'image/webp',
                lastModified: Date.now()
              });
              resolve(optimizedFile);
            } else {
              resolve(file);
            }
          },
          'image/webp',
          0.82 // 0.82 delivers supreme visual quality with massive file size reduction
        );
      } else {
        resolve(file);
      }
    };
    img.onerror = () => {
      resolve(file);
    };
  });
}

// Helper to upload a single chunk using XMLHttpRequest (allows real-time progress events)
function uploadSingleChunk(
  file: File,
  start: number,
  end: number,
  uniqueId: string,
  signature: string,
  timestamp: string,
  folder: string,
  apiKey: string,
  cloudName: string,
  resourceType: "image" | "video",
  onProgress: (bytesLoadedInChunk: number) => void,
  signal?: AbortSignal
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const chunkBlob = file.slice(start, end);
    const formData = new FormData();
    formData.append("file", chunkBlob);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("folder", folder);

    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

    xhr.open("POST", url, true);
    
    const contentRange = `bytes ${start}-${end - 1}/${file.size}`;
    xhr.setRequestHeader("Content-Range", contentRange);
    xhr.setRequestHeader("X-Unique-Upload-Id", uniqueId);

    // Set connection header optimization if supported, though browser manages keep-alive automatically
    try {
      xhr.setRequestHeader("Connection", "keep-alive");
    } catch (_) {}

    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded);
        }
      };
    }

    let abortHandler: (() => void) | null = null;
    if (signal) {
      abortHandler = () => {
        xhr.abort();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", abortHandler);
    }

    xhr.onload = () => {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(new Error("Failed to parse chunk response JSON"));
        }
      } else {
        reject(new Error(`Chunk upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
      reject(new Error("Network error during chunk upload"));
    };

    xhr.send(formData);
  });
}

// Cloudinary Chunked Upload API for large files (specifically videos > 5MB)
async function uploadToCloudinaryChunked(
  file: File,
  config: StorageProviderConfig,
  resourceType: "image" | "video",
  onProgress?: (percent: number, details?: { speed?: string; sizeInfo?: string; eta?: string; processing?: boolean }) => void,
  signal?: AbortSignal
): Promise<string> {
  const fileSize = file.size;
  const uniqueId = 'chunk_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = config.folder || config.defaultFolder || "anova_anime";
  const apiSecret = config.apiSecret;
  const apiKey = config.apiKey;
  const cloudName = config.cloudName;

  if (!apiSecret || !apiKey || !cloudName) {
    throw new Error("Missing Cloudinary configuration parameters.");
  }

  const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = await cachedSha1(signatureString);

  // Formatting helpers
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const totalSizeFormatted = formatBytes(fileSize);

  // Progress monitoring
  let maxPercent = 0;
  let lastProgressTime = 0;
  const startTime = performance.now();

  const throttleProgress = (percent: number, details?: any) => {
    const now = performance.now();
    if (percent === 100 || now - lastProgressTime >= 100 || (details && details.processing)) {
      lastProgressTime = now;
      if (onProgress) {
        onProgress(percent, details);
      }
    }
  };

  // We start with a 50MB chunk size as specified by user requirements
  let currentChunkSize = 50 * 1024 * 1024; 
  
  let currentOffset = 0;
  let secureUrl = "";

  while (currentOffset < fileSize) {
    if (signal && signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const start = currentOffset;
    const chunkLength = Math.min(currentChunkSize, fileSize - start);
    const end = start + chunkLength;

    let attempt = 0;
    const maxAttempts = 5; // Automatic retry of failed uploads
    let success = false;
    const chunkStartTime = performance.now();

    while (attempt < maxAttempts && !success) {
      if (signal && signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      try {
        if (attempt > 0) {
          // Exponential backoff
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 400));
        }

        const response = await uploadSingleChunk(
          file,
          start,
          end,
          uniqueId,
          signature,
          timestamp,
          folder,
          apiKey,
          cloudName,
          resourceType,
          (bytesLoadedInChunk) => {
            const totalUploaded = start + bytesLoadedInChunk;
            const elapsedTotalSeconds = (performance.now() - startTime) / 1000;
            const speedBytesPerSec = elapsedTotalSeconds > 0 ? (totalUploaded / elapsedTotalSeconds) : 0;
            const speedMBs = (speedBytesPerSec / (1024 * 1024)).toFixed(1);
            const remainingBytes = fileSize - totalUploaded;
            const etaSec = speedBytesPerSec > 0 ? Math.round(remainingBytes / speedBytesPerSec) : 0;
            const sizeInfo = `${formatBytes(totalUploaded)} / ${totalSizeFormatted}`;

            const overallPercent = Math.min(Math.round((totalUploaded / fileSize) * 100), 99);
            maxPercent = Math.max(maxPercent, overallPercent);

            const details = {
              speed: speedBytesPerSec > 0 ? `${speedMBs} MB/s` : 'Calculating...',
              sizeInfo,
              eta: etaSec > 0 ? (etaSec < 60 ? `${etaSec}s` : `${Math.floor(etaSec / 60)}m ${etaSec % 60}s`) : 'Calculating...',
              processing: false
            };

            throttleProgress(maxPercent, details);
          },
          signal
        );

        success = true;
        currentOffset = end;

        // On chunk success, report 100% of this chunk is completed
        const elapsedTotalSeconds = (performance.now() - startTime) / 1000;
        const speedBytesPerSec = elapsedTotalSeconds > 0 ? (currentOffset / elapsedTotalSeconds) : 0;
        const speedMBs = (speedBytesPerSec / (1024 * 1024)).toFixed(1);
        const sizeInfo = `${formatBytes(currentOffset)} / ${totalSizeFormatted}`;
        const overallPercent = Math.min(Math.round((currentOffset / fileSize) * 100), 99);
        maxPercent = Math.max(maxPercent, overallPercent);

        const details = {
          speed: speedBytesPerSec > 0 ? `${speedMBs} MB/s` : 'Calculating...',
          sizeInfo,
          eta: currentOffset >= fileSize ? '0s' : 'Calculating...',
          processing: currentOffset >= fileSize
        };

        throttleProgress(maxPercent, details);

        if (response && response.secure_url) {
          secureUrl = response.secure_url;
        }

        // Measure speed to optimize next chunks dynamically
        const chunkDuration = (performance.now() - chunkStartTime) / 1000; // seconds
        if (chunkDuration > 0) {
          const bytesPerSecond = chunkLength / chunkDuration;
          // Aim for 4-second chunk durations for maximum network window efficiency
          const idealSize = bytesPerSecond * 4;
          // Bound chunk sizes between 10MB and 50MB
          const targetSize = Math.max(10 * 1024 * 1024, Math.min(50 * 1024 * 1024, idealSize));
          // Apply smoothing for stable sizing
          currentChunkSize = Math.round(currentChunkSize * 0.4 + targetSize * 0.6);
        }

      } catch (err) {
        attempt++;
        if (attempt >= maxAttempts) {
          throw err;
        }
      }
    }
  }

  if (!secureUrl) {
    throw new Error("All chunks uploaded successfully but Cloudinary secure_url was not returned.");
  }

  // Signal that upload is fully finished (100% and processing)
  throttleProgress(100, {
    speed: '0 MB/s',
    sizeInfo: `${totalSizeFormatted} / ${totalSizeFormatted}`,
    eta: '0s',
    processing: true
  });

  // Pre-warm video poster frame in browser cache asynchronously
  try {
    const posterUrl = secureUrl.replace(/\.[^/.]+$/, ".jpg");
    const img = new Image();
    img.src = posterUrl;
  } catch (_) {}

  return secureUrl;
}

// -------------------------------------------------------------
// MODULAR PROVIDER ADAPTER INTERFACE
// -------------------------------------------------------------
export interface StorageProviderAdapter {
  upload(
    fileOrUrl: File | string,
    resourceType: "image" | "video",
    config: StorageProviderConfig,
    onProgress?: (percent: number) => void,
    metadata?: { animeTitle?: string; episodeNumber?: string | number; fileType?: string }
  ): Promise<string>;

  delete(
    publicId: string,
    resourceType: "image" | "video",
    config: StorageProviderConfig
  ): Promise<boolean>;

  replace(
    oldPublicId: string,
    oldResourceType: "image" | "video",
    newFileOrUrl: File | string,
    newResourceType: "image" | "video",
    config: StorageProviderConfig,
    onProgress?: (percent: number) => void,
    metadata?: { animeTitle?: string; episodeNumber?: string | number; fileType?: string }
  ): Promise<string>;

  getUrl(
    publicId: string,
    config: StorageProviderConfig,
    options?: { quality?: string; format?: string; width?: number; height?: number }
  ): string;

  healthCheck(
    config: StorageProviderConfig
  ): Promise<{ success: boolean; message: string; responseTime?: number }>;

  testConnection(
    config: StorageProviderConfig
  ): Promise<{ success: boolean; message: string; errorType?: 'auth' | 'apiKey' | 'folder' | 'network' }>;
}

// -------------------------------------------------------------
// CLOUDINARY MODULAR ADAPTER IMPLEMENTATION
// -------------------------------------------------------------
export const CloudinaryAdapter: StorageProviderAdapter = {
  async upload(fileOrUrl, resourceType, config, onProgress, metadata) {
    return uploadToCloudinaryWithConfig(fileOrUrl, config, resourceType, onProgress);
  },

  async delete(publicId, resourceType, config) {
    return new Promise(async (resolve, reject) => {
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const apiSecret = config.apiSecret;
        const apiKey = config.apiKey;
        const cloudName = config.cloudName;

        if (!apiSecret || !apiKey || !cloudName) {
          throw new Error("Missing Cloudinary configuration parameters.");
        }

        // Destroy signature order: public_id, timestamp, and api_secret
        const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
        const signature = await sha1(signatureString);

        const formData = new FormData();
        formData.append("public_id", publicId);
        formData.append("api_key", apiKey);
        formData.append("timestamp", timestamp);
        formData.append("signature", signature);

        const xhr = new XMLHttpRequest();
        const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;

        xhr.open("POST", url, true);

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.result === "ok" || response.result === "not found") {
                resolve(true);
              } else {
                reject(new Error(`Cloudinary destroy result: ${response.result}`));
              }
            } catch (e) {
              reject(new Error("Failed to parse Cloudinary response"));
            }
          } else {
            reject(new Error(`Cloudinary destroy error: ${xhr.statusText} (${xhr.status})`));
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error during Cloudinary destroy"));
        };

        xhr.send(formData);
      } catch (error) {
        reject(error);
      }
    });
  },

  async replace(oldPublicId, oldResourceType, newFileOrUrl, newResourceType, config, onProgress, metadata) {
    try {
      await this.delete(oldPublicId, oldResourceType, config);
    } catch (err) {
      console.warn("Failed to delete old asset during replace, proceeding with upload:", err);
    }
    return this.upload(newFileOrUrl, newResourceType, config, onProgress, metadata);
  },

  getUrl(publicId, config, options) {
    const cloudName = config.cloudName || "nvnjwvgz";
    // Image Optimization: Auto format, Auto Quality, Progressive Images, WebP, AVIF, Responsive Sizes
    let transformations = "f_auto,q_auto,fl_progressive";
    if (options) {
      if (options.format) transformations = `f_${options.format},q_auto,fl_progressive`;
      if (options.width) transformations += `,w_${options.width},c_scale`;
    }
    return `https://res.cloudinary.com/${cloudName}/image/upload/${transformations}/${publicId}`;
  },

  async healthCheck(config) {
    const start = Date.now();
    try {
      const result = await this.testConnection(config);
      const responseTime = Date.now() - start;
      return { 
        success: result.success, 
        message: result.message, 
        responseTime 
      };
    } catch (err: any) {
      return { 
        success: false, 
        message: err.message || "Failed health check", 
        responseTime: Date.now() - start 
      };
    }
  },

  async testConnection(config) {
    return testConnectionWithConfig(config);
  }
};

// -------------------------------------------------------------
// ADAPTER REGISTRY / LOOKUP
// -------------------------------------------------------------
export function getAdapter(provider: StorageProviderType): StorageProviderAdapter {
  switch (provider) {
    case 'cloudinary':
      return CloudinaryAdapter;
    // Prepared Future adapters (stubbed out nicely)
    case 'cloudflare_r2':
    case 'bunny':
    case 'aws_s3':
    case 'backblaze_b2':
    case 'imagekit':
    default:
      return {
        async upload() { throw new Error(`Provider adapter "${provider}" is not fully implemented yet.`); },
        async delete() { throw new Error(`Provider adapter "${provider}" is not fully implemented yet.`); },
        async replace() { throw new Error(`Provider adapter "${provider}" is not fully implemented yet.`); },
        getUrl(p) { return p; },
        async healthCheck() { return { success: false, message: "Not Implemented" }; },
        async testConnection() { return { success: false, message: "Not Implemented", errorType: "network" }; }
      };
  }
}

// -------------------------------------------------------------
// CLOUDINARY URL PARSER
// -------------------------------------------------------------
export function parseCloudinaryUrl(url: string): { cloudName: string; resourceType: "image" | "video"; publicId: string } | null {
  try {
    if (!url || !url.includes("cloudinary.com")) return null;
    
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    
    const cloudName = pathParts[1];
    const resourceType = pathParts[2] === "video" ? "video" : "image";
    
    const uploadIndex = pathParts.indexOf("upload");
    if (uploadIndex === -1) return null;
    
    let publicIdParts = pathParts.slice(uploadIndex + 1);
    // If next part starts with v followed by numbers (e.g., v1700000000), skip it
    if (publicIdParts[0] && /^v\d+$/.test(publicIdParts[0])) {
      publicIdParts = publicIdParts.slice(1);
    }
    
    const fullFilename = publicIdParts.join('/');
    const dotIndex = fullFilename.lastIndexOf('.');
    const publicId = dotIndex !== -1 ? fullFilename.substring(0, dotIndex) : fullFilename;
    
    return { cloudName, resourceType, publicId };
  } catch (e) {
    console.error("Error parsing Cloudinary URL:", e);
    return null;
  }
}

// -------------------------------------------------------------
// DELETE ASSET BY URL (Global Utility)
// -------------------------------------------------------------
export async function deleteAssetByUrl(url: string): Promise<boolean> {
  const parsed = parseCloudinaryUrl(url);
  if (!parsed) return false;

  const { cloudName, resourceType, publicId } = parsed;

  // Find corresponding storage config from Firebase Realtime DB
  const configsRef = ref(db, 'storage_configs');
  const snap = await get(configsRef);
  let config: StorageProviderConfig | null = null;

  if (snap.exists()) {
    const allConfigs = Object.values(snap.val()) as StorageProviderConfig[];
    config = allConfigs.find(c => c.cloudName === cloudName) || null;
  }

  // Fallback to the default credential if matching the default cloud name
  const defaultCloudName = "nvnjwvgz";
  if (!config && cloudName === defaultCloudName) {
    config = {
      id: 'default-cloudinary',
      name: 'Default Cloudinary',
      provider: 'cloudinary',
      cloudName: "nvnjwvgz",
      apiKey: "295574776626778",
      apiSecret: "rFN2kIFbC3RDbR_FCh84P7s_9KA",
      folder: "anova_anime",
      defaultFolder: "anova_anime",
      status: 'enabled',
      priority: 1,
      createdAt: Date.now()
    };
  }

  if (!config) {
    console.warn(`Could not find custom storage config for Cloud Name: ${cloudName}. Asset could not be removed from provider.`);
    return false;
  }

  try {
    const adapter = getAdapter(config.provider);
    return await adapter.delete(publicId, resourceType, config);
  } catch (err) {
    console.error("Failed to delete asset from provider:", err);
    return false;
  }
}

// -------------------------------------------------------------
// Cloudinary Client-Side Direct Signed Upload Service
// -------------------------------------------------------------
export async function uploadToCloudinaryWithConfig(
  fileOrUrl: File | string,
  config: StorageProviderConfig,
  resourceType: "image" | "video" = "image",
  onProgress?: (percent: number, details?: { speed?: string; sizeInfo?: string; eta?: string; processing?: boolean }) => void,
  signal?: AbortSignal
): Promise<string> {
  let finalFileOrUrl: Blob | File | string = fileOrUrl;

  // 1. Optimize image files on-the-fly (Convert to WebP, Strip metadata, resize if larger than 1200px)
  if (resourceType === 'image' && fileOrUrl instanceof File) {
    try {
      finalFileOrUrl = await optimizeImage(fileOrUrl);
    } catch (e) {
      console.warn("Client-side image optimization failed, uploading original:", e);
    }
  }

  // 2. High-speed chunked upload for videos over 5MB
  if (resourceType === 'video' && fileOrUrl instanceof File && fileOrUrl.size > 5 * 1024 * 1024) {
    return uploadToCloudinaryChunked(fileOrUrl, config, resourceType, onProgress, signal);
  }

  // 3. Single-request upload for small files or remote URLs
  return new Promise(async (resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder = config.folder || config.defaultFolder || "anova_anime";
      const apiSecret = config.apiSecret;
      const apiKey = config.apiKey;
      const cloudName = config.cloudName;

      if (!apiSecret || !apiKey || !cloudName) {
        throw new Error("Missing Cloudinary configuration parameters.");
      }

      // signature sorting: folder, timestamp, apiSecret
      const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      const signature = await cachedSha1(signatureString);

      const formData = new FormData();
      formData.append("file", finalFileOrUrl);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);
      formData.append("folder", folder);

      const xhr = new XMLHttpRequest();
      const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

      xhr.open("POST", url, true);

      const fileSize = finalFileOrUrl instanceof Blob ? finalFileOrUrl.size : (fileOrUrl instanceof File ? fileOrUrl.size : 0);
      const formatBytes = (bytes: number): string => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
      };
      const totalSizeFormatted = fileSize ? formatBytes(fileSize) : '';
      const startTime = performance.now();

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.min(Math.round((event.loaded / event.total) * 100), 99);
            const elapsed = (performance.now() - startTime) / 1000;
            const speed = elapsed > 0 ? (event.loaded / elapsed) : 0;
            const speedMBs = (speed / (1024 * 1024)).toFixed(1);
            const sizeInfo = fileSize ? `${formatBytes(event.loaded)} / ${totalSizeFormatted}` : '';
            const remaining = event.total - event.loaded;
            const eta = speed > 0 ? Math.round(remaining / speed) : 0;

            onProgress(percent, {
              speed: speed > 0 ? `${speedMBs} MB/s` : 'Calculating...',
              sizeInfo,
              eta: eta > 0 ? (eta < 60 ? `${eta}s` : `${Math.floor(eta / 60)}m ${eta % 60}s`) : 'Calculating...',
              processing: percent >= 99
            });
          }
        };
      }

      let abortHandler: (() => void) | null = null;
      if (signal) {
        abortHandler = () => {
          xhr.abort();
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", abortHandler);
      }

      xhr.onload = () => {
        if (signal && abortHandler) {
          signal.removeEventListener("abort", abortHandler);
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.secure_url) {
              const secureUrl = response.secure_url;
              
              if (onProgress) {
                onProgress(100, {
                  speed: '0 MB/s',
                  sizeInfo: fileSize ? `${totalSizeFormatted} / ${totalSizeFormatted}` : '',
                  eta: '0s',
                  processing: true
                });
              }

              // Asynchronously pre-warm poster frame cache for videos without blocking main thread
              if (resourceType === 'video') {
                try {
                  const posterUrl = secureUrl.replace(/\.[^/.]+$/, ".jpg");
                  const img = new Image();
                  img.src = posterUrl;
                } catch (_) {}
              }

              resolve(secureUrl);
            } else {
              reject(new Error("Cloudinary upload did not return secure_url"));
            }
          } catch (e) {
            reject(new Error("Failed to parse Cloudinary response"));
          }
        } else {
          reject(new Error(`Cloudinary error: ${xhr.statusText} (${xhr.status}) - ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => {
        if (signal && abortHandler) {
          signal.removeEventListener("abort", abortHandler);
        }
        reject(new Error("Network error during Cloudinary upload"));
      };

      xhr.send(formData);
    } catch (error) {
      reject(error);
    }
  });
}

// -------------------------------------------------------------
// Test Connection for Cloudinary
// -------------------------------------------------------------
export async function testConnectionWithConfig(config: StorageProviderConfig): Promise<{ success: boolean; message: string; errorType?: 'auth' | 'apiKey' | 'folder' | 'network' }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = config.folder || config.defaultFolder || "anova_anime";
    const apiSecret = config.apiSecret;
    const apiKey = config.apiKey;
    const cloudName = config.cloudName;

    if (!apiSecret || !apiKey || !cloudName) {
      return { success: false, message: "Invalid API Key/Secret/Cloud Name", errorType: 'apiKey' };
    }

    const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = await sha1(signatureString);

    const dummyFile = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    const formData = new FormData();
    formData.append("file", dummyFile);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("folder", folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const statsRef = ref(db, `storage_configs/${config.id}`);
      await update(statsRef, { health: "Connected" });
      return { success: true, message: "Connected" };
    } else {
      const errText = await response.text();
      let errorType: 'auth' | 'apiKey' | 'folder' | 'network' = 'network';
      let message = "Authentication Failed";
      
      if (errText.includes("Invalid API key") || errText.includes("api_key")) {
        errorType = 'apiKey';
        message = "Invalid API Key";
      } else if (errText.includes("signature") || errText.includes("Signature") || errText.includes("credentials") || errText.includes("api_secret")) {
        errorType = 'auth';
        message = "Authentication Failed";
      } else if (errText.includes("folder") || errText.includes("Folder") || errText.includes("not found")) {
        errorType = 'folder';
        message = "Folder Missing";
      } else if (errText.includes("Permission denied") || errText.includes("permission")) {
        errorType = 'auth';
        message = "Permission Denied";
      }
      
      const statsRef = ref(db, `storage_configs/${config.id}`);
      await update(statsRef, { health: message });
      return { success: false, message, errorType };
    }
  } catch (err) {
    return { success: false, message: "Network Error", errorType: 'network' };
  }
}

// -------------------------------------------------------------
// CONFIGURATION CACHE (SAVES DATABASE READS)
// -------------------------------------------------------------
let cachedConfigsSnap: any = null;
let cachedSettingsSnap: any = null;
let cacheTimestamp = 0;
const RTDB_CACHE_TTL = 30000; // 30 seconds local in-memory cache

async function getStorageConfigsAndSettings() {
  const now = Date.now();
  if (cachedConfigsSnap && cachedSettingsSnap && (now - cacheTimestamp < RTDB_CACHE_TTL)) {
    return { configs: cachedConfigsSnap, settings: cachedSettingsSnap };
  }
  
  const configsRef = ref(db, 'storage_configs');
  const settingsRef = ref(db, 'storage_settings');
  const [configsSnap, settingsSnap] = await Promise.all([
    get(configsRef),
    get(settingsRef)
  ]);
  
  cachedConfigsSnap = configsSnap;
  cachedSettingsSnap = settingsSnap;
  cacheTimestamp = now;
  return { configs: configsSnap, settings: settingsSnap };
}

// Helper delay for exponential backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// -------------------------------------------------------------
// History Logging & Stats Tracking (Optimized with Batch Writes & Local Reads)
// -------------------------------------------------------------
export async function logUploadToHistory(
  fileName: string,
  fileType: string,
  url: string,
  storageId: string,
  storageName: string,
  provider: string,
  uploader: string,
  status: 'success' | 'failed',
  errorMessage?: string,
  animeTitle?: string,
  episodeNumber?: string | number
) {
  try {
    const historyRef = push(ref(db, 'upload_history'));
    const item: UploadHistoryItem = {
      id: historyRef.key || `hist-${Date.now()}`,
      fileName,
      fileType,
      url,
      storageId,
      storageName,
      provider: provider as any,
      uploadedAt: Date.now(),
      uploader: uploader || 'System',
      status,
      errorMessage: errorMessage || '',
      animeTitle: animeTitle || '',
      episodeNumber: episodeNumber || ''
    };
    
    // Look up existing config stats from local cache or DB to determine updated metrics
    let currentUploads = 1;
    let currentSuccess = status === 'success' ? 1 : 0;
    
    if (cachedConfigsSnap && cachedConfigsSnap.exists()) {
      const configsMap = cachedConfigsSnap.val();
      if (configsMap && configsMap[storageId]) {
        const data = configsMap[storageId];
        currentUploads = Number(data.totalUploads || 0) + 1;
        currentSuccess = Number(data.successCount || 0) + (status === 'success' ? 1 : 0);
      }
    } else {
      const statsRef = ref(db, `storage_configs/${storageId}`);
      const snap = await get(statsRef);
      if (snap.exists()) {
        const data = snap.val();
        currentUploads = Number(data.totalUploads || 0) + 1;
        currentSuccess = Number(data.successCount || 0) + (status === 'success' ? 1 : 0);
      }
    }
    const successRate = Math.round((currentSuccess / currentUploads) * 100);

    // BATCH ATOMIC WRITES: Perform multiple path updates in a single network roundtrip!
    const updates: Record<string, any> = {};
    updates[`upload_history/${historyRef.key}`] = item;
    updates[`storage_configs/${storageId}/totalUploads`] = currentUploads;
    updates[`storage_configs/${storageId}/successCount`] = currentSuccess;
    updates[`storage_configs/${storageId}/successRate`] = successRate;
    updates[`storage_configs/${storageId}/lastUploadTime`] = Date.now();
    updates[`storage_configs/${storageId}/health`] = status === 'success' ? 'Connected' : 'Authentication Failed';

    await update(ref(db), updates);
  } catch (err) {
    console.error("Failed to log upload history atomically:", err);
  }
}

// Calculate simple health score for Smart Storage Mode
function getHealthScore(config: StorageProviderConfig): number {
  if (config.status === 'disabled') return -9999;
  if (config.health && ['Authentication Failed', 'Invalid API Key', 'Folder Missing', 'Permission Denied', 'Offline'].includes(config.health)) {
    return -5000;
  }
  const successRate = config.successRate !== undefined ? config.successRate : 100;
  // Higher priority number = lower priority (1 is highest)
  const priorityPenalty = (config.priority || 1) * 2;
  return successRate - priorityPenalty;
}

// Request Deduplicator: Prevents duplicate upload requests for the same file/asset
const ongoingUploads = new Map<string, Promise<string>>();

// -------------------------------------------------------------
// Dynamic Upload with Failover & Rotation & Retry (High-Performance Entry Point)
// -------------------------------------------------------------
export async function dynamicUpload(
  fileOrUrl: File | string,
  resourceType: "image" | "video" = "image",
  onProgress?: (percent: number, details?: { speed?: string; sizeInfo?: string; eta?: string; processing?: boolean }) => void,
  metadata?: { animeTitle?: string; episodeNumber?: string | number; fileType?: string },
  signal?: AbortSignal
): Promise<string> {
  // Generate a fingerprinted key based on file name, size, and resource type
  const fingerprint = fileOrUrl instanceof File 
    ? `file_${fileOrUrl.name}_${fileOrUrl.size}_${resourceType}`
    : `url_${fileOrUrl}_${resourceType}`;

  if (ongoingUploads.has(fingerprint)) {
    console.info(`Request deduplication triggered for: ${fingerprint}. Reusing current upload pipeline.`);
    if (onProgress) onProgress(100);
    return ongoingUploads.get(fingerprint)!;
  }

  const uploadPromise = (async () => {
    try {
      return await executeDynamicUpload(fileOrUrl, resourceType, onProgress, metadata, signal);
    } finally {
      ongoingUploads.delete(fingerprint);
    }
  })();

  ongoingUploads.set(fingerprint, uploadPromise);
  return uploadPromise;
}

// Core Dynamic Upload Pipeline
async function executeDynamicUpload(
  fileOrUrl: File | string,
  resourceType: "image" | "video",
  onProgress?: (percent: number, details?: { speed?: string; sizeInfo?: string; eta?: string; processing?: boolean }) => void,
  metadata?: { animeTitle?: string; episodeNumber?: string | number; fileType?: string },
  signal?: AbortSignal
): Promise<string> {
  const fileName = fileOrUrl instanceof File ? fileOrUrl.name : 'pasted-url';
  const fileType = metadata?.fileType || (resourceType === 'video' ? 'video' : 'image');
  const uploader = localStorage.getItem('userEmail') || 'System';

  // 1. Fetch configs and settings (Optimized with high-speed local caching)
  const { configs: configsSnap, settings: settingsSnap } = await getStorageConfigsAndSettings();

  const defaultFallbackConfig: StorageProviderConfig = {
    id: 'default-cloudinary',
    name: 'Default Fallback Cloudinary',
    provider: 'cloudinary',
    cloudName: "nvnjwvgz",
    apiKey: "295574776626778",
    apiSecret: "rFN2kIFbC3RDbR_FCh84P7s_9KA",
    folder: "anova_anime",
    defaultFolder: "anova_anime",
    status: 'enabled',
    priority: 1,
    createdAt: Date.now()
  };

  const settings = settingsSnap.exists() ? settingsSnap.val() : { defaultStorageId: '', autoRotate: false, smartMode: false };
  
  let candidateConfigs: StorageProviderConfig[] = [];

  if (configsSnap.exists()) {
    const allConfigs = Object.values(configsSnap.val()) as StorageProviderConfig[];
    candidateConfigs = allConfigs.filter(c => c.status === 'enabled');
  }

  // Fallback if none enabled
  if (candidateConfigs.length === 0) {
    candidateConfigs = [defaultFallbackConfig];
  } else {
    // If Smart Storage Mode is enabled, sort candidates based on their dynamic health score
    if (settings.smartMode) {
      candidateConfigs.sort((a, b) => getHealthScore(b) - getHealthScore(a));
    } else {
      // Otherwise sort by priority ascending (1 is highest)
      candidateConfigs.sort((a, b) => a.priority - b.priority);
      
      // If there is an active/primary storage ID, bubble it to the front
      const defaultIndex = candidateConfigs.findIndex(c => c.id === settings.defaultStorageId);
      if (defaultIndex > 0) {
        const [defaultConfig] = candidateConfigs.splice(defaultIndex, 1);
        candidateConfigs.unshift(defaultConfig);
      }
    }
  }

  let lastError: Error | null = null;

  // Try candidates in sorted order with auto failover
  for (let i = 0; i < candidateConfigs.length; i++) {
    const config = candidateConfigs[i];
    
    // Auto Rotate switches instantly to next storage without waiting or retrying the same config
    const maxAttempts = settings.autoRotate ? 1 : 2;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let secureUrl = '';
        if (config.provider === 'cloudinary') {
          secureUrl = await uploadToCloudinaryWithConfig(fileOrUrl, config, resourceType, onProgress, signal);
        } else {
          throw new Error(`Provider adapter "${config.provider}" is not implemented yet.`);
        }

        // Background logging to database prevents blocking of the returned secureUrl!
        logUploadToHistory(
          fileName,
          fileType,
          secureUrl,
          config.id,
          config.name,
          config.provider,
          uploader,
          'success',
          undefined,
          metadata?.animeTitle,
          metadata?.episodeNumber
        ).catch(err => console.error("Background logging failed:", err));

        // Auto Rotate Storage after successful upload if enabled
        if (settings.autoRotate && settings.defaultStorageId === config.id && candidateConfigs.length > 1) {
          const nextConfig = candidateConfigs[(i + 1) % candidateConfigs.length];
          update(ref(db, 'storage_settings'), { defaultStorageId: nextConfig.id }).catch(() => {});
        }

        return secureUrl;
      } catch (err: any) {
        console.warn(`Upload attempt ${attempt}/${maxAttempts} failed on "${config.name}". Error:`, err);
        lastError = err;
        
        // If Auto Rotate is enabled and upload fails, instantly update settings to the next storage config
        if (settings.autoRotate && candidateConfigs.length > 1) {
          const nextConfig = candidateConfigs[(i + 1) % candidateConfigs.length];
          update(ref(db, 'storage_settings'), { defaultStorageId: nextConfig.id }).catch(() => {});
        }

        // If it's the final attempt on this config, log failure in history and fall over
        if (attempt === maxAttempts) {
          logUploadToHistory(
            fileName,
            fileType,
            '',
            config.id,
            config.name,
            config.provider,
            uploader,
            'failed',
            err.message || String(err),
            metadata?.animeTitle,
            metadata?.episodeNumber
          ).catch(e => console.error("Background failure logging failed:", e));
        } else {
          // Retry failed uploads automatically with exponential backoff if not in Auto Rotate mode
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
          await delay(waitTime);
        }
      }
    }
  }

  throw lastError || new Error("All storage provider candidates failed to upload.");
}
