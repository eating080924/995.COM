import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { 
  subscribeNotifications, 
  markAsRead, 
  markAllAsRead, 
  deleteNotification,
  clearAllNotifications,
  AppNotification 
} from '../lib/notificationService';
import { Bell, Check, Trash2, ShieldAlert, Sparkles, AlertCircle, X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeUserToPush(userId: string) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push messaging is not supported in this browser.');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    
    // 1. Fetch public VAPID key from backend
    const keyRes = await fetch('/api/vapid-public-key');
    if (!keyRes.ok) throw new Error('Failed to fetch VAPID public key');
    const { publicKey } = await keyRes.json();

    if (!publicKey) {
      console.warn('VAPID public key is empty on the server.');
      return;
    }

    const convertedVapidKey = urlBase64ToUint8Array(publicKey);

    // 2. Subscribe to Push Manager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });

    // 3. Send subscription to backend
    const subRes = await fetch('/api/subscribe-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        subscription
      })
    });

    if (subRes.ok) {
      console.log('Successfully subscribed user to background push notifications!');
    } else {
      console.error('Failed to register subscription with server:', await subRes.text());
    }
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
  }
}

export function NotificationDropdown() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showToast, setShowToast] = useState<AppNotification | null>(null);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const startupTime = useRef<number>(Date.now());

  // Register Service Worker for background and mobile notifications
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });
    }
  }, []);

  // Automatically subscribe to background push notifications when user is logged in and permission is granted
  useEffect(() => {
    if (user && desktopPermission === 'granted') {
      subscribeUserToPush(user.uid);
    }
  }, [user, desktopPermission]);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const unsubscribe = subscribeNotifications(user.uid, (updatedList) => {
      // Find new unread notifications that were created after app startup
      const newNotifications = updatedList.filter(n => {
        if (n.read) return false;
        const createdMs = n.createdAt?.toDate ? n.createdAt.toDate().getTime() : Date.now();
        // Allow a 5-second window to prevent initial load spam
        return createdMs > startupTime.current - 5000;
      });

      // If we got a new notification and the list actually grew or changed
      if (newNotifications.length > 0) {
        // Compare with current list to find the absolute latest one
        const latestNew = newNotifications[0];
        const isAlreadyKnown = notifications.some(existing => existing.id === latestNew.id);
        
        if (!isAlreadyKnown) {
          // Trigger in-app Toast
          setShowToast(latestNew);
          // Auto-hide toast after 5 seconds
          setTimeout(() => {
            setShowToast(current => current?.id === latestNew.id ? null : current);
          }, 5000);
        }
      }

      setNotifications(updatedList);
    });

    // Check desktop notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setDesktopPermission(Notification.permission);
    }

    return () => {
      unsubscribe();
    };
  }, [user, notifications.length]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  const requestDesktopPermission = async () => {
    if (!('Notification' in window)) {
      alert('您的瀏覽器不支援桌面通知功能。');
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      setDesktopPermission(permission);
      if (permission === 'granted' && user) {
        subscribeUserToPush(user.uid);
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  };

  const getNotificationDetails = (n: AppNotification) => {
    switch (n.type) {
      case 'task_accepted':
        return {
          title: '任務被承接 🚀',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          badgeColor: 'bg-emerald-500',
          desc: `您的委託任務 [${n.taskNum}] 已被 ${n.senderName} 承接，請留意後續進度。`,
        };
      case 'task_unaccepted':
        return {
          title: '任務取消承接 ⚠️',
          color: 'bg-amber-50 text-amber-700 border-amber-100',
          badgeColor: 'bg-amber-500',
          desc: `承接人 ${n.senderName} 取消承接您的委託任務 [${n.taskNum}]，任務已重新開放。`,
        };
      case 'task_completed':
        return {
          title: '委託完成結案 🎉',
          color: 'bg-blue-50 text-blue-700 border-blue-100',
          badgeColor: 'bg-blue-500',
          desc: `您承接的委託任務 [${n.taskNum}] 已由委託人 ${n.senderName} 審核完成並結案！`,
        };
      case 'agent_invite':
        return {
          title: '任務委託邀請 💌',
          color: 'bg-red-50 text-red-700 border-red-100',
          badgeColor: 'bg-red-500',
          desc: `案主 ${n.senderName} 向您發出了專屬委託邀請！請點擊查看。`,
        };
      default:
        return {
          title: '系統通知',
          color: 'bg-slate-50 text-slate-700 border-slate-100',
          badgeColor: 'bg-slate-500',
          desc: `任務 [${n.taskNum}] 有狀態異動。`,
        };
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-full transition-all active:scale-95 border border-slate-100 shadow-sm"
        aria-label="Notifications"
        id="notification-bell-btn"
      >
        <Bell size={18} className={unreadCount > 0 ? "animate-swing" : ""} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white ring-2 ring-white animate-bounce-short">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-slate-500" />
                <span className="font-bold text-slate-800 text-sm">通知中心</span>
              </div>
              
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead(user.uid)}
                    className="text-xs text-red-500 hover:text-red-600 font-bold flex items-center gap-0.5 transition-colors"
                  >
                    <Check size={12} strokeWidth={3} />
                    <span>全部已讀</span>
                  </button>
                )}

                {notifications.length > 0 && (
                  <div className="relative flex items-center">
                    {showConfirmClear ? (
                      <div className="flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded-lg border border-red-100 animate-fade-in shadow-sm">
                        <span className="text-[10px] text-red-600 font-black shrink-0">清除全部？</span>
                        <button
                          onClick={async () => {
                            await clearAllNotifications(user.uid);
                            setShowConfirmClear(false);
                          }}
                          className="text-[9px] bg-red-500 hover:bg-red-600 text-white font-black px-1.5 py-0.5 rounded transition-colors"
                        >
                          確認
                        </button>
                        <button
                          onClick={() => setShowConfirmClear(false)}
                          className="text-[9px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-black px-1.5 py-0.5 rounded transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowConfirmClear(true)}
                        className="text-xs text-slate-500 hover:text-red-500 font-bold flex items-center gap-0.5 transition-colors"
                        title="清除所有通知紀錄"
                      >
                        <Trash2 size={12} />
                        <span>清除全部</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Desktop & Mobile Notification Request Banner */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs flex flex-col gap-2">
              {desktopPermission === 'default' ? (
                <div className="flex flex-col gap-1.5 font-semibold text-slate-700">
                  <span>🔔 開啟「瀏覽器通知」，隨時接收任務承接與結案即時通知！</span>
                  <button
                    onClick={requestDesktopPermission}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg self-start transition-all shadow-sm active:scale-95"
                  >
                    啟用桌面通知
                  </button>
                </div>
              ) : desktopPermission === 'granted' ? (
                <div className="text-emerald-700 font-bold flex items-center gap-1">
                  <span>🟢 瀏覽器通知已啟用，將會收到即時狀態更新！</span>
                </div>
              ) : (
                <div className="text-red-600 font-bold">
                  <span>⚠️ 瀏覽器通知已被封鎖。若要接收通知，請至瀏覽器設定中開啟。</span>
                </div>
              )}

              {/* Mobile Background PWA Install Guide */}
              <div className="border-t border-slate-200 pt-2 mt-1">
                <button
                  onClick={() => setShowPwaGuide(!showPwaGuide)}
                  className="w-full flex items-center justify-between text-slate-500 hover:text-slate-800 font-bold transition-colors"
                >
                  <span className="flex items-center gap-1">
                    📱 如何在手機未開啟/背景時收到通知？
                  </span>
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md">
                    {showPwaGuide ? '收合' : '展開說明'}
                  </span>
                </button>

                <AnimatePresence>
                  {showPwaGuide && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden text-slate-600 space-y-2 mt-2 bg-white p-2.5 rounded-lg border border-slate-100 font-normal leading-relaxed"
                    >
                      <p className="font-semibold text-slate-800 text-[11px]">
                        手機系統（特別是 iOS 16.4+ 與 Android）為了保障隱私及省電，<span className="text-red-500 font-bold">必須將此平台「安裝至主畫面」</span>才能在背景接收即時通知：
                      </p>
                      
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-start gap-1">
                          <span className="font-bold text-red-500">Apple iOS:</span>
                          <span>
                            使用 Safari 瀏覽器，點擊底部或頂部的<strong>「分享 📤」</strong>按鈕，選單中點選<strong>「加入主畫面 ➕」</strong>。從桌面打開安裝好的 App，並依提示允許通知。
                          </span>
                        </div>
                        <div className="flex items-start gap-1">
                          <span className="font-bold text-red-500">Android:</span>
                          <span>
                            使用 Chrome 瀏覽器，點擊右上角<strong>「選單 ⁝」</strong>，點選<strong>「安裝應用程式」</strong>或<strong>「加到主畫面」</strong>。打開桌面的 App 並允許通知。
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1 flex items-center gap-1">
                        <span>🛡️ 本平台已內建 PWA 服務，加入主畫面即可享有完整的原生 App 背景通知體驗！</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Notification List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Bell size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-bold">目前沒有任何通知</p>
                  <p className="text-[10px] mt-1 opacity-70">當任務進度更新時會顯示在此處</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const details = getNotificationDetails(n);
                  return (
                    <div
                      key={n.id}
                      onClick={async () => {
                        if (!n.read) {
                          await markAsRead(n.id);
                        }
                        setIsOpen(false);
                        const event = new CustomEvent('navigate-to-task', { detail: { taskId: n.taskId, type: n.type } });
                        window.dispatchEvent(event);
                      }}
                      className={`p-4 transition-all duration-200 cursor-pointer flex gap-3 ${
                        n.read ? 'bg-white opacity-70 hover:opacity-100' : 'bg-red-50/30 hover:bg-red-50/50'
                      }`}
                    >
                      {/* Left Dot Indicator */}
                      <div className="flex flex-col items-center pt-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${details.badgeColor} ${n.read ? 'opacity-30' : 'animate-pulse'}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-800">{details.title}</span>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {!n.read && (
                              <span className="text-[9px] bg-red-500 text-white font-extrabold px-1.5 py-0.5 rounded-full shrink-0">新</span>
                            )}
                            <button
                              onClick={async () => {
                                await deleteNotification(n.id);
                              }}
                              className="text-slate-400 hover:text-red-500 hover:bg-slate-100/80 p-1 rounded-md transition-colors shrink-0"
                              title="刪除此通知"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                          {details.desc}
                        </p>
                        {n.taskContent && (
                          <div className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-100 line-clamp-2 italic">
                            「{n.taskContent}」
                          </div>
                        )}
                        <div className="text-[9px] text-slate-400 font-bold flex items-center justify-between pt-1">
                          <span>編號：{n.taskNum}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Real-Time In-App Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, x: 100, y: 0, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className="fixed top-24 right-4 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-4 flex gap-3.5 cursor-pointer hover:bg-slate-800 transition-all duration-200"
            onClick={async () => {
              if (showToast) {
                if (!showToast.read) {
                  await markAsRead(showToast.id);
                }
                const event = new CustomEvent('navigate-to-task', { detail: { taskId: showToast.taskId, type: showToast.type } });
                window.dispatchEvent(event);
                setShowToast(null);
              }
            }}
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                  <span className="text-xs font-black tracking-wider uppercase text-amber-400">進度即時通知 🚨</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowToast(null);
                  }} 
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <h5 className="text-sm font-black text-white pt-1">
                {getNotificationDetails(showToast).title}
              </h5>
              <p className="text-xs font-semibold text-slate-300 leading-relaxed">
                {getNotificationDetails(showToast).desc}
              </p>
              <div className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-800 italic line-clamp-1">
                「{showToast.taskContent}」
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
