// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../lib/firebase';
import { ref, push, onValue } from 'firebase/database';
import { X, MessageCircle, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function ChatSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    const msgsRef = ref(db, 'messages');
    const unsub = onValue(msgsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.values(data).sort((a: any, b: any) => a.time - b.time);
        setMessages(msgs);
        setTimeout(() => {
          if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }, 100);
      }
    });
    return () => unsub();
  }, []);

  const sendMsg = () => {
    if (!input.trim()) return;
    push(ref(db, 'messages'), {
      text: input.trim(),
      user: localStorage.getItem('user') || 'Guest',
      email: localStorage.getItem('email') || 'guest@mail.com',
      time: Date.now()
    });
    setInput('');
  };

  const getBadge = (email: string) => email === 'mdido406@gmail.com' ? '👑 ADMIN' : '';

  if (location.pathname === '/') return null;

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 rounded-full bg-primary text-black z-50 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
      >
        <MessageCircle size={24} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 w-80 sm:w-96 h-screen bg-[#0b0b0b] border-l border-primary/20 flex flex-col z-[100]"
          >
            <div className="p-4 bg-[#111] border-b border-primary/20 flex justify-between items-center">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <MessageCircle size={18} />
                AniStream Chat
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className="bg-[#111] p-3 rounded-xl break-words">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-primary text-sm">{msg.user}</span>
                    <span className="text-xs text-yellow-400">{getBadge(msg.email)}</span>
                  </div>
                  <p className="text-sm text-gray-200">{msg.text}</p>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-primary/20 bg-[#111] flex gap-2">
              <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMsg()}
                placeholder="Type a message..."
                className="flex-1 bg-black border border-primary/30 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary"
              />
              <button 
                onClick={sendMsg}
                className="bg-primary text-black px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
