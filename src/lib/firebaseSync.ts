// @ts-nocheck
import { 
  ref, 
  set, 
  push, 
  onValue, 
  update, 
  remove, 
  get, 
  serverTimestamp 
} from "firebase/database";
import { db } from "./firebase";
import { Comment, Reply, WatchProgress, Anime } from "../types";

// Helper to sanitize emails for Firebase RTDB paths
export function sanitizeEmail(email: string): string {
  if (!email) return 'guest';
  return email.toLowerCase().replace(/\./g, '_dot_').replace(/@/g, '_at_');
}

// Generate a random session ID
export const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// ==========================================
// DUAL-MODE TIMEOUT & LOCAL STORAGE CACHE ENGINE
// ==========================================
const DB_TIMEOUT_MS = 1200;

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[Firebase Sync Cache] Operation timed out after ${timeoutMs}ms. Swapping seamlessly to local engine.`);
      resolve(fallbackValue);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      promise.then((res) => {
        clearTimeout(timeoutId);
        return res;
      }),
      timeoutPromise
    ]);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[Firebase Sync Error] Operation failed. Using local engine fallback:", err);
    return fallbackValue;
  }
}

export function cleanForFirebase<T>(val: T): T {
  if (val === undefined) return null as unknown as T;
  if (val === null || typeof val !== 'object') return val;
  try {
    return JSON.parse(JSON.stringify(val));
  } catch (_) {
    return val;
  }
}

// Local storage helper
function getLocalItem<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (_) {
    return fallback;
  }
}

function setLocalItem(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

// ==========================================
// 1. AUTHENTICATION & USER TRACKING
// ==========================================

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  status: 'Premium' | 'VIP';
  commentsCount: number;
  favoritesCount: number;
  lastLoginAt: number;
  createdAt: number;
}

export async function trackUserLogin(email: string) {
  const sanitized = sanitizeEmail(email);
  const userRef = ref(db, `users/${sanitized}`);
  const now = Date.now();
  const username = email.split('@')[0];
  const role = email === 'mdido406@gmail.com' ? 'admin' : 'user';

  const localCacheKey = `user_profile_${sanitized}`;
  const cachedUser = getLocalItem<UserProfile | null>(localCacheKey, null);

  let fallbackUser: UserProfile = cachedUser || {
    uid: sanitized,
    email,
    username,
    role,
    status: role === 'admin' ? 'VIP' : 'Premium',
    commentsCount: 0,
    favoritesCount: 0,
    lastLoginAt: now,
    createdAt: now
  };

  const dbTask = (async () => {
    const snapshot = await get(userRef);
    let userData: UserProfile;

    if (snapshot.exists()) {
      const existing = snapshot.val();
      userData = {
        ...existing,
        role, // Ensure role conforms to rules
        lastLoginAt: now
      };
      await update(userRef, { lastLoginAt: now, role });
    } else {
      userData = {
        uid: sanitized,
        email,
        username,
        role,
        status: role === 'admin' ? 'VIP' : 'Premium',
        commentsCount: 0,
        favoritesCount: 0,
        lastLoginAt: now,
        createdAt: now
      };
      await set(userRef, userData);
    }
    return userData;
  })();

  const finalUser = await runWithTimeout(dbTask, DB_TIMEOUT_MS, fallbackUser);
  setLocalItem(localCacheKey, finalUser);

  // Record login session in /sessions
  const sessionRef = ref(db, `sessions/${sessionId}`);
  runWithTimeout(set(sessionRef, {
    id: sessionId,
    email,
    username,
    role,
    loginTime: now,
    lastHeartbeat: now
  }), DB_TIMEOUT_MS, null);

  return finalUser;
}

// Keep-alive heartbeat for online tracking (active within last 2 minutes)
export async function trackUserHeartbeat(email: string, currentPath: string = '/home') {
  const sanitized = sanitizeEmail(email);
  const now = Date.now();
  
  // Update overall session heartbeat
  const sessionRef = ref(db, `sessions/${sessionId}`);
  runWithTimeout(update(sessionRef, { lastHeartbeat: now }), DB_TIMEOUT_MS, null);

  // Update specific online user entry
  const onlineRef = ref(db, `onlineUsers/${sessionId}`);
  runWithTimeout(set(onlineRef, {
    id: sessionId,
    email,
    username: email ? email.split('@')[0] : 'Guest',
    lastActive: now,
    currentPath
  }), DB_TIMEOUT_MS, null);
}

// Clean up user from online list upon logging out or closing
export async function trackUserLogout() {
  const onlineRef = ref(db, `onlineUsers/${sessionId}`);
  runWithTimeout(remove(onlineRef), DB_TIMEOUT_MS, null);
  const sessionRef = ref(db, `sessions/${sessionId}`);
  runWithTimeout(remove(sessionRef), DB_TIMEOUT_MS, null);
}

// ==========================================
// 2. WATCH EVENTS & HISTORY
// ==========================================

export async function logWatchEvent(
  animeId: string, 
  animeTitle: string, 
  animePoster: string, 
  episode: number, 
  email: string, 
  watchTime: number,
  duration: number
) {
  const viewRef = push(ref(db, 'views'));
  const payload = {
    id: viewRef.key || `mock-view-${Date.now()}`,
    animeId,
    animeTitle,
    animePoster,
    episode,
    userEmail: email || 'guest@anova.xyz',
    timestamp: Date.now(),
    watchTime,
    duration
  };

  runWithTimeout(set(viewRef, payload), DB_TIMEOUT_MS, null);

  // Increment total view counts
  const statRef = ref(db, `statistics/animeViews/${animeId}`);
  const dbTask = (async () => {
    const snap = await get(statRef);
    if (snap.exists()) {
      const data = snap.val();
      await update(statRef, {
        views: (data.views || 0) + 1,
        watchTime: (data.watchTime || 0) + watchTime,
        title: animeTitle,
        poster: animePoster
      });
    } else {
      await set(statRef, {
        animeId,
        title: animeTitle,
        poster: animePoster,
        views: 1,
        watchTime
      });
    }
  })();
  runWithTimeout(dbTask, DB_TIMEOUT_MS, null);
}

export async function saveWatchProgressDb(email: string, progress: WatchProgress) {
  if (!email) return;
  const sanitized = sanitizeEmail(email);
  const progressRef = ref(db, `watchHistory/${sanitized}/${progress.animeId}`);

  // Save locally first
  const cacheKey = `watch_history_${sanitized}`;
  const localHistory = getLocalItem<Record<string, any>>(cacheKey, {});
  localHistory[progress.animeId] = progress;
  setLocalItem(cacheKey, localHistory);

  runWithTimeout(set(progressRef, cleanForFirebase(progress)), DB_TIMEOUT_MS, null);
}

export async function getWatchHistoryDb(email: string): Promise<Record<string, WatchProgress>> {
  if (!email) return {};
  const sanitized = sanitizeEmail(email);
  const historyRef = ref(db, `watchHistory/${sanitized}`);

  const cacheKey = `watch_history_${sanitized}`;
  const localHistory = getLocalItem<Record<string, any>>(cacheKey, {});

  const dbTask = (async () => {
    const snap = await get(historyRef);
    return snap.exists() ? snap.val() : {};
  })();

  const finalHistory = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localHistory);
  if (Object.keys(finalHistory).length > 0) {
    setLocalItem(cacheKey, finalHistory);
  }
  return finalHistory;
}

// ==========================================
// 3. FAVORITES & BOOKMARKS
// ==========================================

export async function saveFavoriteDb(email: string, anime: Anime, isFavorite: boolean) {
  if (!email) return;
  const sanitized = sanitizeEmail(email);
  const favoriteRef = ref(db, `favorites/${sanitized}/${anime.id}`);
  
  // Save locally first
  const cacheKey = `favorites_${sanitized}`;
  let localFavs = getLocalItem<any[]>(cacheKey, []);
  if (isFavorite) {
    if (!localFavs.some(item => String(item.id) === String(anime.id))) {
      localFavs.push(anime);
    }
  } else {
    localFavs = localFavs.filter(item => String(item.id) !== String(anime.id));
  }
  setLocalItem(cacheKey, localFavs);

  const dbTask = (async () => {
    if (isFavorite) {
      await set(favoriteRef, cleanForFirebase(anime));
    } else {
      await remove(favoriteRef);
    }

    // Update favoritesCount on user profile
    const userRef = ref(db, `users/${sanitized}`);
    const userSnap = await get(userRef);
    if (userSnap.exists()) {
      const currentFavsRef = ref(db, `favorites/${sanitized}`);
      const favsSnap = await get(currentFavsRef);
      const count = favsSnap.exists() ? Object.keys(favsSnap.val()).length : 0;
      await update(userRef, { favoritesCount: count });
    }
  })();

  runWithTimeout(dbTask, DB_TIMEOUT_MS, null);
}

export async function getFavoritesDb(email: string): Promise<Anime[]> {
  if (!email) return [];
  const sanitized = sanitizeEmail(email);
  const favoritesRef = ref(db, `favorites/${sanitized}`);

  const cacheKey = `favorites_${sanitized}`;
  const localFavs = getLocalItem<Anime[]>(cacheKey, []);

  const dbTask = (async () => {
    const snap = await get(favoritesRef);
    return snap.exists() ? Object.values(snap.val()) : [];
  })();

  const finalFavs = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localFavs);
  setLocalItem(cacheKey, finalFavs);
  return finalFavs;
}

export async function saveBookmarkDb(email: string, anime: Anime, isBookmarked: boolean) {
  if (!email) return;
  const sanitized = sanitizeEmail(email);
  const bookmarkRef = ref(db, `bookmarks/${sanitized}/${anime.id}`);

  // Save locally first
  const cacheKey = `bookmarks_${sanitized}`;
  let localBookmarks = getLocalItem<any[]>(cacheKey, []);
  if (isBookmarked) {
    if (!localBookmarks.some(item => String(item.id) === String(anime.id))) {
      localBookmarks.push(anime);
    }
  } else {
    localBookmarks = localBookmarks.filter(item => String(item.id) !== String(anime.id));
  }
  setLocalItem(cacheKey, localBookmarks);

  const dbTask = (async () => {
    if (isBookmarked) {
      await set(bookmarkRef, cleanForFirebase(anime));
    } else {
      await remove(bookmarkRef);
    }
  })();

  runWithTimeout(dbTask, DB_TIMEOUT_MS, null);
}

export async function getBookmarksDb(email: string): Promise<Anime[]> {
  if (!email) return [];
  const sanitized = sanitizeEmail(email);
  const bookmarksRef = ref(db, `bookmarks/${sanitized}`);

  const cacheKey = `bookmarks_${sanitized}`;
  const localBookmarks = getLocalItem<Anime[]>(cacheKey, []);

  const dbTask = (async () => {
    const snap = await get(bookmarksRef);
    return snap.exists() ? Object.values(snap.val()) : [];
  })();

  const finalBookmarks = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localBookmarks);
  setLocalItem(cacheKey, finalBookmarks);
  return finalBookmarks;
}

// ==========================================
// 4. DISCUSSION / COMMENTS SYSTEM (REAL-TIME)
// ==========================================

export function syncComments(onUpdate: (comments: Comment[]) => void) {
  const commentsRef = ref(db, 'comments');
  const cacheKey = "anova_comments_cache";
  
  // Instantly yield cached local comments first
  const cachedComments = getLocalItem<Comment[]>(cacheKey, []);
  if (cachedComments.length > 0) {
    onUpdate(cachedComments);
  }

  let completedFirstFetch = false;
  
  // Real-time listener
  const unsub = onValue(commentsRef, (snapshot) => {
    completedFirstFetch = true;
    if (snapshot.exists()) {
      const data = snapshot.val();
      const list: Comment[] = Object.keys(data).map(key => {
        const item = data[key];
        const repliesList: Reply[] = item.replies 
          ? Object.keys(item.replies).map(rKey => item.replies[rKey])
          : [];
        return {
          ...item,
          id: key,
          likedBy: item.likedBy ? Object.values(item.likedBy) : [],
          replies: repliesList.sort((a, b) => a.timestamp - b.timestamp)
        };
      });
      setLocalItem(cacheKey, list);
      onUpdate(list);
    } else {
      onUpdate([]);
    }
  }, (err) => {
    console.warn("[Firebase RTDB Sync] Failed to bind comments live listener:", err);
    // Silent fallback: trigger using cache to keep things running
    onUpdate(cachedComments);
  });

  // Safe timeout to cancel pending initial connection block if firebase takes too long
  setTimeout(() => {
    if (!completedFirstFetch) {
      console.log("[Firebase syncComments] Timeout reached. Confirming local comments cache as primary driver.");
      onUpdate(cachedComments);
    }
  }, 1000);

  return unsub;
}

export async function addCommentDb(
  animeId: string, 
  episodeNumber: number | undefined, 
  username: string, 
  email: string, 
  avatar: string, 
  body: string
) {
  const commentsRef = ref(db, 'comments');
  const newCommentRef = push(commentsRef);
  const commentId = newCommentRef.key || `mock-comment-${Date.now()}`;

  const newComment = {
    id: commentId,
    animeId,
    episodeNumber: episodeNumber || null,
    username,
    email,
    avatar,
    body,
    timestamp: Date.now(),
    likes: 0,
    pinned: false,
    reported: false
  };

  // Update local cache instantly for high performance
  const cacheKey = "anova_comments_cache";
  const localComments = getLocalItem<Comment[]>(cacheKey, []);
  localComments.push({ ...newComment, replies: [], likedBy: [] });
  setLocalItem(cacheKey, localComments);

  const dbTask = (async () => {
    await set(newCommentRef, newComment);

    // Increment user comments count
    const sanitized = sanitizeEmail(email);
    const userRef = ref(db, `users/${sanitized}`);
    const snap = await get(userRef);
    if (snap.exists()) {
      const existing = snap.val();
      await update(userRef, { commentsCount: (existing.commentsCount || 0) + 1 });
    }
  })();

  await runWithTimeout(dbTask, DB_TIMEOUT_MS, null);
}

export async function deleteCommentDb(commentId: string) {
  const commentRef = ref(db, `comments/${commentId}`);
  
  const cacheKey = "anova_comments_cache";
  let localComments = getLocalItem<Comment[]>(cacheKey, []);
  localComments = localComments.filter(c => String(c.id) !== String(commentId));
  setLocalItem(cacheKey, localComments);

  await runWithTimeout(remove(commentRef), DB_TIMEOUT_MS, null);
}

export async function likeCommentDb(commentId: string, userEmail: string) {
  const commentRef = ref(db, `comments/${commentId}`);
  const sanitizedEmail = sanitizeEmail(userEmail);

  const cacheKey = "anova_comments_cache";
  const localComments = getLocalItem<Comment[]>(cacheKey, []);
  const matched = localComments.find(c => String(c.id) === String(commentId));
  if (matched) {
    if (matched.likedBy && matched.likedBy.includes(userEmail)) {
      matched.likedBy = matched.likedBy.filter(e => e !== userEmail);
      matched.likes = Math.max(0, (matched.likes || 1) - 1);
    } else {
      matched.likedBy = matched.likedBy || [];
      matched.likedBy.push(userEmail);
      matched.likes = (matched.likes || 0) + 1;
    }
    setLocalItem(cacheKey, localComments);
  }

  const dbTask = (async () => {
    const snap = await get(commentRef);
    if (!snap.exists()) return;

    const data = snap.val();
    const likedByObj = data.likedBy || {};
    const alreadyLiked = likedByObj[sanitizedEmail] !== undefined;

    if (alreadyLiked) {
      await remove(ref(db, `comments/${commentId}/likedBy/${sanitizedEmail}`));
      await update(commentRef, { likes: Math.max(0, (data.likes || 1) - 1) });
    } else {
      await set(ref(db, `comments/${commentId}/likedBy/${sanitizedEmail}`), userEmail);
      await update(commentRef, { likes: (data.likes || 0) + 1 });
    }
  })();

  runWithTimeout(dbTask, DB_TIMEOUT_MS, null);
}

export async function pinCommentDb(commentId: string, pinned: boolean) {
  const commentRef = ref(db, `comments/${commentId}`);

  const cacheKey = "anova_comments_cache";
  const localComments = getLocalItem<Comment[]>(cacheKey, []);
  const matched = localComments.find(c => String(c.id) === String(commentId));
  if (matched) {
    matched.pinned = pinned;
    setLocalItem(cacheKey, localComments);
  }

  await runWithTimeout(update(commentRef, { pinned }), DB_TIMEOUT_MS, null);
}

export async function reportCommentDb(commentId: string) {
  const commentRef = ref(db, `comments/${commentId}`);
  
  const cacheKey = "anova_comments_cache";
  const localComments = getLocalItem<Comment[]>(cacheKey, []);
  const matched = localComments.find(c => String(c.id) === String(commentId));
  if (matched) {
    matched.reported = true;
    setLocalItem(cacheKey, localComments);
  }

  const dbTask = (async () => {
    await update(commentRef, { reported: true });

    const reportRef = push(ref(db, 'reports'));
    await set(reportRef, {
      id: reportRef.key,
      commentId,
      timestamp: Date.now(),
      status: 'pending'
    });
  })();

  runWithTimeout(dbTask, DB_TIMEOUT_MS, null);
}

export async function addReplyDb(
  commentId: string, 
  username: string, 
  email: string, 
  avatar: string, 
  body: string
) {
  const repliesRef = ref(db, `comments/${commentId}/replies`);
  const newReplyRef = push(repliesRef);
  const replyId = newReplyRef.key || `mock-reply-${Date.now()}`;

  const newReply = {
    id: replyId,
    commentId,
    username,
    email,
    avatar,
    body,
    timestamp: Date.now(),
    likes: 0
  };

  const cacheKey = "anova_comments_cache";
  const localComments = getLocalItem<Comment[]>(cacheKey, []);
  const matched = localComments.find(c => String(c.id) === String(commentId));
  if (matched) {
    matched.replies = matched.replies || [];
    matched.replies.push(newReply);
    setLocalItem(cacheKey, localComments);
  }

  runWithTimeout(set(newReplyRef, newReply), DB_TIMEOUT_MS, null);
}

export async function likeReplyDb(commentId: string, replyId: string, userEmail: string) {
  const replyRef = ref(db, `comments/${commentId}/replies/${replyId}`);
  const sanitizedEmail = sanitizeEmail(userEmail);

  const cacheKey = "anova_comments_cache";
  const localComments = getLocalItem<Comment[]>(cacheKey, []);
  const comment = localComments.find(c => String(c.id) === String(commentId));
  if (comment && comment.replies) {
    const r = comment.replies.find(rep => String(rep.id) === String(replyId));
    if (r) {
      r.likedBy = r.likedBy || [];
      if (r.likedBy.includes(userEmail)) {
        r.likedBy = r.likedBy.filter(e => e !== userEmail);
        r.likes = Math.max(0, (r.likes || 1) - 1);
      } else {
        r.likedBy.push(userEmail);
        r.likes = (r.likes || 0) + 1;
      }
      setLocalItem(cacheKey, localComments);
    }
  }

  const dbTask = (async () => {
    const snap = await get(replyRef);
    if (!snap.exists()) return;

    const data = snap.val();
    const likedByObj = data.likedBy || {};
    const alreadyLiked = likedByObj[sanitizedEmail] !== undefined;

    if (alreadyLiked) {
      await remove(ref(db, `comments/${commentId}/replies/${replyId}/likedBy/${sanitizedEmail}`));
      await update(replyRef, { likes: Math.max(0, (data.likes || 1) - 1) });
    } else {
      await set(ref(db, `comments/${commentId}/replies/${replyId}/likedBy/${sanitizedEmail}`), userEmail);
      await update(replyRef, { likes: (data.likes || 0) + 1 });
    }
  })();

  runWithTimeout(dbTask, DB_TIMEOUT_MS, null);
}

export async function deleteReplyDb(commentId: string, replyId: string) {
  const replyRef = ref(db, `comments/${commentId}/replies/${replyId}`);

  const cacheKey = "anova_comments_cache";
  const localComments = getLocalItem<Comment[]>(cacheKey, []);
  const comment = localComments.find(c => String(c.id) === String(commentId));
  if (comment && comment.replies) {
    comment.replies = comment.replies.filter(r => String(r.id) !== String(replyId));
    setLocalItem(cacheKey, localComments);
  }

  await runWithTimeout(remove(replyRef), DB_TIMEOUT_MS, null);
}

// ==========================================
// CUSTOM ANIME & EPISODE SYSTEM
// ==========================================

export async function addCustomAnime(id: string, anime: any) {
  const animeRef = ref(db, `animes/${id}`);
  
  const cacheKey = "anova_custom_animes";
  const localAnimes = getLocalItem<Record<string, any>>(cacheKey, {});
  localAnimes[id] = anime;
  setLocalItem(cacheKey, localAnimes);

  await runWithTimeout(set(animeRef, cleanForFirebase(anime)), DB_TIMEOUT_MS, null);
}

export async function deleteCustomAnime(id: string) {
  const animeRef = ref(db, `animes/${id}`);
  const episodesRef = ref(db, `episodes/${id}`);

  const cacheKey = "anova_custom_animes";
  const localAnimes = getLocalItem<Record<string, any>>(cacheKey, {});
  delete localAnimes[id];
  setLocalItem(cacheKey, localAnimes);

  const dbTask = (async () => {
    await remove(animeRef);
    await remove(episodesRef);
  })();

  await runWithTimeout(dbTask, DB_TIMEOUT_MS, null);
}

export async function getCustomAnimes(): Promise<Record<string, any>> {
  const animesRef = ref(db, 'animes');
  const cacheKey = "anova_custom_animes";
  const localAnimes = getLocalItem<Record<string, any>>(cacheKey, {});

  const dbTask = (async () => {
    const snap = await get(animesRef);
    return snap.exists() ? snap.val() : {};
  })();

  const finalAnimes = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localAnimes);
  setLocalItem(cacheKey, finalAnimes);
  return finalAnimes;
}

export async function updateAnimeEpisodesCount(animeId: string) {
  try {
    const epRef = ref(db, `episodes/${animeId}`);
    const snap = await get(epRef);
    let count = 0;
    if (snap.exists()) {
      const eps = snap.val();
      count = Object.values(eps).filter(Boolean).length;
    }
    
    const animeRef = ref(db, `animes/${animeId}`);
    const animeSnap = await get(animeRef);
    if (animeSnap.exists()) {
      await update(animeRef, {
        episodes: count,
        episodesCount: count
      });
      
      // Also update local cache
      const cacheKey = "anova_custom_animes";
      const localAnimes = getLocalItem<Record<string, any>>(cacheKey, {});
      if (localAnimes[animeId]) {
        localAnimes[animeId].episodes = count;
        localAnimes[animeId].episodesCount = count;
        setLocalItem(cacheKey, localAnimes);
      }
    }
  } catch (err) {
    console.error(`[Firebase sync] Failed to auto-update episodes count for ${animeId}:`, err);
  }
}

export async function addCustomEpisode(animeId: string, episodeNumber: number, episode: any) {
  const epRef = ref(db, `episodes/${animeId}/${episodeNumber}`);

  const cacheKey = `anova_custom_episodes_${animeId}`;
  const localEps = getLocalItem<Record<string, any>>(cacheKey, {});
  localEps[episodeNumber] = episode;
  setLocalItem(cacheKey, localEps);

  await runWithTimeout(set(epRef, cleanForFirebase(episode)), DB_TIMEOUT_MS, null);
  await updateAnimeEpisodesCount(animeId);
}

export async function addCustomEpisodesBatch(animeId: string, episodesMap: Record<number, any>) {
  const episodesRef = ref(db, `episodes/${animeId}`);

  const cacheKey = `anova_custom_episodes_${animeId}`;
  const localEps = getLocalItem<Record<string, any>>(cacheKey, {});
  const mergedEps = { ...localEps, ...episodesMap };
  setLocalItem(cacheKey, mergedEps);

  await runWithTimeout(update(episodesRef, cleanForFirebase(episodesMap)), DB_TIMEOUT_MS * 3, null);
  await updateAnimeEpisodesCount(animeId);
}

export async function getCustomEpisodes(animeId: string): Promise<Record<string, any>> {
  const episodesRef = ref(db, `episodes/${animeId}`);
  const cacheKey = `anova_custom_episodes_${animeId}`;
  const localEps = getLocalItem<Record<string, any>>(cacheKey, {});

  const dbTask = (async () => {
    const snap = await get(episodesRef);
    return snap.exists() ? snap.val() : {};
  })();

  const finalEps = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localEps);
  setLocalItem(cacheKey, finalEps);
  return finalEps;
}

// ==========================================
// ADVERTISEMENT MANAGEMENT SYSTEM
// ==========================================

export async function addAdvertisement(id: string, ad: any) {
  const adRef = ref(db, `advertisements/${id}`);
  
  const cacheKey = "anova_advertisements";
  const localAds = getLocalItem<Record<string, any>>(cacheKey, {});
  localAds[id] = ad;
  setLocalItem(cacheKey, localAds);

  await runWithTimeout(set(adRef, cleanForFirebase(ad)), DB_TIMEOUT_MS, null);
}

export async function deleteAdvertisement(id: string) {
  const adRef = ref(db, `advertisements/${id}`);

  const cacheKey = "anova_advertisements";
  const localAds = getLocalItem<Record<string, any>>(cacheKey, {});
  delete localAds[id];
  setLocalItem(cacheKey, localAds);

  await runWithTimeout(remove(adRef), DB_TIMEOUT_MS, null);
}

export async function getAdvertisements(): Promise<Record<string, any>> {
  const adsRef = ref(db, 'advertisements');
  const cacheKey = "anova_advertisements";
  const localAds = getLocalItem<Record<string, any>>(cacheKey, {});

  const dbTask = (async () => {
    const snap = await get(adsRef);
    return snap.exists() ? snap.val() : {};
  })();

  const finalAds = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localAds);
  setLocalItem(cacheKey, finalAds);
  return finalAds;
}

// ==========================================
// 5. GLOBALLY VERIFIED WORKING SERVERS CACHE
// ==========================================

export interface VerifiedServerInfo {
  server: string;
  idType: string;
  anilistId: string;
  animoId: string;
  malId: string;
  updatedAt: number;
}

export async function saveGlobalWorkingServer(
  animeId: string,
  episode: number,
  audio: string,
  serverInfo: {
    server: string;
    idType: string;
    anilistId: string;
    animoId: string;
    malId: string;
  }
) {
  const key = `working_servers/${animeId}/${episode}/${audio}`;
  const localKey = `working_server_local_${animeId}_E${episode}_A${audio}`;
  
  const payload = {
    ...serverInfo,
    updatedAt: Date.now()
  };

  setLocalItem(localKey, payload);

  try {
    const serverRef = ref(db, key);
    runWithTimeout(set(serverRef, payload), DB_TIMEOUT_MS, null);
  } catch (err) {
    console.warn(`[Firebase DB Cache] Failed to save working server to DB:`, err);
  }
}

export async function getGlobalWorkingServer(
  animeId: string,
  episode: number,
  audio: string
): Promise<VerifiedServerInfo | null> {
  const key = `working_servers/${animeId}/${episode}/${audio}`;
  const localKey = `working_server_local_${animeId}_E${episode}_A${audio}`;
  const localFallback = getLocalItem<VerifiedServerInfo | null>(localKey, null);

  const dbTask = (async () => {
    const serverRef = ref(db, key);
    const snap = await get(serverRef);
    return snap.exists() ? (snap.val() as VerifiedServerInfo) : null;
  })();

  const finalInfo = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localFallback);
  if (finalInfo) {
    setLocalItem(localKey, finalInfo);
  }
  return finalInfo;
}

export interface AnimeIDMapping {
  animoId: string;
  anilistId: string;
  malId: string;
}

export async function saveGlobalAnimeMapping(animeId: string, ids: AnimeIDMapping) {
  const key = `anime_mappings/${animeId}`;
  const localKey = `resolved_ids_${animeId}`;
  setLocalItem(localKey, ids);
  try {
    const r = ref(db, key);
    runWithTimeout(set(r, {
      ...ids,
      updatedAt: Date.now()
    }), DB_TIMEOUT_MS, null);
  } catch (err) {
    console.warn(`[Firebase DB Mapping] Failed to save mapping:`, err);
  }
}

export async function getGlobalAnimeMapping(animeId: string): Promise<AnimeIDMapping | null> {
  const key = `anime_mappings/${animeId}`;
  const localKey = `resolved_ids_${animeId}`;
  const localFallback = getLocalItem<AnimeIDMapping | null>(localKey, null);

  const dbTask = (async () => {
    const r = ref(db, key);
    const snap = await get(r);
    return snap.exists() ? (snap.val() as AnimeIDMapping) : null;
  })();

  const finalInfo = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localFallback);
  if (finalInfo) {
    const sanitized = {
      animoId: finalInfo.animoId || '',
      anilistId: finalInfo.anilistId || '',
      malId: finalInfo.malId || ''
    };
    setLocalItem(localKey, sanitized);
    return sanitized;
  }
  return finalInfo;
}

// ==========================================
// 6. EPISODE OVERLAY PROTECTION SYSTEM
// ==========================================

export interface EpisodeOverlaySettings {
  bottomOverlay: boolean;
  topOverlay: boolean;
}

export async function saveEpisodeOverlaySettings(
  animeId: string,
  episode: number,
  settings: EpisodeOverlaySettings
) {
  const key = `episodeOverlays/${animeId}/${episode}`;
  const localKey = `episode_overlay_local_${animeId}_E${episode}`;

  setLocalItem(localKey, settings);

  try {
    const overlayRef = ref(db, key);
    runWithTimeout(set(overlayRef, settings), DB_TIMEOUT_MS, null);
  } catch (err) {
    console.warn(`[Firebase DB Overlay] Failed to save overlay settings:`, err);
  }
}

export async function getEpisodeOverlaySettings(
  animeId: string,
  episode: number
): Promise<EpisodeOverlaySettings | null> {
  const key = `episodeOverlays/${animeId}/${episode}`;
  const localKey = `episode_overlay_local_${animeId}_E${episode}`;
  const localFallback = getLocalItem<EpisodeOverlaySettings | null>(localKey, null);

  const dbTask = (async () => {
    const overlayRef = ref(db, key);
    const snap = await get(overlayRef);
    return snap.exists() ? (snap.val() as EpisodeOverlaySettings) : null;
  })();

  const finalSettings = await runWithTimeout(dbTask, DB_TIMEOUT_MS, localFallback);
  if (finalSettings) {
    setLocalItem(localKey, finalSettings);
  }
  return finalSettings;
}
