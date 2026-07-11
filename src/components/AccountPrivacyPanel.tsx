import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { deleteAllUserAppData } from '../lib/userDeletion';
import { Shield, ShieldAlert, FileText, CheckCircle, Trash2, Mail, Info, Loader2, Settings } from 'lucide-react';

export function AccountPrivacyPanel() {
  const { user, logout } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deletionStatus, setDeletionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [enableCenterPopup, setEnableCenterPopup] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('db995_enable_center_popup');
      return saved !== 'false';
    }
    return true;
  });

  React.useEffect(() => {
    const handlePrefChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.enabled === 'boolean') {
        setEnableCenterPopup(customEvent.detail.enabled);
      }
    };
    window.addEventListener('db995-pref-changed', handlePrefChange);
    return () => window.removeEventListener('db995-pref-changed', handlePrefChange);
  }, []);

  const handleToggleCenterPopup = (enabled: boolean) => {
    setEnableCenterPopup(enabled);
    localStorage.setItem('db995_enable_center_popup', String(enabled));
    window.dispatchEvent(new CustomEvent('db995-pref-changed', { detail: { enabled } }));
  };

  if (!user) return null;

  const handleDeleteAccount = async () => {
    if (confirmInput !== '確認刪除') return;
    
    setIsDeleting(true);
    setDeletionStatus('idle');
    
    try {
      // Delete all user data in Firestore
      const success = await deleteAllUserAppData(user.uid);
      
      if (success) {
        setDeletionStatus('success');
        // Wait briefly so the user sees the success state, then call logout to redirect
        setTimeout(async () => {
          await logout();
          window.location.reload();
        }, 2500);
      } else {
        setDeletionStatus('error');
        setIsDeleting(false);
      }
    } catch (error) {
      console.error('Account deletion error:', error);
      setDeletionStatus('error');
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden mb-6" id="account-privacy-panel">
      
      {/* Header Cover Banner */}
      <div className="bg-gradient-to-r from-red-500/10 via-amber-500/5 to-slate-100 p-6 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-50 text-red-500 rounded-2xl border border-red-100">
            <Shield size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight">個人隱私與帳戶管理</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">Profile, Data Rights & Account Deletion</p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-red-500 hover:border-red-500/20 shadow-sm transition-all"
            id="privacy-policy-link"
          >
            <FileText size={14} />
            <span>隱私權政策</span>
          </a>
          <a
            href="/terms.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-red-500 hover:border-red-500/20 shadow-sm transition-all"
            id="terms-of-service-link"
          >
            <FileText size={14} />
            <span>服務條款</span>
          </a>
          <a
            href="/deletion.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-red-500 hover:border-red-500/20 shadow-sm transition-all"
            id="data-deletion-link"
          >
            <ShieldAlert size={14} />
            <span>數據刪除指引</span>
          </a>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        
        {/* Left column: User Identity Card */}
        <div className="md:col-span-7 flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 border-4 border-white shadow-md overflow-hidden shrink-0">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'Avatar'} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-red-500 text-white flex items-center justify-center font-bold text-lg">
                {(user.displayName || '9')[0]}
              </div>
            )}
          </div>
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="text-base font-black text-slate-800">{user.displayName || '匿名用戶'}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md uppercase tracking-wider">
                已登入授權
              </span>
            </div>
            {user.email && (
              <p className="text-xs text-slate-400 font-mono tracking-tight flex items-center justify-center sm:justify-start gap-1">
                <Mail size={12} />
                <span>{user.email}</span>
              </p>
            )}
            <p className="text-xs text-slate-500 leading-relaxed max-w-md pt-1.5">
              依據隱私權政策和平台規範，本服務僅透過 Google 等安全登入管道存取您的公開資料。您可以隨時取回或刪除平台中已儲存的任何資訊。
            </p>
          </div>
        </div>

        {/* Right column: Action Trigger Box */}
        <div className="md:col-span-5 bg-slate-50 rounded-2xl border border-slate-100 p-5 space-y-3 flex flex-col justify-center">
          <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase">
            <Trash2 size={13} className="text-red-500" />
            <span>個人數據自主刪除</span>
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            若您不願再參與委託，本服務提供一鍵永久帳號資料抹除。點擊後系統會<b>不可逆地刪除您發佈的所有任務與個人檔案</b>。
          </p>
          <button
            onClick={() => {
              setConfirmInput('');
              setShowConfirmModal(true);
            }}
            disabled={isDeleting}
            className="w-full py-2.5 bg-red-50 border border-red-200 text-red-600 hover:bg-red-500 hover:text-white rounded-xl text-xs font-black tracking-wider transition-all shadow-sm active:scale-95 disabled:opacity-50 hover:border-transparent"
            id="trigger-delete-account-btn"
          >
            永久刪除帳號與所有委託資料
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 mx-6 md:mx-8" />

      {/* Preferences Section */}
      <div className="p-6 md:p-8 space-y-4">
        <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
          <Settings size={14} className="text-red-500 animate-spin-slow" />
          <span>通知與偏好設定</span>
        </h4>
        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h5 className="text-xs font-black text-slate-800">新廣播螢幕中央即時提示</h5>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xl font-medium">
              當有其他用戶發佈新的緊急廣播時，在螢幕中央顯示半透明高能彈出視窗（顯示 3 秒後自動關閉），以便第一時間取得關鍵資訊。
            </p>
          </div>
          <button
            onClick={() => handleToggleCenterPopup(!enableCenterPopup)}
            className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-wider transition-all shadow-sm active:scale-95 shrink-0 border ${
              enableCenterPopup
                ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {enableCenterPopup ? "已開啟 (點擊關閉)" : "已關閉 (點擊開啟)"}
          </button>
        </div>
      </div>

      {/* Embedded security tips */}
      <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-start gap-2.5">
        <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
          您對自己的個人資料享有充分掌控。若有任何第三方登入設定或帳密疑慮，可查閱我們的 <a href="/deletion.html" target="_blank" rel="noopener noreferrer" className="text-red-500 hover:underline">如何刪除第三方授權紀錄指引</a> 或直接寄信向管理組提報要求。
        </p>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="delete-confirmation-modal">
          
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
            onClick={() => !isDeleting && setShowConfirmModal(false)}
          />

          {/* Modal Card */}
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden z-20">
            {deletionStatus === 'success' ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-150 shadow-inner animate-bounce">
                  <CheckCircle size={32} />
                </div>
                <h3 className="text-lg font-black text-slate-800">我們的離別是安全的</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  您的帳號檔案、電子郵件以及您曾經發佈過的所有任務紀錄已自 Firebase 資料庫中<b>永久、不可逆</b>地安全抹除。<br />我們將為您重新載入首頁...
                </p>
              </div>
            ) : (
              <div className="p-6 md:p-8 space-y-6">
                
                {/* Warning Alert Icon Header */}
                <div className="flex gap-4 items-start pb-4 border-b border-slate-100">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center shrink-0">
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 leading-tight">確認刪除帳號與數據？</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Irreversible Data Purge Alert</p>
                  </div>
                </div>

                {/* Info details */}
                <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
                  <p className="font-semibold text-slate-700">這是一項「無法還原」的永久刪洗數據操作：</p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-500 font-medium">
                    <li>您在平台發佈的所有委託任務皆會徹底遭清空刪除。</li>
                    <li>您的 Firebase 帳號文件 (Users collection) 會隨即下線銷毀。</li>
                    <li>關聯的所有社群登入資訊、歷史快取也將同步徹底拔除登出。</li>
                  </ul>
                  <p className="text-[11px] text-red-500 font-bold bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                    ⚠️ 注意：我們沒有任何還原機制，數據被銷毀後，任何人（包含管理團隊）皆無法為您恢復任何資料。
                  </p>
                </div>

                {/* Input Guard */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700 block">
                    為防止不小心點擊，請在下方輸入 <span className="text-red-500">確認刪除</span> 以確認：
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    disabled={isDeleting}
                    placeholder="請輸入「確認刪除」"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm placeholder-slate-350 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-bold text-center"
                    id="deletion-confirm-input"
                  />
                </div>

                {/* Errors case */}
                {deletionStatus === 'error' && (
                  <p className="text-xs text-red-500 font-bold text-center">
                    ⛔ 資料刪除失敗！請確認您的網路狀況或重新登入後再次嘗試。
                  </p>
                )}

                {/* Actions button */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => !isDeleting && setShowConfirmModal(false)}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-colors"
                  >
                    保留資料 (取消)
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={confirmInput !== '確認刪除' || isDeleting}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl text-xs font-black shadow-md shadow-red-200 disabled:shadow-none flex items-center justify-center gap-1.5 transition-all"
                    id="confirm-delete-account-btn"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="animate-spin" size={14} />
                        <span>正在徹底銷毀數據...</span>
                      </>
                    ) : (
                      <span>確認刪除我的所有數據</span>
                    )}
                  </button>
                </div>

              </div>
            )}
          </div>
          
        </div>
      )}

    </div>
  );
}
