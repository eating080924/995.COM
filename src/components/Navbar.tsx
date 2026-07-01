import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { LogIn, LogOut, User as UserIcon, PlusCircle, Radio } from 'lucide-react';
import { LoginModal } from './LoginModal';
import { NotificationDropdown } from './NotificationDropdown';

interface NavbarProps {
  onNewTask: () => void;
  onNewBroadcast: () => void;
  activeTab: 'all' | 'open' | 'accepted' | 'my-tasks';
  setActiveTab: (tab: 'all' | 'open' | 'accepted' | 'my-tasks') => void;
}

export function Navbar({ onNewTask, onNewBroadcast, activeTab, setActiveTab }: NavbarProps) {
  const { user, logout } = useAuth();
  const [showLoginModal, setShowLoginModal] = React.useState(false);

  const isHomeActive = activeTab !== 'my-tasks';
  const isMyTasksActive = activeTab === 'my-tasks';

  return (
    <header className="flex items-center justify-between px-4 md:px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <img 
          src="./logo_index.png" 
          alt="995 委託板" 
          className="w-30 h-20 object-contain" 
        />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
             <span className="text-black-500 decoration-2 underline-offset-4"> 《找到屬於你的超人》</span>
          </h1>
          <p className="hidden xs:block text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Urgent Task Marketplace</p>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <nav className="hidden lg:flex gap-8">
          <button 
            onClick={() => setActiveTab('all')}
            className={`text-sm font-semibold transition-colors ${isHomeActive ? 'text-red-500' : 'text-slate-500 hover:text-red-500'}`}
          >
            尋找任務
          </button>
          {user && (
            <button 
              onClick={() => setActiveTab('my-tasks')}
              className={`text-sm font-semibold transition-colors ${isMyTasksActive ? 'text-red-500' : 'text-slate-500 hover:text-red-500'}`}
            >
              我的任務
            </button>
          )}
        </nav>
        
        {user ? (
          <div className="flex items-center gap-4">
            <button
              onClick={onNewBroadcast}
              className="p-2 text-amber-600 hover:bg-amber-50 rounded-full transition-colors hidden sm:flex items-center gap-1 text-xs font-bold"
            >
              <Radio size={18} />
              <span>尬廣</span>
            </button>
            <button 
              onClick={onNewTask}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-sm font-bold shadow-md hover:bg-slate-800 transition-all flex items-center gap-2 transform active:scale-95"
            >
              <PlusCircle size={18} />
              <span className="hidden xs:inline">發佈需求</span>
            </button>
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
