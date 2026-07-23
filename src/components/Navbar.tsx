import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { LogIn, LogOut, User as UserIcon, PlusCircle, Radio } from 'lucide-react';
import { LoginModal } from './LoginModal';
import { NotificationDropdown } from './NotificationDropdown';

interface NavbarProps {
  onNewTask: () => void;
  onNewBroadcast: () => void;
  onGoHome?: () => void;
}

export function Navbar({ onNewTask, onNewBroadcast, onGoHome }: NavbarProps) {
  const { user, logout } = useAuth();
  const [showLoginModal, setShowLoginModal] = React.useState(false);

  // 偵測是否為手機/行動裝置（含螢幕翻轉橫向 mode）
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    const userAgentMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const isSmallWidth = window.innerWidth < 768;
    const isLandscapePhone = window.innerHeight < 500 && (window.innerWidth < 1024 || isCoarsePointer);
    return userAgentMobile || isSmallWidth || isLandscapePhone;
  });

  React.useEffect(() => {
    const checkIsMobile = () => {
      const userAgentMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const isSmallWidth = window.innerWidth < 768;
      const isLandscapePhone = window.innerHeight < 500 && (window.innerWidth < 1024 || isCoarsePointer);
      setIsMobile(userAgentMobile || isSmallWidth || isLandscapePhone);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsIsMobileOrResize);
    window.addEventListener('orientationchange', checkIsIsMobileOrResize);
    return () => {
      window.removeEventListener('resize', checkIsIsMobileOrResize);
      window.removeEventListener('orientationchange', checkIsIsMobileOrResize);
    };

    function checkIsIsMobileOrResize() {
      checkIsMobile();
    }
  }, []);

  return (
    <header className="flex items-center justify-between px-4 md:px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-40">
      <div 
        className="flex items-center gap-3 cursor-pointer group"
        onClick={onGoHome}
      >
        <img 
          src="logo.png" 
          alt="995 委託板" 
          className="w-30 h-20 object-contain transition-transform group-hover:scale-105 active:scale-95" 
        />
        <div>
          <p className="hidden xs:block text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Urgent Task Marketplace</p>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        {user ? (
          <div className="flex items-center gap-4">
            {/* 手機/行動裝置 (Mobile Device or Mobile Viewport): 發佈廣播 */}
            {isMobile ? (
              <button 
                onClick={onNewBroadcast}
                className="ml-2.5 flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-full font-bold shadow-md transition-all flex items-center gap-1.5 transform active:scale-95"
              >
                <Radio className="w-4 h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">發佈廣播</span>
              </button>
            ) : (
              /* 桌上型電腦 (Desktop): 發佈任務 */
              <button 
                onClick={onNewTask}
                className="ml-2.5 flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 text-xs sm:px-5 sm:py-2 bg-slate-900 text-white rounded-full font-bold shadow-md hover:bg-slate-800 transition-all flex items-center gap-1.5 transform active:scale-95"
              >
                <PlusCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex-shrink-0" />
                <span className="whitespace-nowrap">發佈任務</span>
              </button>
            )}

            <div className="flex items-center gap-3 ml-2 border-l pl-4 border-slate-100">
              <NotificationDropdown />
              <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={18} className="text-slate-400" />
                )}
              </div>
              <button
                onClick={logout}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="登出"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-6 py-2.5 bg-red-500 text-white rounded-full text-sm font-bold shadow-md hover:bg-red-600 transition-all active:scale-95 flex items-center gap-2"
          >
            <LogIn size={18} />
            <span>登入</span>
          </button>
        )}
      </div>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </header>
  );
}
