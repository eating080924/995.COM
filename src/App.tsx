/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Navbar } from './components/Navbar';
import { BroadcastMarquee } from './components/BroadcastMarquee';
import { TaskList } from './components/TaskList';
import { TaskForm } from './components/TaskForm';
import { BroadcastForm } from './components/BroadcastForm';
import { Sparkles, PlusCircle, User as UserIcon, Search } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { performTaskCleanup } from './lib/taskCleanup';
import { LoginModal } from './components/LoginModal';

function AppContent() {
  const { user } = useAuth();
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showBroadcastForm, setShowBroadcastForm] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'open' | 'accepted' | 'my-tasks'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
  } | null>(null);

  React.useEffect(() => {
    // Run task cleanup when user logs in
    if (user) {
      performTaskCleanup(user.uid);
    }
  }, [user]);

  React.useEffect(() => {
    if (!user && activeTab === 'my-tasks') {
      setActiveTab('all');
    }
  }, [user, activeTab]);

  const requireLogin = (action: () => void) => {
    if (user) {
      action();
    } else {
      setAlertConfig({
        title: '請先登入',
        message: '在使用委託任務或廣播功能之前，請先登入您的帳戶。'
      });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans overflow-x-hidden">
      <Navbar 
        onNewTask={() => requireLogin(() => setShowTaskForm(true))} 
        onNewBroadcast={() => requireLogin(() => setShowBroadcastForm(true))}
        activeTab={activeTab === 'my-tasks' ? 'my-tasks' : 'all'}
        setActiveTab={(tab) => setActiveTab(tab as any)}
      />
      
      <BroadcastMarquee />
      
      <main className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-8 p-4 md:p-8">
        {/* Sidebar */}
        <aside className="md:col-span-3 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">功能選單</h3>
            <div className="space-y-1">
              <button 
                onClick={() => setActiveTab('all')}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'all' ? 'bg-red-50 text-red-600' : 'hover:bg-slate-50 text-slate-600'}`}
              >
                全部任務
              </button>
              <button 
                onClick={() => setActiveTab('open')}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'open' ? 'bg-red-50 text-red-600' : 'hover:bg-slate-50 text-slate-600'}`}
              >
                開放中
              </button>
              <button 
                onClick={() => setActiveTab('accepted')}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'accepted' ? 'bg-red-50 text-red-600' : 'hover:bg-slate-50 text-slate-600'}`}
              >
                進行中
              </button>
              {user && (
                <div className="pt-2 mt-2 border-t border-slate-100">
                  <button 
                    onClick={() => setActiveTab('my-tasks')}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'my-tasks' ? 'bg-red-50 text-red-600' : 'hover:bg-slate-50 text-slate-600'}`}
                  >
                    個人委託
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl text-white relative overflow-hidden shadow-xl">
            <div className="relative z-10">
              <h4 className="text-xs font-bold opacity-60 uppercase mb-1 tracking-wider">推廣您的需求</h4>
              <p className="text-sm font-medium mb-5 leading-relaxed">想要任務更快完成？使用廣播功能讓全站看見！</p>
              <button 
                onClick={() => requireLogin(() => setShowBroadcastForm(true))}
                className="w-full py-3 bg-amber-400 text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-500 transition-colors transform active:scale-95 shadow-lg"
              >
                立 即 發 佈 廣 播
              </button>
            </div>
            <div className="absolute -bottom-6 -right-6 opacity-10">
              <Sparkles size={120} />
            </div>
          </div>
          
          <div className="hidden md:block p-4">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest text-center">© 2026 995 委託板</p>
          </div>
        </aside>

        {/* Task Feed */}
        <section className="md:col-span-9 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <div className="flex-1">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                {activeTab === 'all' ? '尋找委託任務' : '追蹤我的需求'}
              </h2>
              {activeTab === 'all' && (
                <div className="mt-4 relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="搜尋內容、地點、或任務編號..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>

          <TaskList filter={activeTab} searchQuery={searchQuery} />
        </section>
      </main>

      {/* PWA style Bottom Nav for mobile */}
      <nav className="md:hidden bg-white border-t border-slate-200 flex justify-around items-center h-20 sticky bottom-0 z-40 px-2 pb-safe">
        <button onClick={() => setActiveTab('all')} className={`flex flex-col items-center gap-1 group transition-colors ${activeTab !== 'my-tasks' ? 'text-red-500' : 'text-slate-400'}`}>
          <Sparkles size={22} fill={activeTab !== 'my-tasks' ? 'currentColor' : 'none'} />
          <span className="text-[10px] font-bold">主頁</span>
        </button>
        <div className="flex flex-col items-center gap-1 group relative">
          <button 
            onClick={() => setShowTaskForm(true)}
            className="-mt-12 w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg border-4 border-white transform active:scale-90 transition-transform"
          >
            <PlusCircle size={28} strokeWidth={3} />
          </button>
          <span className="text-[10px] font-bold text-slate-400">發佈</span>
        </div>
        <button 
          onClick={() => requireLogin(() => setActiveTab('my-tasks'))} 
          className={`flex flex-col items-center gap-1 group transition-colors ${activeTab === 'my-tasks' ? 'text-red-500' : 'text-slate-400'}`}
        >
          <UserIcon size={22} fill={activeTab === 'my-tasks' ? 'currentColor' : 'none'} />
          <span className="text-[10px] font-bold">個人</span>
        </button>
      </nav>

      {showTaskForm && (
        <TaskForm onClose={() => setShowTaskForm(false)} />
      )}
      
      {showBroadcastForm && (
        <BroadcastForm onClose={() => setShowBroadcastForm(false)} />
      )}

      {alertConfig && (
        <ConfirmDialog
          isOpen={true}
          title={alertConfig.title}
          message={alertConfig.message}
          onConfirm={() => {
            setAlertConfig(null);
            setShowLoginModal(true);
          }}
          onCancel={() => setAlertConfig(null)}
          cancelText="關閉"
          confirmText="立即登入"
        />
      )}

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
