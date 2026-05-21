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
  const [shownIds, setShownIds] = useState<Set<string>>(new Set());
  const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null);
  const DEFAULT_MESSAGE = "歡迎使用 995 委託板 —— 互助互惠，世界和平！";

  useEffect(() => {
    const now = Timestamp.now();
    const q = query(
      collection(db, 'broadcasts'),
      where('activeUntil', '>', now),
      orderBy('createdAt', 'asc') // Show older ones first
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Broadcast[];
      setBroadcasts(docs);
    }, (error) => {
      console.warn('BroadcastMarquee onSnapshot subscription error (client may be offline/connecting):', error);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Find the first broadcast that hasn't been shown yet
    const nextUnseen = broadcasts.find(b => !shownIds.has(b.id));

    if (nextUnseen) {
      setActiveBroadcast(nextUnseen);
      
      const timer = setTimeout(() => {
        setShownIds(prev => new Set(prev).add(nextUnseen.id));
        setActiveBroadcast(null);
      }, 10000);

      return () => clearTimeout(timer);
    } else {
      setActiveBroadcast(null);
    }
  }, [broadcasts, shownIds]);

  const currentItem = activeBroadcast;

  return (
    <div className="bg-red-600 text-white py-3 shadow-lg relative overflow-hidden transition-colors">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-4">
        <div className="flex items-center gap-2 bg-red-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter shrink-0">
          <Megaphone size={14} className="fill-current animate-bounce" />
          <span>廣播</span>
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

        {broadcasts.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {broadcasts.map((b) => (
              <div 
                key={b.id} 
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  currentItem?.id === b.id ? "bg-white scale-125 shadow-glow" : (shownIds.has(b.id) ? "bg-white/10" : "bg-white/40")
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
