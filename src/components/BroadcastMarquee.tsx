import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Broadcast } from '../types';
import { formatTimeAgo } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Megaphone } from 'lucide-react';
import { cn } from '../lib/utils';

export function BroadcastMarquee() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const DEFAULT_MESSAGE = "歡迎使用出事啦 995.COM —— 互助互惠，共創溫暖社區！";

  useEffect(() => {
    const now = Timestamp.now();
    const q = query(
      collection(db, 'broadcasts'),
      where('activeUntil', '>', now),
      orderBy('activeUntil', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Broadcast[];

      setBroadcasts(prevDocs => {
        const prevIds = prevDocs.map(d => d.id).join(',');
        const nextIds = docs.map(d => d.id).join(',');
        if (prevIds !== nextIds) {
          setCurrentIndex(0);
          return docs;
        }
        return prevDocs;
      });
    });

    return () => unsubscribe();
  }, []);

  // Cycle through broadcasts + default message
  const displayItems = broadcasts.length > 0 ? [...broadcasts, null] : [null];

  useEffect(() => {
    if (displayItems.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayItems.length);
    }, 10000);

    return () => clearInterval(timer);
  }, [displayItems.length]);

  const currentItem = displayItems[currentIndex];

  return (
    <div className="bg-red-600 text-white py-3 shadow-lg relative overflow-hidden transition-colors">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-4">
        <div className="flex items-center gap-2 bg-red-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter shrink-0">
          <Megaphone size={14} className="fill-current animate-bounce" />
          <span>緊急廣播</span>
        </div>
        
        <div className="flex-1 overflow-hidden relative min-h-[1.5rem] flex items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem ? currentItem.id : 'default'}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-4 w-full"
            >
              <span className="font-bold text-sm tracking-tight line-clamp-1">
                {currentItem ? currentItem.content : DEFAULT_MESSAGE}
              </span>
              {currentItem && (
                <span className="text-[10px] opacity-60 font-medium shrink-0 hidden sm:inline">
                  — {currentItem.userName} ({formatTimeAgo(currentItem.createdAt?.toDate ? currentItem.createdAt.toDate() : new Date())})
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {displayItems.length > 1 && (
          <div className="flex gap-1 shrink-0">
            {displayItems.map((_, i) => (
              <div 
                key={i} 
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  i === currentIndex ? "bg-white scale-125 shadow-glow" : "bg-white/30"
                )} 
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Background flare */}
      <div className="absolute inset-0 bg-white/5 pointer-events-none" />
    </div>
  );
}
