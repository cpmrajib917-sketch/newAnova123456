// @ts-nocheck
import { addCustomAnime, addCustomEpisodesBatch, getCustomAnimes } from './firebaseSync';
import { db } from './firebase';
import { ref, get, remove } from 'firebase/database';

export interface SkippedVideoLog {
  title: string;
  videoId?: string;
  playlistTitle?: string;
  reason: string;
}

export interface FailedMetadataLog {
  animeId: string;
  animeTitle: string;
  reason: string;
}

export interface ImportStats {
  playlistsProcessed: number;
  episodesAdded: number;
  animeCreatedCount: number;
  animeUpdatedCount: number;
  skippedVideos: SkippedVideoLog[];
  failedMetadata: FailedMetadataLog[];
  metadataProgress: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
}

// Words/keywords that indicate NON-EPISODE content (Never Import)
const EXCLUDED_KEYWORDS = [
  'short', 'shorts', '#shorts',
  'clip', 'clips',
  'highlight', 'highlights',
  'trailer', 'trailers',
  'teaser', 'teasers',
  'preview', 'previews',
  'promotional video', 'pv', 'cm',
  'opening', 'ending', 'creditless op', 'creditless ed',
  'amv',
  'reaction', 'reactions',
  'review', 'reviews',
  'news',
  'live stream', 'livestream', 'stream',
  'music video', 'mv',
  'announcement',
  'character video', 'character pv', 'character teaser',
  'compilation',
  'recap',
  'funny moments', 'best moments', 'top moments', 'top 10', 'top 5',
  'fan upload', 'fan made', 'fanmade'
];

// Regexes for precise standalone word boundary checking for short acronyms like OP, ED, PV, CM, AMV, MV
const EXCLUDED_REGEXES = [
  /\b(shorts?|#shorts)\b/i,
  /\b(clips?)\b/i,
  /\b(highlights?)\b/i,
  /\b(trailers?)\b/i,
  /\b(teasers?)\b/i,
  /\b(previews?)\b/i,
  /\b(promotional\s*videos?|pv|cm)\b/i,
  /\b(openings?|endings?|op|ed|creditless)\b/i,
  /\b(amv)\b/i,
  /\b(reactions?)\b/i,
  /\b(reviews?)\b/i,
  /\b(news)\b/i,
  /\b(live\s*streams?|livestreams?)\b/i,
  /\b(music\s*videos?|mv)\b/i,
  /\b(announcements?)\b/i,
  /\b(character\s*(video|pv|teaser))\b/i,
  /\b(compilations?)\b/i,
  /\b(recaps?)\b/i,
  /\b(funny\s*moments|best\s*moments|top\s*moments|top\s*\d+)\b/i,
  /\b(fan\s*upload|fan\s*made|fanmade)\b/i,
];

/**
 * Checks if a video title or description contains non-episode keywords.
 */
export function containsExcludedKeyword(title: string): { isExcluded: boolean; matchedKeyword?: string } {
  if (!title) return { isExcluded: false };
  const lower = title.toLowerCase();

  for (const regex of EXCLUDED_REGEXES) {
    const match = lower.match(regex);
    if (match && match[0]) {
      // Guard against false positives like "Episode" matching "ED" or "OP" inside words
      const kw = match[0].toLowerCase();
      if ((kw === 'op' || kw === 'ed' || kw === 'pv' || kw === 'cm' || kw === 'mv') && lower.includes('episode')) {
        // Double check if it's really an OP/ED or just episode
        if (!/\b(opening|ending|creditless|clean\s*(op|ed))\b/i.test(lower)) {
          continue;
        }
      }
      return { isExcluded: true, matchedKeyword: match[0] };
    }
  }

  return { isExcluded: false };
}

/**
 * Parses video duration string (HH:MM:SS, MM:SS, or ISO 8601 PT#M#S) into total seconds.
 */
export function parseDurationToSeconds(durationStr: any): number {
  if (!durationStr || durationStr === 'N/A') return 0;
  if (typeof durationStr === 'number') return durationStr;
  
  const str = String(durationStr).trim();

  // ISO 8601 duration format (e.g., PT23M12S or PT1H2M)
  if (str.startsWith('PT')) {
    let seconds = 0;
    const hoursMatch = str.match(/(\d+)H/);
    const minsMatch = str.match(/(\d+)M/);
    const secsMatch = str.match(/(\d+)S/);
    if (hoursMatch) seconds += parseInt(hoursMatch[1], 10) * 3600;
    if (minsMatch) seconds += parseInt(minsMatch[1], 10) * 60;
    if (secsMatch) seconds += parseInt(secsMatch[1], 10);
    return seconds;
  }

  // Standard string format e.g. "23:45" or "1:12:30"
  const parts = str.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }

  return 0;
}

