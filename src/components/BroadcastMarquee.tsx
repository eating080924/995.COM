import React, { useEffect, useState, useRef } from 'react';
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
  const [screenCenterBroadcast, setScreenCenterBroadcast] = useState<Broadcast | null>(null);
  const DEFAULT_MESSAGE = "歡迎使用 995 委託板 —— 互助互惠，世界和平！";

  // Keep track of broadcast IDs that have already been displayed in the center pop-up in this session
  const poppedUpIds = useRef<Set<string>>(new Set());

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

  // Monitor for brand new broadcasts to pop them up in the middle of the screen
  useEffect(() => {
    if (broadcasts.length === 0) return;

    const nowMs = Date.now();
    // A brand new broadcast has a very recent createdAt (within 15 seconds)
    // and hasn't been popped up yet in this session.
    const newBroadcast = broadcasts.find(b => {
      if (poppedUpIds.current.has(b.id)) return false;
      const createdAtMs = b.createdAt?.toDate 
        ? b.createdAt.toDate().getTime() 
        : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return Math.abs(nowMs - createdAtMs) < 15000;
    });

    if (newBroadcast) {
      poppedUpIds.current.add(newBroadcast.id);
      setScreenCenterBroadcast(newBroadcast);
      
      const timer = setTimeout(() => {
        setScreenCenterBroadcast(null);
      }, 3000); // Display for 3 seconds

      return () => clearTimeout(timer);
    }
  }, [broadcasts]);

  const currentItem = activeBroadcast;

  return (
    <div className={cn(
      "relative py-3.5 shadow-xl overflow-hidden transition-all duration-500 border-b",
      currentItem 
        ? "bg-gradient-to-r from-slate-950 via-red-950 to-slate-950 border-red-500/30 shadow-[0_4px_25px_rgba(239,68,68,0.15)]" 
        : "bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-slate-800 shadow-[0_4px_15px_rgba(0,0,0,0.1)]"
    )}>
      {/* Animated glowing accent line at the bottom */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-500 bg-gradient-to-r",
        currentItem 
          ? "from-transparent via-red-500 to-transparent animate-pulse" 
          : "from-transparent via-blue-500/40 to-transparent"
      )} />

      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between gap-4 relative z-10">
        
        {/* Left Side: Badge + Live Indicator */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Real-time pulsing status indicator */}
          <span className="relative flex h-2 w-2">
            <span className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              currentItem ? "bg-red-400" : "bg-blue-400"
            )}></span>
            <span className={cn(
              "relative inline-flex rounded-full h-2 w-2",
              currentItem ? "bg-red-500" : "bg-blue-500"
            )}></span>
          </span>

          {/* Broadcast Tag - High Contrast Yellow Badge with Retro Shadow */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all shadow-sm",
            currentItem 
              ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 border border-amber-300 animate-pulse" 
              : "bg-slate-800 text-slate-300 border border-slate-700"
          )}>
            <Megaphone size={13} className={cn("fill-current", currentItem && "animate-bounce")} />
            <span>廣  播</span>
          </div>
        </div>
        
        {/* Middle: Content */}
        <div className="flex-1 overflow-hidden relative min-h-[1.5rem] flex items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem ? currentItem.id : 'default'}
              initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className="flex items-center gap-3 w-full"
            >
              <span className={cn(
                "font-bold text-sm tracking-wide line-clamp-1 transition-colors duration-300",
                currentItem 
                  ? "text-yellow-200 drop-shadow-[0_2px_8px_rgba(253,224,71,0.2)] font-black text-sm md:text-base" 
                  : "text-slate-200"
              )}>
                {currentItem ? currentItem.content : DEFAULT_MESSAGE}
              </span>
              
              {currentItem && (
                <span className="text-[10px] md:text-xs text-red-300 bg-red-950/40 border border-red-900/40 px-2 py-0.5 rounded-md font-semibold shrink-0 hidden sm:inline-flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-red-400 animate-ping" />
                  由 {currentItem.userName || '匿名'} 廣播 ({formatTimeAgo(currentItem.createdAt?.toDate ? currentItem.createdAt.toDate() : new Date())})
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Side: Active Dot Indicator List */}
        {broadcasts.length > 0 && (
          <div className="flex gap-1.5 shrink-0 bg-black/20 px-2 py-1.5 rounded-full border border-white/5">
            {broadcasts.map((b) => (
              <div 
                key={b.id} 
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300",
                  currentItem?.id === b.id 
                    ? "bg-amber-400 scale-125 shadow-[0_0_8px_#f59e0b]" 
                    : (shownIds.has(b.id) ? "bg-white/10" : "bg-white/40")
                )} 
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Atmospheric highlight glow in background */}
      <div className={cn(
        "absolute inset-0 opacity-15 pointer-events-none transition-all duration-500",
        currentItem 
          ? "bg-[radial-gradient(circle_at_50%_50%,_rgba(239,68,68,0.2),_transparent_60%)]" 
          : "bg-[radial-gradient(circle_at_50%_50%,_rgba(59,130,246,0.1),_transparent_60%)]"
      )} />

      {/* Screen-Center Transient Overlay for New Broadcasts */}
      <AnimatePresence>
        {screenCenterBroadcast && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none px-4">
            {/* Semi-transparent blur overlay with pointer events */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm pointer-events-auto cursor-pointer"
              onClick={() => setScreenCenterBroadcast(null)} // Manual close on click
            />
            
            {/* Elegant glassmorphism alert card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-[0_20px_50px_rgba(239,68,68,0.35)] border border-red-500/30 overflow-hidden pointer-events-auto"
            >
              {/* Animated ambient pulse backgrounds */}
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-red-600/10 rounded-full blur-3xl animate-pulse" />
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
              
              {/* 3-second animated countdown timing indicator */}
              <motion.div 
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 3, ease: "linear" }}
                className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-amber-400 via-red-500 to-amber-400"
              />

              <div className="flex flex-col items-center text-center space-y-4">
                {/* Yellow/Amber Badge */}
                <div className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-[0_4px_12px_rgba(245,158,11,0.3)] animate-bounce">
                  <Megaphone size={14} className="fill-current" />
                  <span>尬  廣</span>
                </div>

                {/* Broadcast Content */}
                <p className="text-base md:text-lg font-black text-yellow-100 tracking-wide leading-relaxed px-2 break-words">
                  「 {screenCenterBroadcast.content} 」
                </p>

                {/* Publisher Details */}
                <div className="flex items-center gap-2 text-slate-400 text-xs justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                  <span>廣播發佈者：</span>
                  <span className="font-bold text-slate-200">{screenCenterBroadcast.userName || '匿名'}</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
