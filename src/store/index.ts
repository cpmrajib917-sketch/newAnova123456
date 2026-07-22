// @ts-nocheck
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WatchProgress, Anime, Comment, Reply } from '../types';
import { 
  addCommentDb, 
  deleteCommentDb, 
  likeCommentDb, 
  pinCommentDb, 
  reportCommentDb, 
  addReplyDb, 
  likeReplyDb, 
  deleteReplyDb,
  saveFavoriteDb,
  saveBookmarkDb,
  saveWatchProgressDb,
  getFavoritesDb,
  getBookmarksDb,
  getWatchHistoryDb
} from '../lib/firebaseSync';

interface AppState {
  favorites: Anime[];
  bookmarks: Anime[];
  watchHistory: Record<string, WatchProgress>;
  searchHistory: string[];
  comments: Comment[];
  
  // Setters for Firebase load
  setComments: (comments: Comment[]) => void;
  loadUserFirebaseData: (email: string) => Promise<void>;
  
  addFavorite: (anime: Anime) => void;
  removeFavorite: (id: string) => void;
  addBookmark: (anime: Anime) => void;
  removeBookmark: (id: string) => void;
  saveProgress: (progress: WatchProgress) => void;
  addSearchHistory: (query: string) => void;
  
  // Comments System actions
  addComment: (animeId: string, episodeNumber: number | undefined, username: string, email: string, avatar: string, body: string) => void;
  deleteComment: (commentId: string) => void;
  likeComment: (commentId: string, userEmail: string) => void;
  pinComment: (commentId: string, isPinned: boolean) => void;
  reportComment: (commentId: string) => void;
  
  // Nested Replies actions
  addReply: (commentId: string, username: string, email: string, avatar: string, body: string) => void;
  likeReply: (commentId: string, replyId: string, userEmail: string) => void;
  deleteReply: (commentId: string, replyId: string) => void;
}

