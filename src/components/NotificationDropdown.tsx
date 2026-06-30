import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { 
  subscribeNotifications, 
  markAsRead, 
  markAllAsRead, 
  AppNotification 
} from '../lib/notificationService';
import { Bell, Check, Trash2, ShieldAlert, Sparkles, AlertCircle, X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function NotificationDropdown() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showToast, setShowToast] = useState<AppNotification | null>(null);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission>('default');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const startupTime = useRef<number>(Date.now());

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

          // Trigger Native Browser Notification as progressive enhancement
          if (Notification.permission === 'granted') {
            const title = 
              latestNew.type === 'task_accepted' ? '任務已被承接 🚀' :
              latestNew.type === 'task_unaccepted' ? '承接人取消承接 ⚠️' : '任務已完成結案 🎉';
            
            const body = `任務 [${latestNew.taskNum}] ${latestNew.taskContent.slice(0, 30)}... \n異動者: ${latestNew.senderName}`;
            
            try {
              new Notification(title, {
                body,
                icon: '/favicon.ico', // fallback icon if available
                tag: latestNew.id,
              });
            } catch (e) {
              console.warn('Failed to display native notification:', e);
            }
          }
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
              
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead(user.uid)}
                    className="text-xs text-red-500 hover:text-red-600 font-bold flex items-center gap-0.5 transition-colors"
                  >
                    <Check size={12} strokeWidth={3} />
                    <span>全部已讀</span>
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Notification Request banner */}
            {desktopPermission === 'default' && (
              <div className="p-3 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs flex flex-col gap-1.5 font-medium">
                <span>🔔 開啟「裝置桌面通知」，即便在其他網頁也能即時收到進度通知！</span>
                <button
                  onClick={requestDesktopPermission}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg self-start transition-colors"
                >
                  啟用桌面通知
                </button>
              </div>
            )}

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
                          {!n.read && (
                            <span className="text-[9px] bg-red-500 text-white font-extrabold px-1.5 py-0.5 rounded-full">新</span>
                          )}
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
            className="fixed top-24 right-4 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-4 flex gap-3.5"
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                  <span className="text-xs font-black tracking-wider uppercase text-amber-400">進度即時通知 🚨</span>
                </div>
                <button 
                  onClick={() => setShowToast(null)} 
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
