import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { LogIn, LogOut, User as UserIcon, PlusCircle, Wrench } from 'lucide-react';
import { LoginModal } from './LoginModal';
import { NotificationDropdown } from './NotificationDropdown';
import { isSystemAdminEmail } from '../config/admin';

interface NavbarProps {
  onNewTask: () => void;
  onNewBroadcast: () => void;
  onGoHome?: () => void;
  onOpenMaintenanceAdmin?: () => void;
  isMaintenanceActive?: boolean;
}

export function Navbar({ onNewTask, onNewBroadcast, onGoHome, onOpenMaintenanceAdmin, isMaintenanceActive }: NavbarProps) {
  const { user, logout } = useAuth();
  const [showLoginModal, setShowLoginModal] = React.useState(false);
  const isAdmin = isSystemAdminEmail(user?.email);

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
      
      <div className="flex items-center gap-3 sm:gap-6">
        {user ? (
          <div className="flex items-center gap-2 sm:gap-4">
            {isAdmin && onOpenMaintenanceAdmin && (
              <button
                onClick={onOpenMaintenanceAdmin}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm active:scale-95 cursor-pointer ${
                  isMaintenanceActive
                    ? 'bg-amber-500 text-slate-950 border-amber-600 animate-pulse'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
                title="停機維護控制台"
              >
                <Wrench size={13} className={isMaintenanceActive ? 'text-slate-950' : 'text-slate-600'} />
                <span className="hidden sm:inline">{isMaintenanceActive ? '維護中 (管理)' : '維護設定'}</span>
              </button>
            )}

            <button 
              onClick={onNewTask}
              className="hidden md:flex [@media(max-height:500px)]:!hidden ml-1 sm:ml-2.5 flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 text-xs sm:px-5 sm:py-2 bg-slate-900 text-white rounded-full font-bold shadow-md hover:bg-slate-800 transition-all items-center gap-1.5 transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex-shrink-0" />
              <span className="whitespace-nowrap">發佈任務</span>
            </button>
            <div className="flex items-center gap-3 ml-1 sm:ml-2 border-l pl-3 sm:pl-4 border-slate-100">
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
