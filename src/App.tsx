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
import { Sparkles, PlusCircle, User as UserIcon, Search, Loader2, Home, Shield } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { performTaskCleanup } from './lib/taskCleanup';
import { LoginModal } from './components/LoginModal';
import { isInAppBrowser } from './lib/detector';
import { AccountPrivacyPanel } from './components/AccountPrivacyPanel';
import { CommunityLinks } from './components/CommunityLinks';
import { TASK_CATEGORIES, TAIWAN_REGIONS } from './config/achievements';


function AppContent() {
  const { user, loading } = useAuth();
  const [showInAppBanner, setShowInAppBanner] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showBroadcastForm, setShowBroadcastForm] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeTab, setActiveTab ] = useState<'all' | 'open' | 'accepted' | 'my-tasks' | 'privacy'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
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
    if (!user && (activeTab === 'my-tasks' || activeTab === 'privacy')) {
      setActiveTab('all');
    }
  }, [user, activeTab]);

  // Handle task linkage scrolling and highlighting from broadcasts
  React.useEffect(() => {
    const handleLinkToTask = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { taskId, taskNum } = customEvent.detail || {};
      if (!taskId) return;

      // 1. Reset filter tab to 'all' so the task is guaranteed to be in the list
      setActiveTab('all');
      
      // 2. Clear or set the search query to the taskNum to immediately filter down to that task
      setSearchQuery(taskNum || '');

      // 3. Scroll to the element after a short timeout to let the state update and render
      setTimeout(() => {
        const element = document.getElementById(`task-card-${taskId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Add a highly visible glowing amber ring animation to draw focus
          element.classList.add('ring-4', 'ring-red-500', 'ring-offset-2', 'animate-pulse', 'shadow-[0_0_30px_rgba(239,68,68,0.5)]');
          
          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-red-500', 'ring-offset-2', 'animate-pulse', 'shadow-[0_0_30px_rgba(239,68,68,0.5)]');
          }, 4000);
        } else {
          console.warn('Could not find task element with ID:', `task-card-${taskId}`);
        }
      }, 350);
    };

    window.addEventListener('link-to-task', handleLinkToTask);
    return () => window.removeEventListener('link-to-task', handleLinkToTask);
  }, []);

  // Handle task linkage scrolling and highlighting from notifications
  React.useEffect(() => {
    const handleNavigateToTask = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { taskId } = customEvent.detail || {};
      if (!taskId) return;

      // 1. Reset filter tab to 'all' so the task is guaranteed to be in the list
      setActiveTab('all');
      
      // 2. Clear search and other filters so the target card is not hidden
      setSearchQuery('');
      setCategoryFilter('');
      setRegionFilter('');

      // 3. Scroll to the element after a short timeout to let the state update and render
      setTimeout(() => {
        const element = document.getElementById(`task-card-${taskId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Add a highly visible glowing red ring animation to draw focus
          element.classList.add('ring-4', 'ring-red-500', 'ring-offset-2', 'animate-pulse', 'shadow-[0_0_30px_rgba(239,68,68,0.5)]');
          
          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-red-500', 'ring-offset-2', 'animate-pulse', 'shadow-[0_0_30px_rgba(239,68,68,0.5)]');
          }, 4000);
        } else {
          console.warn('Could not find task element with ID:', `task-card-${taskId}`);
        }
      }, 350);
    };

    window.addEventListener('navigate-to-task', handleNavigateToTask);
    return () => window.removeEventListener('navigate-to-task', handleNavigateToTask);
  }, []);

  const handleGoHome = () => {
    setActiveTab('all');
    setSearchQuery('');
    setCategoryFilter('');
    setRegionFilter('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="animate-spin text-red-500 mb-4" size={40} />
        <p className="text-sm font-bold text-slate-500">委託載入中，尋找您的超人...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans overflow-x-hidden">
      {showInAppBanner && isInAppBrowser() && !user && (
        <div className="bg-amber-500 text-white px-4 py-3.5 flex items-center justify-between text-xs gap-3 font-semibold relative z-50 shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-sm shrink-0">⚠️</span>
            <span>
              偵測到您目前使用 LINE/Facebook 內建瀏覽器，App 限制會封鎖社群登入。建議點擊右上角「...」並選擇「用預設瀏覽器開啟」以順利完成登入！
            </span>
          </div>
          <button 
            onClick={() => setShowInAppBanner(false)} 
            className="text-white hover:text-amber-100 px-2 py-1 bg-amber-600 rounded transition-colors font-bold text-[10px] shrink-0 active:scale-95"
          >
            關閉
          </button>
        </div>
      )}
      <Navbar 
        onNewTask={() => requireLogin(() => setShowTaskForm(true))} 
        onNewBroadcast={() => requireLogin(() => setShowBroadcastForm(true))}
        onGoHome={handleGoHome}
      />
      
      <BroadcastMarquee />
      
      <main className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-8 p-4 md:p-8 pb-28 md:pb-8">
        {/* Sidebar */}
        <aside className="hidden md:block md:col-span-3 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">功能選單</h3>
            <div className="space-y-1">
              <button 
                onClick={handleGoHome}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${(activeTab !== 'my-tasks' && activeTab !== 'privacy') ? 'bg-red-50 text-red-600' : 'hover:bg-slate-50 text-slate-600'}`}
              >
                回到首頁
              </button>
              <button 
                onClick={() => requireLogin(() => setActiveTab('my-tasks'))}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'my-tasks' ? 'bg-red-50 text-red-600' : 'hover:bg-slate-50 text-slate-600'}`}
              >
                個人委託
              </button>
              <button 
                onClick={() => requireLogin(() => setActiveTab('privacy'))}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'privacy' ? 'bg-red-50 text-red-600' : 'hover:bg-slate-50 text-slate-600'}`}
              >
                帳戶與隱私
              </button>
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

          <div className="hidden md:block">
            <CommunityLinks />
          </div>
          
          <div className="hidden md:block p-4 text-center space-y-1.5">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">© 2026 995 委託板</p>
            <div className="flex justify-center flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-400 font-medium">
              <a href="./privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-red-500 underline transition-colors">隱私權政策</a>
              <span>·</span>
              <a href="./terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-red-500 underline transition-colors">服務條款</a>
              <span>·</span>
              <a href="./deletion.html" target="_blank" rel="noopener noreferrer" className="hover:text-red-500 underline transition-colors">數據刪除</a>
            </div>
          </div>
        </aside>

        {/* Task Feed */}
        <section className="md:col-span-9 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <div className="flex-1">
              <h2 className="text-lg font-black text-slate-800 tracking-tight">
                {activeTab === 'privacy' 
                  ? '個人隱私與帳戶管理' 
                  : (activeTab === 'my-tasks' ? '追蹤我的需求' : '尋找委託任務')}
              </h2>
              {(activeTab === 'all' || activeTab === 'open' || activeTab === 'accepted') && (
                <div className="mt-4 flex flex-col sm:flex-row gap-3 max-w-2xl">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="搜尋內容、地點、或任務編號..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-base font-bold text-slate-600 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm cursor-pointer"
                    >
                      <option value="">所有任務類別</option>
                      {TASK_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>

                    <select
                      value={regionFilter}
                      onChange={(e) => setRegionFilter(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-base font-bold text-slate-600 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm cursor-pointer"
                    >
                      <option value="">所有縣市地區</option>
                      {TAIWAN_REGIONS.map(reg => (
                        <option key={reg} value={reg}>{reg}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(activeTab === 'my-tasks' || activeTab === 'privacy') && (
            <div className="flex bg-slate-100 p-1 rounded-2xl max-w-xs">
              <button
                type="button"
                onClick={() => setActiveTab('my-tasks')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  activeTab === 'my-tasks' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                我的委託列表
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('privacy')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  activeTab === 'privacy' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                隱私與帳戶
              </button>
            </div>
          )}

          {activeTab === 'privacy' ? (
            <AccountPrivacyPanel />
          ) : (
            <TaskList 
              filter={activeTab} 
              searchQuery={searchQuery} 
              categoryFilter={categoryFilter}
              regionFilter={regionFilter}
              onCategoryChange={setCategoryFilter}
            />
          )}

          {/* Also show on mobile/tablet screens at the bottom of the tasks list for easy access */}
          <div className="md:hidden pt-4">
            <CommunityLinks />
          </div>
        </section>
      </main>

      {/* PWA style Bottom Nav for mobile */}
      <nav className="md:hidden bg-white border-t border-slate-200/80 flex justify-around items-center h-20 fixed bottom-0 left-0 right-0 z-50 px-2 pb-safe shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
        <button 
          onClick={handleGoHome} 
          className={`flex flex-col items-center gap-1 group transition-colors ${(activeTab !== 'my-tasks' && activeTab !== 'privacy') ? 'text-slate-900 font-black' : 'text-slate-400 font-bold hover:text-slate-600'}`}
        >
          <Home size={20} fill={(activeTab !== 'my-tasks' && activeTab !== 'privacy') ? 'currentColor' : 'none'} className="transition-transform group-active:scale-90" />
          <span className="text-[10px] tracking-wider">主頁</span>
        </button>
        <div className="flex flex-col items-center gap-1 group relative">
          <button 
            onClick={() => requireLogin(() => setShowTaskForm(true))}
            className="-mt-10 w-14 h-14 bg-rose-600 hover:bg-rose-500 rounded-full flex items-center justify-center text-white shadow-[0_4px_14px_rgba(225,29,72,0.4)] border-4 border-white transform active:scale-90 transition-transform"
          >
            <PlusCircle size={26} strokeWidth={3} />
          </button>
          <span className="text-[10px] font-bold text-slate-400">發佈任務</span>
        </div>
        <button 
          onClick={() => requireLogin(() => setActiveTab('my-tasks'))} 
          className={`flex flex-col items-center gap-1 group transition-colors ${activeTab === 'my-tasks' ? 'text-slate-900 font-black' : 'text-slate-400 font-bold hover:text-slate-600'}`}
        >
          <UserIcon size={20} fill={activeTab === 'my-tasks' ? 'currentColor' : 'none'} className="transition-transform group-active:scale-90" />
          <span className="text-[10px] tracking-wider">個人委託</span>
        </button>
        <button 
          onClick={() => requireLogin(() => setActiveTab('privacy'))} 
          className={`flex flex-col items-center gap-1 group transition-colors ${activeTab === 'privacy' ? 'text-slate-900 font-black' : 'text-slate-400 font-bold hover:text-slate-600'}`}
        >
          <Shield size={20} fill={activeTab === 'privacy' ? 'currentColor' : 'none'} className="transition-transform group-active:scale-90" />
          <span className="text-[10px] tracking-wider">帳戶與隱私</span>
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
