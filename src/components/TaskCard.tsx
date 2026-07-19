import React, { useState, useEffect } from 'react';
import { Task } from '../types';
import { cn, formatTimeAgo } from '../lib/utils';
import { MapPin, Clock, Trash2, Edit2, Phone, CheckCircle, UserCircle, XCircle, Hash, Star, Award, MessageSquare, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp, deleteField, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { TaskForm } from './TaskForm';
import { ConfirmDialog } from './ConfirmDialog';
import { sendNotification } from '../lib/notificationService';
import { submitRating } from '../lib/ratingAndAchievements';


export const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
  const { user } = useAuth();
  const isOwner = user?.uid === task.requesterId;
  const isAcceptor = user?.uid === task.acceptorId;

  const [isEditing, setIsEditing] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'primary';
    showCancel?: boolean;
  } | null>(null);

  // Bidirectional rating states
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState(false);

  // Auto-matching states
  const [matchedExperts, setMatchedExperts] = useState<any[]>([]);
  const [loadingExperts, setLoadingExperts] = useState(false);
  const [notifiedExperts, setNotifiedExperts] = useState<string[]>([]);

  // Fetch recommended experts dynamically based on category
  useEffect(() => {
    if (!isOwner || !user || !task.category || (task.status !== 'open' && task.status !== 'accepted')) {
      return;
    }

    const fetchMatchedExperts = async () => {
      setLoadingExperts(true);
      try {
        // 1. Query experts who completed this category in the past
        const completedQ = query(
          collection(db, 'tasks'),
          where('category', '==', task.category),
          where('status', '==', 'completed')
        );
        const completedSnap = await getDocs(completedQ);
        const expertsMap = new Map<string, { uid: string; displayName: string; count: number; rating: number; ratingCount: number; activeTitle: string }>();

        completedSnap.forEach((docSnap) => {
          const t = docSnap.data();
          if (t.acceptorId && t.acceptorId !== user.uid) {
            const existing = expertsMap.get(t.acceptorId);
            if (existing) {
              existing.count += 1;
            } else {
              expertsMap.set(t.acceptorId, {
                uid: t.acceptorId,
                displayName: t.acceptorName || '超人',
                count: 1,
                rating: 5.0,
                ratingCount: 1,
                activeTitle: ''
              });
            }
          }
        });

        // 2. Query users who set this category as preferred (subscription)
        const prefQ = query(
          collection(db, 'users'),
          where('preferredCategories', 'array-contains', task.category)
        );
        const prefSnap = await getDocs(prefQ);
        prefSnap.forEach((docSnap) => {
          const u = docSnap.data();
          if (docSnap.id !== user.uid) {
            const existing = expertsMap.get(docSnap.id);
            if (existing) {
              existing.rating = u.averageRating || 5.0;
              existing.ratingCount = u.ratingCount || 0;
              existing.activeTitle = u.activeTitle || '';
            } else {
              expertsMap.set(docSnap.id, {
                uid: docSnap.id,
                displayName: u.displayName || '超人',
                count: 0,
                rating: u.averageRating || 5.0,
                ratingCount: u.ratingCount || 0,
                activeTitle: u.activeTitle || ''
              });
            }
          }
        });

        // 3. Resolve additional profile details
        const finalExperts = Array.from(expertsMap.values());
        for (let exp of finalExperts) {
          if (!exp.activeTitle) {
            const uRef = doc(db, 'users', exp.uid);
            const uSnap = await getDoc(uRef);
            if (uSnap.exists()) {
              const uData = uSnap.data();
              exp.activeTitle = uData.activeTitle || '';
              exp.rating = uData.averageRating || 5.0;
              exp.ratingCount = uData.ratingCount || 0;
            }
          }
        }

        // Sort by completed count, then average rating
        finalExperts.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.rating - a.rating;
        });

        setMatchedExperts(finalExperts.slice(0, 3));
      } catch (err) {
        console.error('Error fetching matched experts:', err);
      } finally {
        setLoadingExperts(false);
      }
    };

    fetchMatchedExperts();
  }, [task.id, task.category, task.status, isOwner, user]);

  const handleInviteExpert = async (expertId: string, expertName: string) => {
    if (!user) return;
    try {
      await sendNotification({
        userId: expertId,
        type: 'agent_invite' as any,
        taskId: task.id,
        taskNum: task.taskNum || '',
        taskContent: `委託人邀請您承接任務：${task.content}`,
        senderId: user.uid,
        senderName: user.displayName || user.email || '委託人',
      });
      setNotifiedExperts([...notifiedExperts, expertId]);
    } catch (err) {
      console.error('Error inviting expert:', err);
    }
  };


  const handleAccept = async () => {
    if (!user) return;
    
    // 1. Check local storage first (instant client-side check)
    const localLastCancel = localStorage.getItem(`lastCancelledAt_${user.uid}`);
    if (localLastCancel) {
      const localElapsed = Date.now() - parseInt(localLastCancel, 10);
      if (localElapsed < 10 * 60 * 1000) { // 10 minutes
        setConfirmConfig({
          title: '安全冷卻中 🔒',
          message: '因您在承接後的 10 分鐘內取消承接，已觸發安全機制並限制您 10 分鐘內無法承接任何新任務。',
          onConfirm: () => {},
          showCancel: false
        });
        return;
      }
    }
    
    setConfirmConfig({
      title: '是否承接任務？',
      message: '⚠️ 提醒：若在承接 10 分鐘內「立刻取消」，將會觸發安全機制並限制 10 分鐘內無法承接任何新任務。',
      onConfirm: async () => {
        try {
          // 2. Fetch remote user profile from Firestore to ensure synchronization across devices
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const lastCancelledAt = userData.lastCancelledAt?.toDate 
              ? userData.lastCancelledAt.toDate() 
              : (userData.lastCancelledAt ? new Date(userData.lastCancelledAt) : null);
            
            if (lastCancelledAt) {
              const remoteElapsed = Date.now() - lastCancelledAt.getTime();
              if (remoteElapsed < 10 * 60 * 1000) { // 10 minutes
                // Synchronize to localStorage
                localStorage.setItem(`lastCancelledAt_${user.uid}`, lastCancelledAt.getTime().toString());
                
                setConfirmConfig({
                  title: '安全冷卻中 🔒',
                  message: '因您在承接後的 10 分鐘內取消承接，已觸發安全機制並限制您 10 分鐘內無法承接任何新任務。',
                  onConfirm: () => {},
                  showCancel: false
                });
                return;
              }
            }
          }

          // 3. Check if user already has an active accepted task
          const activeTasksQuery = query(
            collection(db, 'tasks'),
            where('acceptorId', '==', user.uid),
            where('status', '==', 'accepted')
          );
          const activeTasksSnapshot = await getDocs(activeTasksQuery);
          
          if (!activeTasksSnapshot.empty) {
            setConfirmConfig({
              title: '操作限制',
              message: '您目前已有正在進行中的任務。請先完成或取消該任務後，再承接新的任務。',
              onConfirm: () => {},
              showCancel: false
            });
            return;
          }

          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            status: 'accepted',
            acceptorId: user.uid,
            acceptorName: user.displayName || user.email || '在線超人',
            updatedAt: serverTimestamp()
          });

          await sendNotification({
            userId: task.requesterId,
            type: 'task_accepted',
            taskId: task.id,
            taskNum: task.taskNum || '',
            taskContent: task.content || '',
            senderId: user.uid,
            senderName: user.displayName || user.email || '未知使用者',
          });
        } catch (error: any) {
          try {
            handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
          } catch (e) {
            console.error('Firestore operation failed:', e);
          }
          const isOffline = error?.message?.includes('offline') || !window.navigator.onLine;
          setConfirmConfig({
            title: '連線失敗',
            message: isOffline 
              ? '您目前似乎處於離線狀態，請檢查您的網路連線後再試。' 
              : `操作失敗：${error?.message || '未知錯誤'}`,
            onConfirm: () => {},
            showCancel: false
          });
        }
      }
    });
  };

  const handleCancelAccept = async () => {
    if (!user || user.uid !== task.acceptorId) return;
    
    setConfirmConfig({
      title: '是否確認取消承接此任務？',
      message: '⚠️ 提醒：若是在承接 10 分鐘內「立刻取消」，將會觸發安全機制並限制您 10 分鐘內無法承接任何新任務。',
      variant: 'danger',
      onConfirm: async () => {
        try {
          // Calculate hold duration
          const acceptedAt = task.updatedAt?.toDate 
            ? task.updatedAt.toDate() 
            : (task.updatedAt ? new Date(task.updatedAt) : null);
          const elapsedMs = acceptedAt ? (Date.now() - acceptedAt.getTime()) : 0;
          const isQuickCancel = elapsedMs < 10 * 60 * 1000; // 10 minutes

          // 1. Reset task status
          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            status: 'open',
            acceptorId: deleteField(),
            acceptorName: deleteField(),
            updatedAt: serverTimestamp()
          });

          await sendNotification({
            userId: task.requesterId,
            type: 'task_unaccepted',
            taskId: task.id,
            taskNum: task.taskNum || '',
            taskContent: task.content || '',
            senderId: user.uid,
            senderName: user.displayName || user.email || '未知使用者',
          });

          // 2. Apply security cooling down if it's a quick cancel (prevent contact collection spam)
          if (isQuickCancel) {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              lastCancelledAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            // Update local storage
            localStorage.setItem(`lastCancelledAt_${user.uid}`, Date.now().toString());
          }
        } catch (error: any) {
          try {
            handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
          } catch (e) {
            console.error('Firestore operation failed:', e);
          }
          const isOffline = error?.message?.includes('offline') || !window.navigator.onLine;
          setConfirmConfig({
            title: '操作失敗',
            message: isOffline 
              ? '您目前似乎處於離線狀態，請檢查您的網路連線後再試。' 
              : `操作失敗：${error?.message || '未知錯誤'}`,
            onConfirm: () => {},
            showCancel: false
          });
        }
      }
    });
  };

  const handleComplete = async () => {
    if (!user || user.uid !== task.requesterId) return;
    
    setConfirmConfig({
      title: '完成結案',
      message: '是否確認完成此任務並結案？',
      onConfirm: async () => {
        try {
          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            status: 'completed',
            updatedAt: serverTimestamp()
          });

          if (task.acceptorId) {
            await sendNotification({
              userId: task.acceptorId,
              type: 'task_completed',
              taskId: task.id,
              taskNum: task.taskNum || '',
              taskContent: task.content || '',
              senderId: user.uid,
              senderName: user.displayName || user.email || '委託人',
            });
          }
        } catch (error: any) {
          try {
            handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
          } catch (e) {
            console.error('Firestore operation failed:', e);
          }
          const isOffline = error?.message?.includes('offline') || !window.navigator.onLine;
          setConfirmConfig({
            title: '操作失敗',
            message: isOffline 
              ? '您目前似乎處於離線狀態，請檢查您的網路連線後再試。' 
              : `操作失敗：${error?.message || '未知錯誤'}`,
            onConfirm: () => {},
            showCancel: false
          });
        }
      }
    });
  };

  const handleDelete = async () => {
    if (!user || user.uid !== task.requesterId) return;
    
    setConfirmConfig({
      title: '刪除委託',
      message: '是否確認刪除？',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            status: 'delete',
            updatedAt: serverTimestamp()
          });
        } catch (error: any) {
          try {
            handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
          } catch (e) {
            console.error('Firestore operation failed:', e);
          }
          const isOffline = error?.message?.includes('offline') || !window.navigator.onLine;
          setConfirmConfig({
            title: '操作失敗',
            message: isOffline 
              ? '您目前似乎處於離線狀態，請檢查您的網路連線後再試。' 
              : `操作失敗：${error?.message || '未知錯誤'}`,
            onConfirm: () => {},
            showCancel: false
          });
        }
      }
    });
  };

  const handleCancelByOwner = async () => {
    if (!user || user.uid !== task.requesterId) return;
    
    setConfirmConfig({
      title: '取消任務',
      message: '是否取消並刪除？',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            status: 'delete',
            updatedAt: serverTimestamp()
          });
        } catch (error: any) {
          try {
            handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
          } catch (e) {
            console.error('Firestore operation failed:', e);
          }
          const isOffline = error?.message?.includes('offline') || !window.navigator.onLine;
          setConfirmConfig({
            title: '操作失敗',
            message: isOffline 
              ? '您目前似乎處於離線狀態，請檢查您的網路連線後再試。' 
              : `操作失敗：${error?.message || '未知錯誤'}`,
            onConfirm: () => {},
            showCancel: false
          });
        }
      }
    });
  };


  const formatDate = (dateValue: any) => {
    try {
      if (!dateValue) return '';
      const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
      return date.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return String(dateValue);
    }
  };

  return (
    <>
      <motion.div
        layout
        id={`task-card-${task.id}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-red-200 hover:shadow-md transition-all duration-300 shadow-sm flex flex-col group h-full relative"
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-col gap-1">
            <span className={cn(
              "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight w-fit",
              task.status === 'open' && "bg-green-50 text-green-600",
              task.status === 'accepted' && "bg-blue-50 text-blue-600",
              task.status === 'completed' && "bg-slate-100 text-slate-500"
            )}>
              {task.status === 'open' && '開放中'}
              {task.status === 'accepted' && '進行中'}
              {task.status === 'completed' && '已結案'}
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {task.category && (
                <span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-[9px] font-bold">
                  📁 {task.category}
                </span>
              )}
              {task.region && (
                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded text-[9px] font-bold">
                  📍 {task.region}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
              <Hash size={10} />
              {task.taskNum}
            </div>
          </div>
          <span className="text-xl font-black text-slate-800 tabular-nums">
            {task.reward}
          </span>
        </div>

        <h3 className="font-bold text-slate-800 mb-2 line-clamp-2 group-hover:text-red-500 transition-colors">
          {task.content}
        </h3>
        
        <p className="text-xs text-slate-500 mb-4 flex-grow italic">
          由 {task.requesterName || '匿名用戶'} 於 {formatTimeAgo(task.createdAt?.toDate ? task.createdAt.toDate() : new Date())} 發布
        </p>

        <div className="mt-auto space-y-2 border-t pt-4 border-slate-50">
          <div className="flex items-center text-[11px] text-slate-500">
            <MapPin size={12} className="mr-2 opacity-40" />
            {task.location}
          </div>
          <div className="flex items-center text-[11px] text-slate-500">
            <Clock size={12} className="mr-2 opacity-40" />
            {formatDate(task.deadlineStart)} ~ {formatDate(task.deadlineEnd)}
          </div>
          
          { (task.status === 'accepted' && (isOwner || isAcceptor)) || (task.status === 'open' && isOwner) ? (
            <div className="flex items-center text-[11px] text-indigo-600 font-semibold bg-indigo-50 p-2 rounded-lg break-all">
              <Phone size={12} className="mr-2 flex-shrink-0" />
              聯絡方式：{task.contact}
            </div>
          ) : task.status === 'accepted' && !isOwner && !isAcceptor ? (
            <div className="flex items-center text-[11px] text-slate-400 font-semibold bg-slate-50 p-2 rounded-lg">
              <Phone size={12} className="mr-2 flex-shrink-0" />
              任務進行中，僅相關人員可見
            </div>
          ) : task.status === 'open' && !isOwner ? (
            <div className="flex items-center text-[11px] text-slate-400 font-semibold bg-slate-50 p-2 rounded-lg">
              <Phone size={12} className="mr-2 flex-shrink-0" />
              承接任務後即可查看聯絡方式
            </div>
          ) : null }

          <div className="pt-2 flex flex-col gap-2">
            {/* Accept Action */}
            {task.status === 'open' && !isOwner && user && (
              <button
                onClick={handleAccept}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all transform active:scale-95"
              >
                立刻承接任務
              </button>
            )}

            {/* Acceptor Actions */}
            {task.status === 'accepted' && isAcceptor && (
              <button
                onClick={handleCancelAccept}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all transform active:scale-95 flex items-center justify-center gap-1"
              >
                <XCircle size={14} />
                取消承接
              </button>
            )}

            {/* Owner Actions */}
            {isOwner && (
              <div className="flex flex-col gap-2">
                {task.status === 'open' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Edit2 size={12} />
                      編輯
                    </button>
                    <button
                      onClick={handleDelete}
                      className="py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Trash2 size={12} />
                      刪除
                    </button>
                  </div>
                )}
                {task.status === 'accepted' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleComplete}
                      className="py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all transform active:scale-95 flex items-center justify-center gap-1"
                    >
                      <CheckCircle size={14} />
                      完成結案
                    </button>
                    <button
                      onClick={handleCancelByOwner}
                      className="py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <XCircle size={14} />
                      取消並刪除
                    </button>
                  </div>
                )}
                {task.status === 'completed' && (
                  <div className="w-full py-2 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold text-center italic">
                    任務已圓滿結束
                  </div>
                )}
              </div>
            )}

            {!isOwner && task.status === 'completed' && (
              <div className="w-full py-2 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold text-center italic">
                任務已結案
              </div>
            )}
            
            {!isOwner && task.status === 'accepted' && !isAcceptor && (
              <div className="w-full py-2 bg-blue-50 text-blue-400 rounded-xl text-xs font-bold text-center">
                任務進行中
              </div>
            )}
          </div>

          {/* Bidirectional Rating Section */}
          {task.status === 'completed' && user && !ratingSuccess && (
            (() => {
              const showRequesterRating = isOwner && !task.requesterRated;
              const showAcceptorRating = isAcceptor && !task.acceptorRated;

              if (!showRequesterRating && !showAcceptorRating) return null;

              const targetId = showRequesterRating ? task.acceptorId : task.requesterId;
              const targetName = showRequesterRating ? (task.acceptorName || '承接人') : (task.requesterName || '委託人');
              const targetRole = showRequesterRating ? 'acceptor' : 'requester';

              if (!targetId) return null;

              const handleSubmitLocalRating = async () => {
                setIsSubmittingRating(true);
                try {
                  await submitRating({
                    taskId: task.id,
                    taskNum: task.taskNum || '',
                    raterId: user.uid,
                    raterName: user.displayName || user.email || '平台用戶',
                    targetId: targetId,
                    targetName: targetName,
                    targetRole: targetRole as 'requester' | 'acceptor',
                    rating: ratingValue,
                    comment: ratingComment
                  });
                  setRatingSuccess(true);
                } catch (err) {
                  console.error('Error submitting rating:', err);
                } finally {
                  setIsSubmittingRating(false);
                }
              };

              return (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3 animate-fade-in">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Star size={13} className="text-amber-500 fill-amber-500" />
                    <span>給予「{targetName}」雙向評價</span>
                  </h4>
                  
                  {/* Stars Selector */}
                  <div className="flex gap-1.5 items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRatingValue(star)}
                        className="text-2xl focus:outline-none transition-transform hover:scale-125"
                      >
                        <span className={cn(
                          "transition-colors",
                          star <= ratingValue ? "text-amber-400" : "text-slate-300"
                        )}>
                          ★
                        </span>
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-500 ml-2">
                      {ratingValue} 顆星 ({
                        ratingValue === 5 ? '極佳' :
                        ratingValue === 4 ? '良好' :
                        ratingValue === 3 ? '普通' :
                        ratingValue === 2 ? '待加強' : '非常不滿'
                      })
                    </span>
                  </div>

                  {/* Comment Input */}
                  <textarea
                    placeholder="寫點感謝的話或回饋吧 (選填)..."
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none bg-white min-h-[60px]"
                  />

                  <button
                    onClick={handleSubmitLocalRating}
                    disabled={isSubmittingRating}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                  >
                    {isSubmittingRating ? '提交中...' : '送出評價 🚀'}
                  </button>
                </div>
              );
            })()
          )}

          {ratingSuccess && (
            <div className="mt-4 p-4 bg-green-50 border border-green-100 rounded-xl text-center text-xs font-bold text-green-700">
              🎉 雙向評價成功！評價已發佈。
            </div>
          )}

          {/* Smart Match Experts Recommended Section */}
          {isOwner && (task.status === 'open' || task.status === 'accepted') && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              {loadingExperts ? (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-xs text-slate-400 gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  <span>正在智慧媒合最佳超人推薦...</span>
                </div>
              ) : matchedExperts.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center text-[10px] text-slate-400">
                  🤖 暫無此類別的歷史結案專家。本委託已自動廣播給符合此偏好的超人們！
                </div>
              ) : (
                <div className="p-3 bg-red-50/40 border border-red-100/50 rounded-xl space-y-2.5">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <span>🤖</span>
                      <span>「{task.category}」智慧媒合專家</span>
                    </h4>
                    <span className="text-[9px] bg-red-500 text-white font-bold px-1 rounded animate-pulse">
                      極速推薦
                    </span>
                  </div>
                  
                  <div className="space-y-1.5">
                    {matchedExperts.map((exp) => (
                      <div key={exp.uid} className="bg-white p-2.5 rounded-lg border border-slate-100 flex items-center justify-between gap-2 shadow-sm">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-bold text-slate-800">{exp.displayName}</span>
                            {exp.activeTitle && (
                              <span className="px-1 py-0.2 bg-amber-50 text-amber-600 font-bold text-[8px] border border-amber-200/40 rounded">
                                🏆 {exp.activeTitle}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-semibold">
                            <span className="text-amber-500">★ {exp.rating} ({exp.ratingCount})</span>
                            <span>•</span>
                            <span>結案: {exp.count}次</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleInviteExpert(exp.uid, exp.displayName)}
                          disabled={notifiedExperts.includes(exp.uid)}
                          className={cn(
                            "px-2 py-1 rounded-md text-[9px] font-black transition-all shrink-0",
                            notifiedExperts.includes(exp.uid)
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "bg-red-500 hover:bg-red-600 text-white active:scale-95"
                          )}
                        >
                          {notifiedExperts.includes(exp.uid) ? '已發送邀請 ✔️' : '私訊委託 💌'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {isEditing && (
        <TaskForm taskToEdit={task} onClose={() => setIsEditing(false)} />
      )}

      {confirmConfig && (
        <ConfirmDialog
          isOpen={true}
          title={confirmConfig.title}
          message={confirmConfig.message}
          variant={confirmConfig.variant}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(null)}
          showCancel={confirmConfig.showCancel}
          confirmText="確認"
        />
      )}
    </>
  );
};