/**
 * Detects if anime or video is a Movie, OVA, or ONA based on title / metadata.
 */
export function detectVideoType(title: string, playlistTitle: string = ''): 'TV' | 'Movie' | 'OVA' | 'ONA' {
  const combined = `${title} ${playlistTitle}`.toLowerCase();
  if (combined.includes('movie') || combined.includes('the movie') || combined.includes('gekijouban')) {
    return 'Movie';
  }
  if (combined.includes('ova')) {
    return 'OVA';
  }
  if (combined.includes('ona')) {
    return 'ONA';
  }
  return 'TV';
}

/**
 * Validates whether a video should be imported according to user rules.
 */
export function filterVideoForImport(video: any, playlistTitle: string = ''): { shouldImport: boolean; skipReason?: string } {
  // 1. Strict Private/Deleted Check
  const title = (video.title || '').toLowerCase();
  if (video.isPrivateOrDeleted && (title.includes('private video') || title.includes('deleted video'))) {
    return { shouldImport: false, skipReason: 'Video is Private or Deleted' };
  }
  if (video.isMembersOnly || video.membersOnly) {
    return { shouldImport: false, skipReason: 'Members-Only Video' };
  }

  // Region-blocked, region-locked, or short videos ARE ALLOWED for import!
  return { shouldImport: true };
}

/**
 * Cleans anime titles for metadata searching by stripping episode numbers, sub/dub tags, etc.
 */