// Initial seed comments to make the system feel populated and realistic from first load
const initialSeedComments: Comment[] = [
  {
    id: 'seed-1',
    animeId: '1', // Solo Leveling or default first anime
    episodeNumber: 1,
    username: 'AnimeSlayer99',
    email: 'slayer@example.com',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop',
    body: 'This episode was absolutely legendary! The animation quality of the boss fight is movie level! 💥✨',
    timestamp: Date.now() - 3600000 * 2, // 2 hours ago
    likes: 24,
    likedBy: [],
    pinned: true,
    reported: false,
    replies: [
      {
        id: 'reply-seed-1',
        commentId: 'seed-1',
        username: 'SaitamaSensei',
        email: 'onepunch@example.com',
        avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop',
        body: 'Agreed! A-1 Pictures is completely cooking this season! Cannot wait for next week.',
        timestamp: Date.now() - 3600000, // 1 hour ago
        likes: 12,
        likedBy: []
      }
    ]
  },
  {
    id: 'seed-2',
    animeId: '2',
    episodeNumber: 1,
    username: 'WaifuCollector',
    email: 'waifu@example.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop',
    body: 'The character design and soundtrack on this is phenomenal. Instant favorite!',
    timestamp: Date.now() - 3600000 * 5, // 5 hours ago
    likes: 15,
    likedBy: [],
    pinned: false,
    reported: false,
    replies: []
  }
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      favorites: [],
      bookmarks: [],
      watchHistory: {},
      searchHistory: [],
      comments: initialSeedComments,
      
      setComments: (comments) => set({ comments }),

      loadUserFirebaseData: async (email: string) => {
        try {
          const favs = await getFavoritesDb(email);
          const bms = await getBookmarksDb(email);
          const history = await getWatchHistoryDb(email);
          set({
            favorites: favs.length > 0 ? favs : get().favorites,
            bookmarks: bms.length > 0 ? bms : get().bookmarks,
            watchHistory: Object.keys(history).length > 0 ? history : get().watchHistory
          });
        } catch (e) {
          console.warn("Failed to load user Firebase data:", e);
        }
      },
      
      addFavorite: (anime) => {
        set((state) => {
          const alreadyFavorite = state.favorites.some(f => f.id === anime.id);
          const nextFavorites = alreadyFavorite ? state.favorites : [anime, ...state.favorites];
          
          const email = localStorage.getItem('userEmail');
          if (email) {
            saveFavoriteDb(email, anime, true).catch(err => console.error("Firebase fav error:", err));
          }
          return { favorites: nextFavorites };
        });
      },
      
      removeFavorite: (id) => {
        set((state) => {
          const anime = state.favorites.find(f => f.id === id);
          const nextFavorites = state.favorites.filter(f => f.id !== id);
          
          const email = localStorage.getItem('userEmail');
          if (email && anime) {
            saveFavoriteDb(email, anime, false).catch(err => console.error("Firebase fav error:", err));
          }
          return { favorites: nextFavorites };
        });
      },
      
      addBookmark: (anime) => {
        set((state) => {
          const alreadyBookmarked = state.bookmarks.some(b => b.id === anime.id);
          const nextBookmarks = alreadyBookmarked ? state.bookmarks : [anime, ...state.bookmarks];
          
          const email = localStorage.getItem('userEmail');
          if (email) {
            saveBookmarkDb(email, anime, true).catch(err => console.error("Firebase bookmark error:", err));
          }
          return { bookmarks: nextBookmarks };
        });
      },
      
      removeBookmark: (id) => {
        set((state) => {
          const anime = state.bookmarks.find(b => b.id === id);
          const nextBookmarks = state.bookmarks.filter(b => b.id !== id);
          
          const email = localStorage.getItem('userEmail');
          if (email && anime) {
            saveBookmarkDb(email, anime, false).catch(err => console.error("Firebase bookmark error:", err));
          }
          return { bookmarks: nextBookmarks };
        });
      },
      
      saveProgress: (progress) => {
        set((state) => {
          const nextHistory = { ...state.watchHistory, [progress.animeId]: progress };
          const email = localStorage.getItem('userEmail');
          if (email) {
            saveWatchProgressDb(email, progress).catch(err => console.error("Firebase progress error:", err));
          }
          return { watchHistory: nextHistory };
        });
      },
      
      addSearchHistory: (query) => set((state) => {
        const history = state.searchHistory.filter(q => q !== query);
        return { searchHistory: [query, ...history].slice(0, 10) };
      }),

      // COMMENTS MANAGEMENT
      addComment: (animeId, episodeNumber, username, email, avatar, body) => {
        const fallbackId = `cmt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const resolvedAvatar = avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`;
        
        // Push to Firebase first if online
        addCommentDb(animeId, episodeNumber, username, email, resolvedAvatar, body)
          .catch(() => {
            // Local optimistic state if firebase fails/offline
            set((state) => {
              const newComment: Comment = {
                id: fallbackId,
                animeId,
                episodeNumber,
                username,
                email,
                avatar: resolvedAvatar,
                body,
                timestamp: Date.now(),
                likes: 0,
                likedBy: [],
                pinned: false,
                reported: false,
                replies: []
              };
              return { comments: [newComment, ...state.comments] };
            });
          });
      },

      deleteComment: (commentId) => {
        deleteCommentDb(commentId).catch(() => {
          set((state) => ({
            comments: state.comments.filter(c => c.id !== commentId)
          }));
        });
      },

      likeComment: (commentId, userEmail) => {
        likeCommentDb(commentId, userEmail).catch(() => {
          set((state) => ({
            comments: state.comments.map(c => {
              if (c.id !== commentId) return c;
              const isLiked = c.likedBy.includes(userEmail);
              const newLikedBy = isLiked ? c.likedBy.filter(e => e !== userEmail) : [...c.likedBy, userEmail];
              return {
                ...c,
                likedBy: newLikedBy,
                likes: isLiked ? c.likes - 1 : c.likes + 1
              };
            })
          }));
        });
      },

      pinComment: (commentId, isPinned) => {
        pinCommentDb(commentId, isPinned).catch(() => {
          set((state) => ({
            comments: state.comments.map(c => c.id === commentId ? { ...c, pinned: isPinned } : c)
          }));
        });
      },

      reportComment: (commentId) => {
        reportCommentDb(commentId).catch(() => {
          set((state) => ({
            comments: state.comments.map(c => c.id === commentId ? { ...c, reported: true } : c)
          }));
        });
      },

      // REPLIES (NESTED COMMENT LAYER)
      addReply: (commentId, username, email, avatar, body) => {
        const resolvedAvatar = avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`;
        addReplyDb(commentId, username, email, resolvedAvatar, body).catch(() => {
          set((state) => {
            const newReply: Reply = {
              id: `rep-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              commentId,
              username,
              email,
              avatar: resolvedAvatar,
              body,
              timestamp: Date.now(),
              likes: 0,
              likedBy: []
            };
            return {
              comments: state.comments.map(c => {
                if (c.id !== commentId) return c;
                return { ...c, replies: [...c.replies, newReply] };
              })
            };
          });
        });
      },

      likeReply: (commentId, replyId, userEmail) => {
        likeReplyDb(commentId, replyId, userEmail).catch(() => {
          set((state) => ({
            comments: state.comments.map(c => {
              if (c.id !== commentId) return c;
              return {
                ...c,
                replies: c.replies.map(r => {
                  if (r.id !== replyId) return r;
                  const isLiked = r.likedBy.includes(userEmail);
                  const newLikedBy = isLiked ? r.likedBy.filter(e => e !== userEmail) : [...r.likedBy, userEmail];
                  return {
                    ...r,
                    likedBy: newLikedBy,
                    likes: isLiked ? r.likes - 1 : r.likes + 1
                  };
                })
              };
            })
          }));
        });
      },

      deleteReply: (commentId, replyId) => {
        deleteReplyDb(commentId, replyId).catch(() => {
          set((state) => ({
            comments: state.comments.map(c => {
              if (c.id !== commentId) return c;
              return {
                ...c,
                replies: c.replies.filter(r => r.id !== replyId)
              };
            })
          }));
        });
      }
    }),
    { name: 'anova-storage' }
  )
);
