import React from 'react';
import { Facebook, MessageSquare, Handshake, Heart, ShieldAlert } from 'lucide-react';

export function CommunityLinks() {
  return (
    <div className="space-y-4">
      {/* 官方反饋與粉專連結 Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Facebook size={16} className="text-blue-500 fill-current" />
          <span>官方社群 & 問題反饋</span>
        </h3>
        
        <a 
          href="https://www.facebook.com/profile.php?id=61590303886948" 
          target="_blank" 
          rel="noopener noreferrer"
          className="group flex items-start gap-3 p-3 bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded-xl transition-all active:scale-98"
        >
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <MessageSquare size={16} className="fill-current" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
              995 委託板 官方粉絲專頁
            </h4>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              任何建議與系統問題反饋，歡迎前往官粉私訊我們！您的支持是我們的動力。
            </p>
          </div>
        </a>
      </div>

      {/* 友情合作推廣 Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Handshake size={16} className="text-amber-500" />
          <span>特別合作夥伴</span>
        </h3>
        
        <div className="space-y-2.5">
          {/* Logo 1: 尼口尼口 */}
          <a 
            href="https://www.facebook.com/profile.php?id=61570854907110" 
            target="_blank" 
            rel="noopener noreferrer"
            className="group flex items-center justify-between p-2.5 bg-slate-50 hover:bg-amber-50/30 border border-slate-100 hover:border-amber-100 rounded-xl transition-all"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-black text-xs shrink-0">
                🐶
              </div>
              <div className="text-left">
                <h4 className="text-[11px] font-bold text-slate-800 group-hover:text-amber-700 transition-colors">
                  尼口尼口 NicoNico 寵物精緻美容&旅館
                </h4>
                <p className="text-[9px] text-slate-400 font-medium">寵物美容、住宿與精緻沙龍 - 台中</p>
              </div>
            </div>
            <Facebook size={14} className="text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </a>

          {/* Logo 2: 裕程空間設計 */}
          <a 
            href="https://www.facebook.com/profile.php?id=61569581325517" 
            target="_blank" 
            rel="noopener noreferrer"
            className="group flex items-center justify-between p-2.5 bg-slate-50 hover:bg-sky-50/30 border border-slate-100 hover:border-sky-100 rounded-xl transition-all"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center font-black text-xs shrink-0">
                📐
              </div>
              <div className="text-left">
                <h4 className="text-[11px] font-bold text-slate-800 group-hover:text-sky-700 transition-colors">
                  裕程空間設計
                </h4>
                <p className="text-[9px] text-slate-400 font-medium">專業室內空間設計與品質施工裝修</p>
              </div>
            </div>
            <Facebook size={14} className="text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </a>

          {/* Logo 3: 三億31 */}
          <a 
            href="https://www.facebook.com/profile.php?id=61569989463472" 
            target="_blank" 
            rel="noopener noreferrer"
            className="group flex items-center justify-between p-2.5 bg-slate-50 hover:bg-emerald-50/30 border border-slate-100 hover:border-emerald-100 rounded-xl transition-all"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black text-xs shrink-0">
                🥩
              </div>
              <div className="text-left">
                <h4 className="text-[11px] font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">
                  三億31 生鮮熟食
                </h4>
                <p className="text-[9px] text-slate-400 font-medium">新鮮優質生鮮食材與精緻美味熟食批發</p>
              </div>
            </div>
            <Facebook size={14} className="text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
}