export function cleanTitleForSearch(title: string): string {
  if (!title) return '';
  let cleaned = title;

  // Remove common YouTube playlist noise & suffixes
  cleaned = cleaned.replace(/\b(full\s*anime|full\s*playlist|playlist|official|4k|1080p|720p|hd)\b/gi, '');
  cleaned = cleaned.replace(/\[\s*(english|eng|hindi|sub|dub|multi|jp|uncensored|subbed|dubbed)\s*\]/gi, '');
  cleaned = cleaned.replace(/\(\s*(english|eng|hindi|sub|dub|multi|jp|uncensored|subbed|dubbed)\s*\)/gi, '');
  cleaned = cleaned.replace(/\b(english\s*sub|english\s*dub|hindi\s*dub|sub|dub)\b/gi, '');
  cleaned = cleaned.replace(/\b(season\s*\d+|s\d+)\b/gi, '');
  cleaned = cleaned.replace(/\b(episode\s*\d+(?:\s*-\s*\d+)?|ep\s*\d+|eps\s*\d+)\b/gi, '');
  cleaned = cleaned.replace(/#\d+/g, '');
  cleaned = cleaned.replace(/[\{\}\[\]\(\)]/g, ' ');
  cleaned = cleaned.replace(/[-_:\/|]+/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned || title;
}

/**
 * Normalizes title string for exact duplicate matching (e.g., "Apocalypse Bringer Mynoghra" -> "apocalypsebringermynoghra").
 */
export function normalizeTitleForComparison(title: string): string {
  if (!title) return '';
  return cleanTitleForSearch(title)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Search anime metadata hierarchically: AniList -> Jikan (MAL) -> Kitsu
 */
export async function fetchAnimeMetadataHierarchical(searchTitle: string): Promise<{
  success: boolean;
  data?: any;
  source?: 'anilist' | 'jikan' | 'kitsu';
  error?: string;
}> {
  const cleanQuery = cleanTitleForSearch(searchTitle);
  if (!cleanQuery) {
    return { success: false, error: 'Empty search query' };
  }

  // First try server API proxy endpoint if available
  try {
    const res = await fetch(`/api/anime-metadata?title=${encodeURIComponent(cleanQuery)}`);
    if (res.ok) {
      const result = await res.json();
      if (result.success && result.data) {
        return { success: true, data: result.data, source: result.source };
      }
    }
  } catch (err) {
    // Fallback to client-side direct calls if server endpoint unavailable
  }

  // 1. AniList GraphQL API (1st Preference)
  try {
    const query = `
      query ($search: String) {
        Media (search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          title { romaji english native }
          format
          status
          description(asHtml: false)
          startDate { year month day }
          season
          seasonYear
          episodes
          duration
          coverImage { extraLarge large medium }
          bannerImage
          genres
          averageScore
          meanScore
          studios(isMain: true) { nodes { name } }
          trailer { id site }
        }
      }
    `;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: cleanQuery } })
    });

    if (res.ok) {
      const json = await res.json();
      const media = json.data?.Media;
      if (media && (media.description || media.genres?.length > 0 || media.coverImage?.extraLarge)) {
        // Strip HTML tags if any residual exist in description
        let desc = media.description || '';
        desc = desc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

        const formatted = {
          anilistId: String(media.id || ''),
          malId: String(media.idMal || ''),
          title: media.title?.english || media.title?.romaji || cleanQuery,
          englishTitle: media.title?.english || '',
          romajiTitle: media.title?.romaji || '',
          nativeTitle: media.title?.native || '',
          description: desc,
          genres: media.genres || [],
          studios: media.studios?.nodes?.map((n: any) => n.name) || [],
          score: media.averageScore ? (media.averageScore / 10).toFixed(1) : (media.meanScore ? (media.meanScore / 10).toFixed(1) : 'N/A'),
          rating: media.averageScore ? `${media.averageScore}%` : 'N/A',
          season: media.season || '',
          released: media.seasonYear ? String(media.seasonYear) : (media.startDate?.year ? String(media.startDate.year) : ''),
          status: media.status === 'FINISHED' ? 'Completed' : (media.status === 'RELEASING' ? 'Currently Airing' : 'Completed'),
          episodesCount: media.episodes || 0,
          duration: media.duration ? `${media.duration} min` : '24 min',
          type: media.format === 'MOVIE' ? 'Movie' : (media.format === 'OVA' ? 'OVA' : (media.format === 'ONA' ? 'ONA' : 'TV')),
          poster: media.coverImage?.extraLarge || media.coverImage?.large || '',
          banner: media.bannerImage || media.coverImage?.extraLarge || '',
          trailer: media.trailer?.site === 'youtube' ? `https://www.youtube.com/watch?v=${media.trailer.id}` : ''
        };

        if (formatted.description) {
          return { success: true, data: formatted, source: 'anilist' };
        }
      }
    }
  } catch (err) {
    console.warn('[AniList Metadata Fetch Error]:', err);
  }

  // 2. MyAnimeList / Jikan API v4 (2nd Preference)
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanQuery)}&limit=1`);
    if (res.ok) {
      const json = await res.json();
      const anime = json.data?.[0];
      if (anime && (anime.synopsis || anime.genres?.length > 0)) {
        const formatted = {
          malId: String(anime.mal_id || ''),
          anilistId: '',
          title: anime.title_english || anime.title || cleanQuery,
          englishTitle: anime.title_english || '',
          romajiTitle: anime.title || '',
          description: (anime.synopsis || '').trim(),
          genres: anime.genres?.map((g: any) => g.name) || [],
          studios: anime.studios?.map((s: any) => s.name) || [],
          score: anime.score ? String(anime.score) : 'N/A',
          rating: anime.score ? `${Math.round(anime.score * 10)}%` : 'N/A',
          season: anime.season || '',
          released: anime.year ? String(anime.year) : (anime.aired?.prop?.from?.year ? String(anime.aired.prop.from.year) : ''),
          status: anime.status === 'Finished Airing' ? 'Completed' : 'Currently Airing',
          episodesCount: anime.episodes || 0,
          duration: anime.duration || '24 min',
          type: anime.type === 'Movie' ? 'Movie' : (anime.type === 'OVA' ? 'OVA' : (anime.type === 'ONA' ? 'ONA' : 'TV')),
          poster: anime.images?.jpg?.large_image_url || anime.images?.webp?.large_image_url || '',
          banner: anime.trailer?.images?.maximum_image_url || anime.images?.jpg?.large_image_url || '',
          trailer: anime.trailer?.url || ''
        };

        if (formatted.description) {
          return { success: true, data: formatted, source: 'jikan' };
        }
      }
    }
  } catch (err) {
    console.warn('[Jikan Metadata Fetch Error]:', err);
  }

  // 3. Kitsu API (3rd Preference Fallback)
  try {
    const res = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanQuery)}&page[limit]=1`);
    if (res.ok) {
      const json = await res.json();
      const anime = json.data?.[0]?.attributes;
      if (anime && (anime.synopsis || anime.posterImage?.large)) {
        const formatted = {
          title: anime.canonicalTitle || cleanQuery,
          englishTitle: anime.titles?.en || anime.canonicalTitle || '',
          description: (anime.synopsis || '').trim(),
          genres: [],
          studios: [],
          score: anime.averageRating ? (parseFloat(anime.averageRating) / 10).toFixed(1) : 'N/A',
          rating: anime.averageRating ? `${Math.round(parseFloat(anime.averageRating))}%` : 'N/A',
          released: anime.startDate ? anime.startDate.substring(0, 4) : '',
          status: anime.status === 'finished' ? 'Completed' : 'Currently Airing',
          episodesCount: anime.episodeCount || 0,
          type: anime.showType === 'movie' ? 'Movie' : (anime.showType === 'OVA' ? 'OVA' : 'TV'),
          poster: anime.posterImage?.large || anime.posterImage?.original || '',
          banner: anime.coverImage?.large || anime.coverImage?.original || anime.posterImage?.large || '',
          trailer: anime.youtubeVideoId ? `https://www.youtube.com/watch?v=${anime.youtubeVideoId}` : ''
        };

        if (formatted.description) {
          return { success: true, data: formatted, source: 'kitsu' };
        }
      }
    }
  } catch (err) {
    console.warn('[Kitsu Metadata Fetch Error]:', err);
  }

  return { success: false, error: `No metadata found on AniList, MAL, or Kitsu for '${cleanQuery}'` };
}

/**
 * Finds if an anime already exists in DB to prevent duplicates.
 */
export function findExistingAnimeMatch(title: string, playlistId: string, customAnimes: Record<string, any>): string | null {
  if (!customAnimes) return null;

  const targetPlaylistAnimeId = `yt-pl-${playlistId}`;
  if (customAnimes[targetPlaylistAnimeId]) {
    return targetPlaylistAnimeId;
  }

  const normalizedTargetTitle = normalizeTitleForComparison(title);

  for (const [id, anime] of Object.entries(customAnimes)) {
    if (!anime) continue;
    
    // Check direct playlist ID
    if (anime.playlistId === playlistId || anime.id === targetPlaylistAnimeId) {
      return id;
    }

    // Check normalized title match
    const existingNormTitle = normalizeTitleForComparison(anime.title || '');
    if (normalizedTargetTitle && existingNormTitle && normalizedTargetTitle === existingNormTitle) {
      return id;
    }
  }

  return null;
}
