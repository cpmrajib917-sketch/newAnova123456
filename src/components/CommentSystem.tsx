// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Heart, Reply, Trash2, Pin, AlertTriangle, Send, Lock, UserCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ref, get } from 'firebase/database';
import { db } from '../lib/firebase';
import { sanitizeEmail } from '../lib/firebaseSync';

interface CommentSystemProps {
  animeId: string;
  episodeNumber?: number;
}

export function CommentSystem({ animeId, episodeNumber }: CommentSystemProps) {
  const { 
    comments, 
    addComment, 
    deleteComment, 
    likeComment, 
    pinComment, 
    reportComment, 
    addReply, 
    likeReply, 
    deleteReply 
  } = useAppStore();

  const [newCommentText, setNewCommentText] = useState('');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [activeReplyBoxId, setActiveReplyBoxId] = useState<string | null>(null);
  const [isBanned, setIsBanned] = useState(false);

  // Authenticated user status retrieved from localStorage
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const currentUserEmail = localStorage.getItem('userEmail') || '';
  const currentUserRole = localStorage.getItem('userRole') || 'user';
  const currentUsername = currentUserEmail ? currentUserEmail.split('@')[0] : 'Guest';
  const isAdmin = isLoggedIn && (currentUserRole === 'admin' || currentUserEmail.trim().toLowerCase() === 'mdido406@gmail.com');

  useEffect(() => {
    if (isLoggedIn && currentUserEmail) {
      const sanitized = sanitizeEmail(currentUserEmail);
      get(ref(db, `users/${sanitized}`)).then(snap => {
        if (snap.exists() && snap.val().banned === true) {
          setIsBanned(true);
        }
      }).catch(err => console.warn("Failed to check user ban status:", err));
    }
  }, [isLoggedIn, currentUserEmail]);

  // Filter comments for this specific anime
  const filteredComments = comments.filter(c => c.animeId === animeId);

  // Sort comments: pinned items first, then descending by timestamp
  const sortedComments = [...filteredComments].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp - a.timestamp;
  });

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    
    // Default avatar
    const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUsername}`;
    
    addComment(animeId, episodeNumber, currentUsername, currentUserEmail, avatar, newCommentText.trim());
    setNewCommentText('');
  };

  const handlePostReply = (commentId: string) => {
    const text = replyInputs[commentId];
    if (!text || !text.trim()) return;

    const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUsername}`;
    
    addReply(commentId, currentUsername, currentUserEmail, avatar, text.trim());
    
    // Clear reply input
    setReplyInputs(prev => ({ ...prev, [commentId]: '' }));
    setActiveReplyBoxId(null);
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/5 pb-4">
        <h3 className="text-base md:text-lg font-black text-white tracking-tight flex items-center gap-2">
          Discussion Zone ({filteredComments.length})
        </h3>
        <p className="text-xs text-gray-400 mt-1">Share your thoughts or episode predictions with the AnOvA community.</p>
      </div>

      {/* 1. Comment Input or Login lock block */}
      {isLoggedIn ? (
        isBanned ? (
          <div className="p-5 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-3 backdrop-blur-md">
            <Lock size={16} className="text-red-500 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-extrabold uppercase tracking-wide">Commenting Permissions Suspended</p>
              <p className="text-gray-400 text-[10px]">Your account has been restricted from participating in the discussion boards by an administrator.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePostComment} className="flex gap-4 bg-[#0a0d14]/40 p-4 rounded-xl border border-white/5">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary text-primary font-bold shrink-0">
              {currentUsername.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 space-y-3">
              <textarea
                rows={3}
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Join the discussion... Keep comments friendly!"
                className="w-full bg-[#03060c] border border-white/5 rounded-lg px-4 py-3 text-xs text-white focus:outline-none focus:border-primary/50 transition-colors placeholder:text-gray-500 resize-none"
              />
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500 font-semibold">Logged in as: <span className="text-primary">{currentUserEmail}</span></span>
                <button
                  type="submit"
                  disabled={!newCommentText.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-[#00cce0] text-black font-black text-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send size={12} />
                  POST
                </button>
              </div>
            </div>
          </form>
        )
      ) : (
        <div className="bg-[#050c18]/30 border border-cyan-500/10 p-6 rounded-xl text-center space-y-4 backdrop-blur-md relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-cyan-500/5 pointer-events-none" />
          <Lock className="mx-auto text-primary animate-pulse" size={28} />
          <div className="max-w-md mx-auto space-y-2">
            <h4 className="text-sm font-black text-white uppercase tracking-wider">Join the discussion</h4>
            <p className="text-xs text-gray-400">Only registered AnOvA Premium members can read and publish comments on release catalogs.</p>
          </div>
          <button 
            onClick={() => {
              // Trigger navbar Login Modal via window dispatch or instruction
              const loginBtn = document.querySelector('[title="Navigation Menu"]');
              if (loginBtn) {
                (loginBtn as HTMLElement).click();
              }
            }}
            className="px-6 py-2.5 bg-primary text-black font-black text-xs rounded-lg hover:shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all active:scale-95"
          >
            SIGN IN TO COMMENT
          </button>
        </div>
      )}

      {/* 2. Comments List container */}
      <div className="space-y-4">
        {sortedComments.length === 0 ? (
          <div className="py-12 text-center text-gray-500 bg-white/[0.01] rounded-xl border border-white/5 border-dashed">
            <p className="text-xs">No comments yet. Be the first to start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedComments.map((cmt) => {
              const hasLiked = cmt.likedBy.includes(currentUserEmail);
              const isOwner = cmt.email === currentUserEmail;

              return (
                <div 
                  key={cmt.id} 
                  className={cn(
                    "p-4 rounded-xl border transition-all space-y-3",
                    cmt.pinned 
                      ? "bg-[#0b1528]/40 border-primary/30" 
                      : "bg-[#070a10]/50 border-white/5"
                  )}
                >
                  {/* Pinned comment notification bar */}
                  {cmt.pinned && (
                    <div className="flex items-center gap-1.5 text-[10px] text-primary font-black uppercase tracking-wider">
                      <Pin size={10} className="fill-primary" />
                      Pinned by Administrator
                    </div>
                  )}

                  {/* Comment Body Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#10141f] border border-white/10 flex items-center justify-center font-bold text-white text-xs overflow-hidden shrink-0">
                        <img src={cmt.avatar || null} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-white">{cmt.username}</span>
                          
                          {/* Admin or VIP tag */}
                          {cmt.email === 'mdido406@gmail.com' && (
                            <span className="bg-primary/20 border border-primary/40 text-[8px] text-primary font-black px-1 py-0.5 rounded uppercase tracking-wider">Admin</span>
                          )}
                        </div>
                        <p className="text-[9px] text-gray-500 mt-0.5">{formatTime(cmt.timestamp)}</p>
                      </div>
                    </div>

                    {/* Actions button group (Pin, Report, Delete) */}
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <button
                          onClick={() => pinComment(cmt.id, !cmt.pinned)}
                          className={cn(
                            "p-1.5 rounded-lg transition-all",
                            cmt.pinned ? "text-primary bg-primary/10" : "text-gray-500 hover:text-white hover:bg-white/5"
                          )}
                          title={cmt.pinned ? "Unpin comment" : "Pin comment"}
                        >
                          <Pin size={13} className={cmt.pinned ? "fill-primary" : ""} />
                        </button>
                      )}

                      {(isOwner || isAdmin) && (
                        <button
                          onClick={() => deleteComment(cmt.id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Delete comment"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}

                      {!isOwner && isLoggedIn && (
                        <button
                          onClick={() => {
                            reportComment(cmt.id);
                            alert('Thank you. Comment has been reported for moderation.');
                          }}
                          className={cn(
                            "p-1.5 rounded-lg transition-all",
                            cmt.reported ? "text-yellow-500 bg-yellow-500/10" : "text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                          )}
                          title="Report comment"
                        >
                          <AlertTriangle size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Comment Text */}
                  <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap pl-12">
                    {cmt.body}
                  </p>

                  {/* Comment Action Footers (Like / Reply toggler) */}
                  <div className="flex items-center gap-4 pl-12 text-[10px] text-gray-400">
                    <button
                      onClick={() => isLoggedIn ? likeComment(cmt.id, currentUserEmail) : alert('Login to like comments')}
                      className={cn(
                        "flex items-center gap-1 hover:text-pink-500 transition-colors font-bold",
                        hasLiked && "text-pink-500"
                      )}
                    >
                      <Heart size={12} fill={hasLiked ? "currentColor" : "none"} />
                      <span>{cmt.likes} likes</span>
                    </button>

                    {isLoggedIn && (
                      <button
                        onClick={() => setActiveReplyBoxId(activeReplyBoxId === cmt.id ? null : cmt.id)}
                        className="flex items-center gap-1 hover:text-primary transition-colors font-bold"
                      >
                        <Reply size={12} />
                        <span>Reply</span>
                      </button>
                    )}
                  </div>

                  {/* Threaded Nested Replies list */}
                  {cmt.replies && cmt.replies.length > 0 && (
                    <div className="pl-12 mt-3 space-y-3 border-l border-white/5">
                      {cmt.replies.map((rep) => {
                        const repHasLiked = rep.likedBy.includes(currentUserEmail);
                        const repIsOwner = rep.email === currentUserEmail;

                        return (
                          <div key={rep.id} className="p-2.5 rounded-lg bg-white/[0.01] space-y-1.5 relative border border-transparent hover:border-white/5 transition-all">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-white/10 bg-[#10141f]">
                                  <img src={rep.avatar || null} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-bold text-gray-300">{rep.username}</span>
                                  {rep.email === 'mdido406@gmail.com' && (
                                    <span className="bg-primary/20 border border-primary/40 text-[7px] text-primary font-black px-1 rounded uppercase">Admin</span>
                                  )}
                                  <span className="text-[8px] text-gray-500">{formatTime(rep.timestamp)}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                {(repIsOwner || isAdmin) && (
                                  <button
                                    onClick={() => deleteReply(cmt.id, rep.id)}
                                    className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                    title="Delete reply"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </div>
                            </div>

                            <p className="text-[11px] text-gray-300 leading-relaxed pl-8">
                              {rep.body}
                            </p>

                            <div className="pl-8 text-[9px] text-gray-400 flex items-center gap-2">
                              <button
                                onClick={() => likeReply(cmt.id, rep.id, currentUserEmail)}
                                className={cn(
                                  "flex items-center gap-1 hover:text-pink-500 transition-colors font-bold",
                                  repHasLiked && "text-pink-500"
                                )}
                              >
                                <Heart size={10} fill={repHasLiked ? "currentColor" : "none"} />
                                <span>{rep.likes} likes</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Collapsible inline reply text area box */}
                  <AnimatePresence>
                    {activeReplyBoxId === cmt.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pl-12 pt-2"
                      >
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder={`Reply to ${cmt.username}...`}
                            value={replyInputs[cmt.id] || ''}
                            onChange={(e) => setReplyInputs({ ...replyInputs, [cmt.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handlePostReply(cmt.id);
                            }}
                            className="flex-1 bg-[#05080f] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50 transition-colors"
                          />
                          <button
                            onClick={() => handlePostReply(cmt.id)}
                            disabled={!(replyInputs[cmt.id] || '').trim()}
                            className="bg-primary text-black px-3 rounded-lg font-black text-xs hover:bg-[#00cce0] transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            <Send size={10} />
                            REPLY
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
