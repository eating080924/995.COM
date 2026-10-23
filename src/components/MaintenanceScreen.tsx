import React, { useState } from 'react';
import { MaintenanceConfig } from '../types';
import { Wrench, Clock, ShieldCheck, RefreshCw, LogIn, Sparkles, CheckCircle2 } from 'lucide-react';
import { LoginModal } from './LoginModal';
import { useAuth } from '../lib/AuthContext';

interface MaintenanceScreenProps {
  config: MaintenanceConfig;
}

export function MaintenanceScreen({ config }: MaintenanceScreenProps) {
  const { user } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-amber-500 selection:text-white relative overflow-hidden font-sans">
      {/* Subtle background ambient gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-amber-500/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 right-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <img 
            src="logo.png" 
            alt="995 委託板" 
            className="w-28 h-auto object-contain brightness-110 drop-shadow-md" 
          />
        </div>

        <div>
          {!user ? (
            <button
              onClick={() => setShowLoginModal(true)}
              className="text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <LogIn size={13} className="text-amber-400" />
              <span>內部人員 / 管理員入口</span>
            </button>
          ) : (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span>已登入：{user.email || user.displayName}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl mx-auto px-6 py-10 flex-1 flex flex-col justify-center items-center text-center relative z-10">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-black tracking-wide uppercase mb-6 shadow-inner animate-pulse">
          <Wrench size={14} className="text-amber-400" />
          <span>系統升級與例行維護進行中</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-4 leading-snug">
          {config.title || '系統維護中，馬上回來！'}
        </h1>

        {/* Message */}
        <p className="text-sm sm:text-base text-slate-300 max-w-lg leading-relaxed mb-8 font-normal">
          {config.message || '為了提供更優質穩定的鄰里互助體驗，995 委託板團隊目前正在進行伺服器升級與例行維護。'}
        </p>

        {/* Estimated Time Card (if present) */}
        {config.estimatedEndTime && (
          <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 mb-8 shadow-xl backdrop-blur-sm flex items-center justify-between text-left">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">預計恢復時間</p>
                <p className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                  {config.estimatedEndTime}
                </p>
              </div>
            </div>
            <span className="text-[10px] bg-slate-700/80 text-amber-300 font-bold px-2.5 py-1 rounded-full border border-slate-600/50">
              維護期間
            </span>
          </div>
        )}

        {/* Security & Data Safety Assurances */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md mb-8 text-left">
          <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-3 flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">資料安全妥善保存</span>
              <span className="text-slate-400 text-[11px]">所有委託紀錄與帳號信用均妥善備份，請安心等待。</span>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-3 flex items-start gap-2.5">
            <Sparkles size={16} className="text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">服務即時自動恢復</span>
              <span className="text-slate-400 text-[11px]">升級作業完成後，平台將第一時間自動對外重啟開放。</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full sm:w-auto px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm tracking-wide shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-75"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? '正在重新檢查...' : '重新整理檢查狀態'}</span>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-6 text-center text-xs text-slate-500 relative z-10 border-t border-slate-800/80">
        <p>© 2026 995 委託板・守護每一份鄰里互助的力量</p>
      </footer>

      {/* Login modal for admins / testers to authenticate and bypass */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
}
