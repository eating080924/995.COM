import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { deleteAllUserAppData } from '../lib/userDeletion';
import { 
  Shield, ShieldAlert, FileText, CheckCircle, Trash2, Mail, Info, Loader2, Settings,
  Award, MapPin, Layers, Star, Check, Sparkles, Trophy, MessageSquare
} from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { TASK_CATEGORIES, TAIWAN_REGIONS, TITLE_ACHIEVEMENTS } from '../config/achievements';
import { updateUserStatsAndAchievements } from '../lib/ratingAndAchievements';

export function AccountPrivacyPanel() {
  const { user, logout } = useAuth();
  
  // Account deletion states
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deletionStatus, setDeletionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // App settings and profile states
  const [profile, setProfile] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [violationLogs, setViolationLogs] = useState<any[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Preferred lists
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [activeTitle, setActiveTitle] = useState<string>('');

  const [enableCenterPopup, setEnableCenterPopup] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('db995_enable_center_popup');
      return saved !== 'false';
    }
    return true;
  });

  // Handle center popup toggle
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

  // Load user profile and reviews
  useEffect(() => {
    if (user) {
      const fetchProfileAndReviews = async () => {
        try {
          setLoadingProfile(true);
          const userRef = doc(db, 'users', user.uid);
          let userDoc = await getDoc(userRef);
          
          if (!userDoc.exists()) {
            await updateUserStatsAndAchievements(user.uid);
            userDoc = await getDoc(userRef);
          } else {
            // Check & update achievements automatically on page load
            await updateUserStatsAndAchievements(user.uid);
            userDoc = await getDoc(userRef);
          }

          const data = userDoc.data();
          setProfile(data);
          setSelectedCategories(data?.preferredCategories || []);
          setSelectedRegions(data?.preferredRegions || []);
          setActiveTitle(data?.activeTitle || '');

          // Fetch violation logs
          const logsQ = query(
            collection(db, 'violation_logs'),
            where('userId', '==', user.uid)
          );
          const logsSnap = await getDocs(logsQ);
          const logsList: any[] = [];
          logsSnap.forEach((dSnap) => {
            logsList.push({ id: dSnap.id, ...dSnap.data() });
          });
          // Sort by createdAt descending
          logsList.sort((a, b) => {
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return timeB - timeA;
          });
          setViolationLogs(logsList);
        } catch (err) {
          console.error('Error fetching profile:', err);
        } finally {
          setLoadingProfile(false);
        }
      };

      fetchProfileAndReviews();
    }
  }, [user]);

  if (!user) return null;

  // Handle preference saving
  const handleSavePreferences = async () => {
    try {
      setSavingPrefs(true);
      setMessage(null);
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        preferredCategories: selectedCategories,
        preferredRegions: selectedRegions,
        activeTitle: activeTitle,
        updatedAt: serverTimestamp()
      });

      setMessage({ type: 'success', text: '偏好設定與稱號更新成功！系統已將訂閱類別與地區寫入您的雲端設定檔。' });
      
      // Update local profile state
      setProfile((prev: any) => ({
        ...prev,
        preferredCategories: selectedCategories,
        preferredRegions: selectedRegions,
        activeTitle: activeTitle
      }));

      // Auto fade message
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      console.error('Error saving preferences:', err);
      setMessage({ type: 'error', text: `更新失敗：${err?.message || '未知錯誤'}` });
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleToggleCategory = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleToggleRegion = (reg: string) => {
    setSelectedRegions(prev => 
      prev.includes(reg) ? prev.filter(r => r !== reg) : [...prev, reg]
    );
  };

  const handleDeleteAccount = async () => {
    if (confirmInput !== '確認刪除') return;
    
    setIsDeleting(true);
    setDeletionStatus('idle');
    
    try {
      const success = await deleteAllUserAppData(user.uid);
      
      if (success) {
        setDeletionStatus('success');
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

  if (loadingProfile) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-12 flex flex-col items-center justify-center space-y-4 shadow-sm min-h-[400px]">
        <Loader2 className="animate-spin text-red-500" size={36} />
        <p className="text-sm font-bold text-slate-500">正在同步雲端偏好、成就與評價設定...</p>
      </div>
    );
  }

  // Calculate stats for checking achievements locally too
  const stats = {
    completedAsAcceptor: profile?.completedAsAcceptorCount || 0,
    completedAsRequester: profile?.completedAsRequesterCount || 0,
    averageRating: profile?.averageRating || 0,
    ratingCount: profile?.ratingCount || 0,
    broadcastCount: profile?.broadcastCount || 0,
  };

  return (
    <div className="space-y-6" id="account-privacy-panel">
      
      {/* 1. Profile, Identity, Stats Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-red-500/10 via-amber-500/5 to-slate-100 p-6 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 text-red-500 rounded-2xl border border-red-100">
              <Shield size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight">個人檔案與成就中心</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">Profile, Achievements & Ratings</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-red-500 hover:border-red-500/20 shadow-sm transition-all">
              <FileText size={14} />
              <span>隱私權政策</span>
            </a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-red-500 hover:border-red-500/20 shadow-sm transition-all">
              <FileText size={14} />
              <span>服務條款</span>
            </a>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {/* Identity Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="w-20 h-20 rounded-2xl bg-slate-100 border-4 border-white shadow-md overflow-hidden shrink-0 relative">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'Avatar'} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-red-500 text-white flex items-center justify-center font-bold text-2xl">
                  {(user.displayName || '9')[0]}
                </div>
              )}
            </div>
            <div className="space-y-1.5 text-center sm:text-left flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-lg font-black text-slate-800">{user.displayName || '匿名用戶'}</span>
                {profile?.activeTitle && (
                  <span className="text-xs font-extrabold px-2.5 py-0.5 bg-red-50 border border-red-100 text-red-600 rounded-lg flex items-center gap-1">
                    <Trophy size={12} className="text-amber-500 fill-amber-500" />
                    <span>{profile.activeTitle}</span>
                  </span>
                )}
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md uppercase tracking-wider">
                  已登入
                </span>
              </div>
              {user.email && (
                <p className="text-xs text-slate-400 font-mono tracking-tight flex items-center justify-center sm:justify-start gap-1">
                  <Mail size={12} />
                  <span>{user.email}</span>
                </p>
              )}

              {/* Stats Counters */}
              <div className="grid grid-cols-2 gap-3 pt-3 max-w-sm">
                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center sm:text-left">
                  <span className="text-[10px] font-black text-slate-400 block">作為接案者完成</span>
                  <span className="text-lg font-extrabold text-slate-800 font-mono">{stats.completedAsAcceptor} <span className="text-xs text-slate-500">次</span></span>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center sm:text-left">
                  <span className="text-[10px] font-black text-slate-400 block">作為委託者完成</span>
                  <span className="text-lg font-extrabold text-slate-800 font-mono">{stats.completedAsRequester} <span className="text-xs text-slate-500">次</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 1.5 接單信用與信用處罰紀錄 Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={20} className="text-red-500" />
            <h3 className="font-black text-slate-800 text-sm">🛡️ 超人接單信用與違規紀錄</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              信用評級
            </span>
            {(!profile?.noContactViolationsCount || profile.noContactViolationsCount === 0) ? (
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg flex items-center gap-1">
                🟢 卓越信譽 (Excellent)
              </span>
            ) : profile.noContactViolationsCount <= 2 ? (
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-amber-100 border border-amber-200 text-amber-700 rounded-lg flex items-center gap-1">
                🟡 信用提醒 (Warning)
              </span>
            ) : profile.noContactViolationsCount <= 4 ? (
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-orange-100 border border-orange-200 text-orange-700 rounded-lg flex items-center gap-1">
                🟠 限制接單中 (Restricted)
              </span>
            ) : (
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-red-100 border border-red-200 text-red-700 rounded-lg flex items-center gap-1">
                🔴 帳號永久封鎖 (Banned)
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed font-medium">
          為維護良好的鄰里互助體驗，平台設有<b>「自動信用處罰與違規紀錄」</b>。超人承接委託後，若<b>超過 1 小時未主動聯繫委託人且未回報處理狀態</b>，委託人有權回報「無故未聯繫」並重開委託。每次被回報成功後，系統將自動記錄違規並對超人帳號施加限制。
        </p>

        {/* Penalty Ladder */}
        <div className="bg-slate-50 border border-slate-100/60 p-4 rounded-2xl space-y-3">
          <h4 className="text-xs font-black text-slate-700">📌 平台信用處罰階梯規則 (Penalty Ladder)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-[10px] font-bold">
            <div className="p-2.5 bg-white rounded-xl border border-slate-150 flex flex-col justify-between">
              <span className="text-slate-400 block mb-1">第 1 次違規</span>
              <span className="text-slate-800">系統警告 ⚠️</span>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-slate-150 flex flex-col justify-between">
              <span className="text-slate-400 block mb-1">第 2 次違規</span>
              <span className="text-slate-800">警告與信用扣減提醒</span>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-amber-100 text-amber-800 flex flex-col justify-between">
              <span className="text-amber-500 block mb-1">第 3 次違規</span>
              <span>暫停接單 3 天 ⏳</span>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-orange-100 text-orange-800 flex flex-col justify-between">
              <span className="text-orange-500 block mb-1">第 4 次違規</span>
              <span>暫停接單 7 天 ⏳</span>
            </div>
            <div className="p-2.5 bg-red-50 rounded-xl border border-red-150 text-red-800 flex flex-col justify-between">
              <span className="text-red-500 block mb-1">第 5 次及以上</span>
              <span>永久封鎖接單功能 🚫</span>
            </div>
          </div>
        </div>

        {/* User Credit Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-1">
            <span className="text-[10px] font-black text-slate-400 block">無故未聯繫違規次數</span>
            <span className="text-lg font-black text-slate-800 font-mono flex items-baseline gap-1">
              {profile?.noContactViolationsCount || profile?.noContactStrikes || 0}
              <span className="text-xs text-slate-500 font-bold">次 / 累計</span>
            </span>
          </div>

          <div className="p-4 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-1">
            <span className="text-[10px] font-black text-slate-400 block">當前帳號狀態</span>
            <span className="text-xs font-extrabold flex items-center gap-1 pt-1">
              {profile?.penaltyStatus === 'banned' ? (
                <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">🚫 永久封鎖 (Banned)</span>
              ) : profile?.penaltyStatus === 'suspended' ? (
                <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">⏳ 停權接單中 (Suspended)</span>
              ) : (
                <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">🟢 接單資格正常 (Active)</span>
              )}
            </span>
          </div>

          <div className="p-4 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-1">
            <span className="text-[10px] font-black text-slate-400 block">處罰截止時間</span>
            <span className="text-xs font-extrabold text-slate-700 pt-1 block">
              {profile?.penaltyStatus === 'suspended' && profile?.bannedUntil ? (
                <span className="text-amber-600 font-mono">
                  {profile.bannedUntil.toDate 
                    ? profile.bannedUntil.toDate().toLocaleString() 
                    : new Date(profile.bannedUntil).toLocaleString()}
                </span>
              ) : profile?.penaltyStatus === 'banned' ? (
                <span className="text-red-600 font-bold">永久 (Permanent)</span>
              ) : (
                <span className="text-slate-400">無限制/未處罰</span>
              )}
            </span>
          </div>
        </div>

        {/* Violation History Logs */}
        <div className="space-y-3">
          <h4 className="text-xs font-black text-slate-700 flex items-center gap-1">
            <span>📋 信用違規歷程紀錄 (Violation Logs)</span>
            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-500 text-[9px] rounded font-mono">
              {violationLogs.length} 筆
            </span>
          </h4>

          {violationLogs.length > 0 ? (
            <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-slate-50/20">
              {violationLogs.map((log) => (
                <div key={log.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-800 bg-white border border-slate-100 px-1.5 py-0.5 rounded">
                        委託: #{log.taskNum}
                      </span>
                      <span className="text-red-600 font-black bg-red-50/80 px-1.5 py-0.5 rounded text-[10px]">
                        違規原因: {log.reason}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      套用處罰: <span className="font-bold text-slate-700">{log.penaltyApplied}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono shrink-0">
                    {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/20">
              <p className="text-xs text-slate-400 font-medium">✨ 棒極了！您目前沒有任何無故未聯繫的違規紀錄，請繼續保持優良信用！</p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Achievements & Title Selection Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <Award size={20} className="text-red-500" />
          <h3 className="font-black text-slate-800 text-sm">🏆 超人稱號成就系統</h3>
        </div>

        {/* Selected active title selector */}
        {profile?.earnedTitles && profile.earnedTitles.length > 0 ? (
          <div className="bg-amber-50/60 border border-amber-200/60 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                <Sparkles size={14} className="animate-pulse text-amber-500" />
                <span>更換您在平台顯示的特殊稱號</span>
              </span>
              <p className="text-xs text-amber-700/80">
                目前佩戴：<b className="text-red-600">{activeTitle || '無稱號'}</b>。該稱號將公開展示在您發佈、承接的任務卡片中。
              </p>
            </div>
            <select
              value={activeTitle}
              onChange={(e) => setActiveTitle(e.target.value)}
              className="px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
            >
              <option value="">不佩戴稱號 (無)</option>
              {profile.earnedTitles.map((title: string) => (
                <option key={title} value={title}>{title}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
            <p className="text-xs text-slate-500">
              您尚未達成任何特殊稱號條件。前往幫助鄰居，或發布委託、發送廣播來解鎖專屬頭銜！
            </p>
          </div>
        )}

        {/* List of achievements to check status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TITLE_ACHIEVEMENTS.map((ach) => {
            const isEarned = profile?.earnedTitles?.includes(ach.title) || ach.checkFn(stats);
            return (
              <div 
                key={ach.id} 
                className={`p-4 rounded-2xl border transition-all ${
                  isEarned 
                    ? 'bg-red-50/40 border-red-200/75 shadow-sm' 
                    : 'bg-white border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl border ${isEarned ? 'bg-red-100 border-red-200 text-red-600' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                    <Trophy size={16} className={isEarned ? "fill-red-200" : ""} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-black text-slate-800">{ach.title}</h4>
                      {isEarned && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 bg-red-100 text-red-600 rounded">已解鎖</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{ach.description}</p>
                    <p className="text-[10px] text-slate-400 font-bold">解鎖條件：{ach.conditionDescription}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Preferred Categories & Regions (Sub/Filter settings) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <Settings size={20} className="text-red-500" />
          <h3 className="font-black text-slate-800 text-sm">🔔 興趣訂閱與任務偏好</h3>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          設定您的「希望接案類別」與「接案地區」。當有相關類別的新任務發布或緊急廣播時，系統可以優先為您進行推薦、標註或進行APP推播。
        </p>

        {/* Category Multiselect */}
        <div className="space-y-3">
          <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
            <Layers size={13} className="text-slate-400" />
            <span>希望接案的類別 (可複選)</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {TASK_CATEGORIES.map((cat) => {
              const selected = selectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => handleToggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    selected 
                      ? 'bg-red-500 border-red-500 text-white shadow-sm' 
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-350'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Region Multiselect */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
            <MapPin size={13} className="text-slate-400" />
            <span>希望接案的地區 (可複選)</span>
          </h4>
          <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto p-1 border border-slate-100 rounded-2xl bg-slate-50/50">
            {TAIWAN_REGIONS.map((reg) => {
              const selected = selectedRegions.includes(reg);
              return (
                <button
                  key={reg}
                  onClick={() => handleToggleRegion(reg)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    selected 
                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm' 
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-350'
                  }`}
                >
                  {reg}
                </button>
              );
            })}
          </div>
        </div>

        {/* General Settings */}
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
            {enableCenterPopup ? "已開啟彈出" : "已關閉彈出"}
          </button>
        </div>

        {/* Message Alert */}
        {message && (
          <div className={`p-4 rounded-xl text-xs font-bold border ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Save Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSavePreferences}
            disabled={savingPrefs}
            className="px-6 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-black tracking-wider rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
          >
            {savingPrefs ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                <span>儲存設定中...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>保存偏好設定與稱號</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 5. Irreversible account delete (Preserving original deletion code) */}
      <div className="bg-red-50/10 rounded-3xl border border-red-100 p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-7 space-y-1.5">
          <h3 className="text-sm font-black text-red-800 uppercase flex items-center gap-1.5">
            <Trash2 size={14} className="text-red-500" />
            <span>個人數據自主刪除</span>
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            若您不再使用委託板，我們提供極為徹底的一鍵數據銷毀。點擊後系統會<b>永久、不可逆</b>地抹除您的個人檔案、發布的所有任務以及廣播紀錄。
          </p>
        </div>
        <div className="md:col-span-5 flex justify-end">
          <button
            onClick={() => {
              setConfirmInput('');
              setShowConfirmModal(true);
            }}
            disabled={isDeleting}
            className="w-full sm:w-auto px-5 py-3 bg-red-50 border border-red-200 hover:bg-red-500 hover:text-white rounded-xl text-xs font-black tracking-wider text-red-600 shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            永久刪除帳號與所有委託資料
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pb-24 sm:p-4" id="delete-confirmation-modal">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isDeleting && setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden z-20">
            {deletionStatus === 'success' ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-150 shadow-inner animate-bounce">
                  <CheckCircle size={32} />
                </div>
                <h3 className="text-lg font-black text-slate-800">資料已徹底銷毀</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  您的帳號檔案、電子郵件以及您曾經發佈過的所有任務紀錄已自 Firebase 資料庫中<b>永久、不可逆</b>地安全抹除。<br />我們將為您重新載入首頁...
                </p>
              </div>
            ) : (
              <div className="p-6 md:p-8 space-y-6">
                <div className="flex gap-4 items-start pb-4 border-b border-slate-100">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center shrink-0">
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 leading-tight">確認刪除帳號與數據？</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Irreversible Data Purge Alert</p>
                  </div>
                </div>

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
                  />
                </div>

                {deletionStatus === 'error' && (
                  <p className="text-xs text-red-500 font-bold text-center">
                    ⛔ 資料刪除失敗！請確認您的網路狀況或重新登入後再次嘗試。
                  </p>
                )}

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
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition-all"
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
