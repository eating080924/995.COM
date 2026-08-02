import React, { useState, useEffect } from 'react';
import { Task } from '../types';
import { cn, formatTimeAgo } from '../lib/utils';
import { MapPin, Clock, Trash2, Edit2, Phone, CheckCircle, UserCircle, XCircle, Hash, Award, MessageSquare, Loader2, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp, deleteField, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
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
  const [isExpertsExpanded, setIsExpertsExpanded] = useState(false);

  // States and effects for Anti-Stuck & Auto-Timeout Mechanisms
  const [canReportNoContact, setCanReportNoContact] = useState(false);
  const [timeLeftToReport, setTimeLeftToReport] = useState<string>('');
  const [ownerConfirmTimeLeft, setOwnerConfirmTimeLeft] = useState<string>('');
  const [autoCompleteTimeLeft, setAutoCompleteTimeLeft] = useState<string>('');
  const [canReportStaleProgress, setCanReportStaleProgress] = useState(false);
  const [staleProgressTimeLeft, setStaleProgressTimeLeft] = useState<string>('');

  // ⚡ 防卡死自動超時驗收結案 (到達預計結束時間無回應自動審核)
  const triggerAutoCompletion = async () => {
    if (!user) return;
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: 'completed',
        autoCompletedBySystem: true,
        updatedAt: serverTimestamp()
      });

      await sendNotification({
        userId: task.requesterId,
        type: 'task_accepted',
        taskId: task.id,
        taskNum: task.taskNum || '',
        taskContent: `⚡ 系統防卡死自動結案：因已達預計結束時間且未手動驗收，系統已自動為您完成驗收結案！`,
        senderId: 'system',
        senderName: '系統管理員'
      });

      if (task.acceptorId) {
        await sendNotification({
          userId: task.acceptorId,
          type: 'task_accepted',
          taskId: task.id,
          taskNum: task.taskNum || '',
          taskContent: `🎉 委託 [${task.taskNum}] 已由系統防卡死機制自動審核結案！恭喜累積完成次數。`,
          senderId: 'system',
          senderName: '系統管理員'
        });
      }
    } catch (err) {
      console.error('Auto completion failed:', err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
      } catch (e) {
        console.error('Firestore operation failed:', e);
      }
    }
  };

  // ⚡ 防卡死自動 24 小時無聯繫重開與記錄違規
  const triggerAutoNoContactReset = async () => {
    if (!user) return;
    try {
      const originalAcceptorId = task.acceptorId;
      if (!originalAcceptorId) return;

      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: 'open',
        acceptorId: deleteField(),
        acceptorName: deleteField(),
        acceptedAt: deleteField(),
        acceptorContacted: deleteField(),
        acceptorContactedAt: deleteField(),
        acceptorCompleted: deleteField(),
        acceptorCompletedAt: deleteField(),
        updatedAt: serverTimestamp()
      });

      await sendNotification({
        userId: originalAcceptorId,
        type: 'task_unaccepted',
        taskId: task.id,
        taskNum: task.taskNum || '',
        taskContent: `⚡ 系統防卡死自動重開：因您承接任務後逾 24 小時未回報「已主動聯繫」，系統已自動取消您的承接資格並重開任務。`,
        senderId: 'system',
        senderName: '系統管理員'
      });

      const accUserRef = doc(db, 'users', originalAcceptorId);
      const accUserSnap = await getDoc(accUserRef);
      if (accUserSnap.exists()) {
        const accData = accUserSnap.data();
        const currentViolations = accData.noContactViolationsCount || accData.noContactStrikes || 0;
        const newViolations = currentViolations + 1;

        let penaltyStatus: 'none' | 'suspended' | 'banned' = 'none';
        let bannedUntil: Date | null = null;
        let penaltyApplied = '';

        if (newViolations === 1) {
          penaltyStatus = 'none';
          penaltyApplied = '平台警告（第 1 次無故未聯繫違規）';
        } else if (newViolations === 2) {
          penaltyStatus = 'none';
          penaltyApplied = '平台警告與信用提醒（第 2 次無故未聯繫違規）';
        } else if (newViolations === 3) {
          penaltyStatus = 'suspended';
          bannedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          penaltyApplied = '限制承接任務 3 天（第 3 次無故未聯繫違規）';
        } else if (newViolations === 4) {
          penaltyStatus = 'suspended';
          bannedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          penaltyApplied = '限制承接任務 7 天（第 4 次無故未聯繫違規）';
        } else {
          penaltyStatus = 'banned';
          penaltyApplied = '帳號永久封鎖（第 5 次無故未聯繫違規）';
        }

        await updateDoc(accUserRef, {
          noContactViolationsCount: newViolations,
          noContactStrikes: newViolations,
          penaltyStatus,
          bannedUntil: bannedUntil ? bannedUntil : deleteField(),
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'violation_logs'), {
          userId: originalAcceptorId,
          userName: task.acceptorName || '在線超人',
          taskId: task.id,
          taskNum: task.taskNum || '',
          reporterId: 'system',
          reason: '24小時超時未聯繫 (系統自動觸發)',
          penaltyApplied: penaltyApplied,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error('Auto no-contact reset failed:', err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
      } catch (e) {
        console.error('Firestore operation failed:', e);
      }
    }
  };

  // ⚡ 系統防卡死：逾預計結束時間未完工，系統自動重開委託
  const triggerAutoStaleProgressReset = async () => {
    if (!user) return;
    try {
      const originalAcceptorId = task.acceptorId;
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: 'open',
        acceptorId: deleteField(),
        acceptorName: deleteField(),
        acceptedAt: deleteField(),
        acceptorContacted: deleteField(),
        acceptorContactedAt: deleteField(),
        ownerConfirmedContact: deleteField(),
        ownerConfirmedContactAt: deleteField(),
        acceptorCompleted: deleteField(),
        acceptorCompletedAt: deleteField(),
        updatedAt: serverTimestamp()
      });

      if (originalAcceptorId) {
        await sendNotification({
          userId: originalAcceptorId,
          type: 'task_unaccepted',
          taskId: task.id,
          taskNum: task.taskNum || '',
          taskContent: `⚡ 系統自動重開委託：您承接的委託 [${task.taskNum}] 因已逾預計結束時間未回報完工，系統已自動重開委託，您的承接資格已釋放。`,
          senderId: 'system',
          senderName: '系統管理員'
        });
      }

      await sendNotification({
        userId: task.requesterId,
        type: 'task_unaccepted',
        taskId: task.id,
        taskNum: task.taskNum || '',
        taskContent: `⚡ 系統自動重開委託：您的委託 [${task.taskNum}] 因承接者已逾預計結束時間未回報完工，系統已自動為您重開委託為【開放中】。`,
        senderId: 'system',
        senderName: '系統管理員'
      });
    } catch (err) {
      console.error('Auto stale progress reset failed:', err);
    }
  };

  // ⚡ 防卡死：委託人 1 小時未確認聯繫自動重開
  const triggerAutoOwnerUnconfirmedReset = async () => {
    if (!user) return;
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: 'open',
        acceptorId: deleteField(),
        acceptorName: deleteField(),
        acceptedAt: deleteField(),
        acceptorContacted: deleteField(),
        acceptorContactedAt: deleteField(),
        ownerConfirmedContact: deleteField(),
        ownerConfirmedContactAt: deleteField(),
        acceptorCompleted: deleteField(),
        acceptorCompletedAt: deleteField(),
        updatedAt: serverTimestamp()
      });

      if (task.acceptorId) {
        await sendNotification({
          userId: task.acceptorId,
          type: 'task_unaccepted',
          taskId: task.id,
          taskNum: task.taskNum || '',
          taskContent: `⚡ 系統自動調整：因委託人逾 1 小時未按下「確認聯繫」，任務已自動重開為開放中，釋放您的承接資格。`,
          senderId: 'system',
          senderName: '系統管理員'
        });
      }
    } catch (err) {
      console.error('Auto owner unconfirmed contact reset failed:', err);
    }
  };

  // Helper function to safely parse any date format (Timestamp, Date, String, Number)
  const parseTaskDate = (dateVal: any): Date | null => {
    if (!dateVal) return null;
    try {
      if (typeof dateVal.toDate === 'function') {
        const d = dateVal.toDate();
        return isNaN(d.getTime()) ? null : d;
      }
      if (dateVal instanceof Date) {
        return isNaN(dateVal.getTime()) ? null : dateVal;
      }
      if (typeof dateVal === 'number') {
        const d = new Date(dateVal);
        return isNaN(d.getTime()) ? null : d;
      }
      if (typeof dateVal === 'string') {
        const formatted = dateVal.includes(' ') && !dateVal.includes('T') ? dateVal.replace(' ', 'T') : dateVal;
        const d = new Date(formatted);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? null : d;
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    if (task.status !== 'accepted' || !task.acceptorId) {
      setCanReportNoContact(false);
      setTimeLeftToReport('');
      setOwnerConfirmTimeLeft('');
      setAutoCompleteTimeLeft('');
      setCanReportStaleProgress(false);
      setStaleProgressTimeLeft('');
      return;
    }

    const calculateTimers = () => {
      const now = Date.now();

      // (A) 承接者 24 小時未回報聯繫自動重開
      const acceptedTime = parseTaskDate(task.acceptedAt) || parseTaskDate(task.updatedAt) || parseTaskDate(task.createdAt) || new Date();
      
      const oneHourMs = 60 * 60 * 1000;
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const elapsedAccept = now - acceptedTime.getTime();

      if (!task.acceptorContacted) {
        if (elapsedAccept >= oneHourMs) {
          setCanReportNoContact(true);
          setTimeLeftToReport('');
        } else {
          setCanReportNoContact(false);
          const mins = Math.ceil((oneHourMs - elapsedAccept) / (60 * 1000));
          setTimeLeftToReport(`需等待承接滿 1 個小時（剩餘 ${mins} 分鐘）`);
        }

        if (elapsedAccept >= twentyFourHoursMs) {
          triggerAutoNoContactReset();
          return;
        }
      }

      // (B) 委託者 1 小時未「確認承接者已聯繫」自動重開
      if (task.acceptorContacted && !task.ownerConfirmedContact) {
        const contactedTime = parseTaskDate(task.acceptorContactedAt) || acceptedTime;

        const elapsedContact = now - contactedTime.getTime();
        const remainingOwnerConfirm = oneHourMs - elapsedContact;
        if (remainingOwnerConfirm <= 0) {
          triggerAutoOwnerUnconfirmedReset();
          return;
        } else {
          const totalMins = Math.ceil(remainingOwnerConfirm / (1000 * 60));
          const hoursLeft = Math.floor(totalMins / 60);
          const minsLeft = totalMins % 60;
          if (hoursLeft > 0) {
            setOwnerConfirmTimeLeft(`${hoursLeft} 小時 ${minsLeft} 分鐘`);
          } else {
            setOwnerConfirmTimeLeft(`${minsLeft} 分鐘`);
          }
        }
      } else {
        setOwnerConfirmTimeLeft('');
      }

      // (C) 承接者已回報完成，依據「預計結束時間 (deadlineEnd)」進行自動驗收結案計時
      if (task.acceptorCompleted) {
        const deadlineDate = parseTaskDate(task.deadlineEnd);
        
        if (deadlineDate) {
          const remainingComplete = deadlineDate.getTime() - now;
          if (remainingComplete <= 0) {
            triggerAutoCompletion();
            return;
          } else {
            const totalMins = Math.ceil(remainingComplete / (1000 * 60));
            const hoursLeft = Math.floor(totalMins / 60);
            const minsLeft = totalMins % 60;
            if (hoursLeft > 0) {
              setAutoCompleteTimeLeft(`${hoursLeft} 小時 ${minsLeft} 分鐘`);
            } else {
              setAutoCompleteTimeLeft(`${minsLeft} 分鐘`);
            }
          }
        } else {
          // 相容舊資料未設定 deadlineEnd：完工後 48 小時自動結案
          const completedTime = parseTaskDate(task.acceptorCompletedAt) || parseTaskDate(task.updatedAt) || new Date();
          
          const fortyEightHoursMs = 48 * 60 * 60 * 1000;
          const elapsedComplete = now - completedTime.getTime();
          const remainingComplete = fortyEightHoursMs - elapsedComplete;

          if (remainingComplete <= 0) {
            triggerAutoCompletion();
            return;
          } else {
            const totalMins = Math.ceil(remainingComplete / (1000 * 60));
            const hoursLeft = Math.floor(totalMins / 60);
            const minsLeft = totalMins % 60;
            if (hoursLeft > 0) {
              setAutoCompleteTimeLeft(`${hoursLeft} 小時 ${minsLeft} 分鐘`);
            } else {
              setAutoCompleteTimeLeft(`${minsLeft} 分鐘`);
            }
          }
        }
      }

      // (D) 承接者未回報完成，依據「預計結束時間 (deadlineEnd)」進行系統自動重開委託計時
      if (!task.acceptorCompleted) {
        const deadlineDate = parseTaskDate(task.deadlineEnd);
        if (deadlineDate) {
          const remainingContact = deadlineDate.getTime() - now;
          if (remainingContact <= 0) {
            triggerAutoStaleProgressReset();
            return;
          } else {
            setCanReportStaleProgress(false);
            const totalMins = Math.ceil(remainingContact / (1000 * 60));
            const hoursLeft = Math.floor(totalMins / 60);
            const minsLeft = totalMins % 60;
            if (hoursLeft > 0) {
              setStaleProgressTimeLeft(`${hoursLeft} 小時 ${minsLeft} 分鐘`);
            } else {
              setStaleProgressTimeLeft(`${minsLeft} 分鐘`);
            }
          }
        } else if (task.acceptorContacted) {
          // 若無 deadlineEnd，相容舊邏輯以聯繫時間起算 48 小時自動重開
          const contactedTime = parseTaskDate(task.acceptorContactedAt) || acceptedTime;

          const fortyEightHoursMs = 48 * 60 * 60 * 1000;
          const elapsedContact = now - contactedTime.getTime();
          const remainingContact = fortyEightHoursMs - elapsedContact;

          if (remainingContact <= 0) {
            triggerAutoStaleProgressReset();
            return;
          } else {
            setCanReportStaleProgress(false);
            const totalMins = Math.ceil(remainingContact / (1000 * 60));
            const hoursLeft = Math.floor(totalMins / 60);
            const minsLeft = totalMins % 60;
            if (hoursLeft > 0) {
              setStaleProgressTimeLeft(`${hoursLeft} 小時 ${minsLeft} 分鐘`);
            } else {
              setStaleProgressTimeLeft(`${minsLeft} 分鐘`);
            }
          }
        }
      }
    };

    calculateTimers();
    const interval = setInterval(calculateTimers, 10000);
    return () => clearInterval(interval);
  }, [task.status, task.acceptedAt, task.acceptorContacted, task.acceptorContactedAt, task.ownerConfirmedContact, task.ownerConfirmedContactAt, task.acceptorCompleted, task.acceptorCompletedAt, task.acceptorId]);

  // Acceptor profile state for displaying active title
  const [acceptorProfile, setAcceptorProfile] = useState<{ activeTitle?: string } | null>(null);

  useEffect(() => {
    if (!task.acceptorId) {
      setAcceptorProfile(null);
      return;
    }
    const fetchAcceptorProfile = async () => {
      try {
        const uRef = doc(db, 'users', task.acceptorId!);
        const uSnap = await getDoc(uRef);
        if (uSnap.exists()) {
          const uData = uSnap.data();
          setAcceptorProfile({
            activeTitle: uData.activeTitle || '',
          });
        }
      } catch (err) {
        console.error('Error fetching acceptor profile:', err);
      }
    };
    fetchAcceptorProfile();
  }, [task.acceptorId]);

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
      const localElapsed = Date.now() - parseInt(localLastCancel, 1); //10
      if (localElapsed < 10 * 60 * 1000) { // 10 minutes  if (localElapsed < 10 * 60 * 1000)
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

            // Check for Banned Status
            if (userData.penaltyStatus === 'banned') {
              setConfirmConfig({
                title: '帳號已被封鎖 🚫',
                message: '因您多次違反「無故未聯繫」或平台守則，此帳號已被系統永久封鎖，無法承接任何新任務。',
                onConfirm: () => {},
                showCancel: false
              });
              return;
            }

            // Check for Suspended Status
            if (userData.penaltyStatus === 'suspended' && userData.bannedUntil) {
              const bannedUntilDate = userData.bannedUntil.toDate ? userData.bannedUntil.toDate() : new Date(userData.bannedUntil);
              if (bannedUntilDate.getTime() > Date.now()) {
                const remainingDays = Math.ceil((bannedUntilDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                setConfirmConfig({
                  title: '帳號暫停接單中 ⏳',
                  message: `因您先前多次「無故未聯繫」被回報，帳號目前處於暫停接單懲罰中，剩餘時間：約 ${remainingDays} 天 (截止至 ${bannedUntilDate.toLocaleDateString()} ${bannedUntilDate.toLocaleTimeString()})。`,
                  onConfirm: () => {},
                  showCancel: false
                });
                return;
              }
            }

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
          
          if (activeTasksSnapshot.size >= 5) {
            setConfirmConfig({
              title: '已達承接上限 ⚠️',
              message: '每位使用者同時最多僅能承接 5 件進行中的任務。請待現有任務完成驗收或結案後，再承接新任務！',
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
            acceptedAt: serverTimestamp(),
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
    
    // Calculate hold duration
    const acceptedAt = task.acceptedAt?.toDate 
      ? task.acceptedAt.toDate() 
      : (task.acceptedAt ? new Date(task.acceptedAt) : (task.updatedAt?.toDate ? task.updatedAt.toDate() : new Date()));
    const elapsedMs = Date.now() - acceptedAt.getTime();
    const isWithin10Mins = elapsedMs <= 10 * 60 * 1000; // 10 minutes

    setConfirmConfig({
      title: '是否確認取消承接此任務？',
      message: isWithin10Mins
        ? '⚠️ 系統警示：您於承接後 10 分鐘內選擇取消承接。根據規範，系統將記違規 1 次並更新至您的個人信用檔案，任務將卡片狀態設為【開放中】。確定要取消嗎？'
        : '⚠️ 提醒：取消承接後，任務將重置為【開放中】狀態開放給其他超人承接。確定要取消嗎？',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const originalAcceptorId = user.uid;

          // 1. Reset task status to 'open'
          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            status: 'open',
            acceptorId: deleteField(),
            acceptorName: deleteField(),
            acceptedAt: deleteField(),
            acceptorContacted: deleteField(),
            acceptorContactedAt: deleteField(),
            ownerConfirmedContact: deleteField(),
            ownerConfirmedContactAt: deleteField(),
            acceptorCompleted: deleteField(),
            acceptorCompletedAt: deleteField(),
            updatedAt: serverTimestamp()
          });

          await sendNotification({
            userId: task.requesterId,
            type: 'task_unaccepted',
            taskId: task.id,
            taskNum: task.taskNum || '',
            taskContent: `承接超人 ${user.displayName || '在線超人'} 已取消承接委託 [${task.taskNum}]，任務已重置為開放中。`,
            senderId: user.uid,
            senderName: user.displayName || user.email || '在線超人',
          });

          // 2. If cancelled within 10 mins, add +1 violation strike
          if (isWithin10Mins) {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const uData = userSnap.data();
              const currentViolations = uData.noContactViolationsCount || uData.noContactStrikes || 0;
              const newViolations = currentViolations + 1;

              let penaltyStatus: 'none' | 'suspended' | 'banned' = 'none';
              let bannedUntil: Date | null = null;
              let penaltyApplied = '';

              if (newViolations === 1) {
                penaltyStatus = 'none';
                penaltyApplied = '平台警告（第 1 次 10分鐘內棄單違規）';
              } else if (newViolations === 2) {
                penaltyStatus = 'none';
                penaltyApplied = '平台警告（第 2 次 10分鐘內棄單違規）';
              } else if (newViolations === 3) {
                penaltyStatus = 'suspended';
                bannedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                penaltyApplied = '限制承接任務 3 天（第 3 次違規）';
              } else if (newViolations === 4) {
                penaltyStatus = 'suspended';
                bannedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                penaltyApplied = '限制承接任務 7 天（第 4 次違規）';
              } else {
                penaltyStatus = 'banned';
                penaltyApplied = '帳號永久封鎖（第 5 次違規）';
              }

              await updateDoc(userRef, {
                noContactViolationsCount: newViolations,
                noContactStrikes: newViolations,
                penaltyStatus,
                bannedUntil: bannedUntil ? bannedUntil : deleteField(),
                lastCancelledAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });

              await addDoc(collection(db, 'violation_logs'), {
                userId: originalAcceptorId,
                userName: user.displayName || '在線超人',
                taskId: task.id,
                taskNum: task.taskNum || '',
                reporterId: 'system',
                reason: '承接後 10 分鐘內取消承接 (棄單違規)',
                penaltyApplied: penaltyApplied,
                createdAt: serverTimestamp()
              });
            }
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
    
    if (!task.acceptorCompleted) {
      setConfirmConfig({
        title: '尚未解鎖結案 🔒',
        message: '承接者尚未回報「任務已完成」。請待承接者點擊回報完工後，再進行驗收結案。',
        onConfirm: () => {},
        showCancel: false
      });
      return;
    }

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

    if (task.ownerConfirmedContact || task.acceptorCompleted) {
      setConfirmConfig({
        title: '無法刪除任務 🔒',
        message: task.acceptorCompleted 
          ? '承接者已回報「任務已完成」，為保障超人權益，本階段不開放單方面直接取消或刪除任務。'
          : '您已確認「承接者已聯繫」，任務已進入正式執行與鎖定階段，無法直接刪除！',
        onConfirm: () => {},
        showCancel: false
      });
      return;
    }
    
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
    
    if (task.ownerConfirmedContact || task.acceptorCompleted) {
      setConfirmConfig({
        title: '無法取消任務 🔒',
        message: task.acceptorCompleted 
          ? '承接者已回報「任務已完成」，為保障承接者權益，本階段不開放單方面直接取消或刪除任務。請於確認無誤後點擊「確認完成結案」。'
          : '您已確認「承接者已聯繫」，任務已進入正式執行與鎖定階段，不開放單方面直接取消或刪除。若有特殊需求請先與承接者協商。',
        onConfirm: () => {},
        showCancel: false
      });
      return;
    }

    setConfirmConfig({
      title: '確認要取消並刪除此任務嗎？',
      message: '⚠️ 提醒：此任務已在進行中（已由承接者承接）。若承接者已付出勞動，請務必先與其溝通。隨意取消可能會被投訴並限制發布權限。是否仍要取消並刪除？',
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

  const handleOwnerConfirmContact = async () => {
    if (!user || user.uid !== task.requesterId) return;

    setConfirmConfig({
      title: '確認承接者已聯繫？',
      message: '確認聯繫後，任務將正式進入【執行階段】。',
      onConfirm: async () => {
        try {
          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            ownerConfirmedContact: true,
            ownerConfirmedContactAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          if (task.acceptorId) {
            await sendNotification({
              userId: task.acceptorId,
              type: 'task_accepted',
              taskId: task.id,
              taskNum: task.taskNum || '',
              taskContent: `委託人已按下「確認承接者已聯繫」，任務正式鎖定並啟動執行！`,
              senderId: user.uid,
              senderName: user.displayName || user.email || '委託人',
            });
          }
        } catch (error: any) {
          console.error('Failed to confirm contact:', error);
        }
      }
    });
  };

  const handleReportContacted = async () => {
    if (!user || user.uid !== task.acceptorId) return;

    setConfirmConfig({
      title: '確認已與委託人聯繫？',
      message: '回報聯繫後，委託人將收到通知，且代表您已開始處理此任務。',
      onConfirm: async () => {
        try {
          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            acceptorContacted: true,
            acceptorContactedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await sendNotification({
            userId: task.requesterId,
            type: 'task_accepted',
            taskId: task.id,
            taskNum: task.taskNum || '',
            taskContent: `承接超人 ${user.displayName || '在線超人'} 已回報與您取得聯繫，任務正式啟動！`,
            senderId: user.uid,
            senderName: user.displayName || user.email || '在線超人',
          });
        } catch (error: any) {
          console.error('Failed to report contact:', error);
        }
      }
    });
  };

  const handleReportNoContact = async () => {
    if (!user || user.uid !== task.requesterId) return;
    if (!canReportNoContact) {
      setConfirmConfig({
        title: '時間未到 ⌛',
        message: `為保障雙方權益，承接者有 1 小時的聯繫與處理時間。${timeLeftToReport}。`,
        onConfirm: () => {},
        showCancel: false
      });
      return;
    }

    setConfirmConfig({
      title: '回報無故未聯繫並重新發布？',
      message: '⚠️ 您即將回報承接者「承接後無故未與您聯繫」。確認後：\n1. 任務將重回【開放中】狀態，讓其他超人承接。\n2. 系統會記錄此事件，並自動依照違規次數對承接者施加「警告、停權 3~7 天、永久封鎖」等信用處罰。',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const originalAcceptorId = task.acceptorId;
          const taskRef = doc(db, 'tasks', task.id);
          
          await updateDoc(taskRef, {
            status: 'open',
            acceptorId: deleteField(),
            acceptorName: deleteField(),
            acceptedAt: deleteField(),
            acceptorContacted: deleteField(),
            acceptorContactedAt: deleteField(),
            acceptorCompleted: deleteField(),
            acceptorCompletedAt: deleteField(),
            updatedAt: serverTimestamp()
          });

          if (originalAcceptorId) {
            await sendNotification({
              userId: originalAcceptorId,
              type: 'task_unaccepted',
              taskId: task.id,
              taskNum: task.taskNum || '',
              taskContent: `您承接的委託 [${task.taskNum}] 因「未主動與委託人聯繫」已被回報並重開，您的承接資格已被取消。`,
              senderId: user.uid,
              senderName: user.displayName || '系統提醒',
            });

            // Increment noContactViolationsCount / noContactStrikes and apply automatic tier-based penalty
            const accUserRef = doc(db, 'users', originalAcceptorId);
            const accUserSnap = await getDoc(accUserRef);
            if (accUserSnap.exists()) {
              const accData = accUserSnap.data();
              const currentViolations = accData.noContactViolationsCount || accData.noContactStrikes || 0;
              const newViolations = currentViolations + 1;

              let penaltyStatus: 'none' | 'suspended' | 'banned' = 'none';
              let bannedUntil: Date | null = null;
              let penaltyApplied = '';

              if (newViolations === 1) {
                penaltyStatus = 'none';
                penaltyApplied = '平台警告（第 1 次無故未聯繫違規）';
              } else if (newViolations === 2) {
                penaltyStatus = 'none';
                penaltyApplied = '平台警告與信用提醒（第 2 次無故未聯繫違規）';
              } else if (newViolations === 3) {
                penaltyStatus = 'suspended';
                bannedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days suspension
                penaltyApplied = '限制承接任務 3 天（第 3 次無故未聯繫違規）';
              } else if (newViolations === 4) {
                penaltyStatus = 'suspended';
                bannedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days suspension
                penaltyApplied = '限制承接任務 7 天（第 4 次無故未聯繫違規）';
              } else {
                penaltyStatus = 'banned';
                penaltyApplied = '帳號永久封鎖（第 5 次無故未聯繫違規）';
              }

              // Update profile
              await updateDoc(accUserRef, {
                noContactViolationsCount: newViolations,
                noContactStrikes: newViolations, // keep backward compatibility
                penaltyStatus,
                bannedUntil: bannedUntil ? bannedUntil : deleteField(),
                updatedAt: serverTimestamp()
              });

              // Create Violation Log
              await addDoc(collection(db, 'violation_logs'), {
                userId: originalAcceptorId,
                userName: task.acceptorName || '在線超人',
                taskId: task.id,
                taskNum: task.taskNum || '',
                reporterId: user.uid,
                reason: '無故未聯繫',
                penaltyApplied: penaltyApplied,
                createdAt: serverTimestamp()
              });

              // Send system warning notification to acceptor
              await sendNotification({
                userId: originalAcceptorId,
                type: 'task_unaccepted',
                taskId: task.id,
                taskNum: task.taskNum || '',
                taskContent: `⚠️ 系統處罰提醒：您已被委託人回報「無故未聯繫」。此事件已記錄在您的信用檔案中，當前處罰：${penaltyApplied}。請維護良好的接單信用。`,
                senderId: 'system',
                senderName: '系統管理員',
              });
            }
          }
        } catch (error: any) {
          console.error('Failed to report no-contact:', error);
        }
      }
    });
  };

  const handleReportCompleted = async () => {
    if (!user || user.uid !== task.acceptorId) return;

    if (!task.ownerConfirmedContact) {
      setConfirmConfig({
        title: '前置關卡未解鎖 🔒',
        message: '需待委託人點擊「確認承接者已主動聯繫」後，方可解鎖「回報任務已完成」按鈕。',
        onConfirm: () => {},
        showCancel: false
      });
      return;
    }

    setConfirmConfig({
      title: '確認已完成任務並回報？',
      message: '⚠️ 請確認您已確實完成委託內容。回報完成後：\n1. 委託人將收到完工確認通知，並由委託人進行結案。\n2. 委託人在您回報完成後將「無法直接取消或刪除任務」，以保障您的付出。',
      onConfirm: async () => {
        try {
          const taskRef = doc(db, 'tasks', task.id);
          await updateDoc(taskRef, {
            acceptorCompleted: true,
            acceptorCompletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await sendNotification({
            userId: task.requesterId,
            type: 'task_accepted',
            taskId: task.id,
            taskNum: task.taskNum || '',
            taskContent: `超人 ${user.displayName || '承接者'} 已回報「任務已完成」！請前往確認並進行結案。`,
            senderId: user.uid,
            senderName: user.displayName || user.email || '在線超人',
          });
        } catch (error: any) {
          console.error('Failed to report complete:', error);
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
        data-task-num={task.taskNum}
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

        {task.acceptorId && (
          <div className="mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <UserCircle size={28} className="text-slate-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-extrabold text-slate-700 truncate">
                  承接超人：{task.acceptorName || '在線超人'}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  {acceptorProfile?.activeTitle ? (
                    <span className="px-1 py-0.2 bg-amber-50 text-amber-600 font-bold text-[8px] border border-amber-200/40 rounded shrink-0">
                      🏆 {acceptorProfile.activeTitle}
                    </span>
                  ) : (
                    <span className="px-1 py-0.2 bg-slate-100 text-slate-500 font-bold text-[8px] border border-slate-200 rounded shrink-0">
                      無稱號
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
            {/* Contact Reporting States for In-Progress Tasks */}
            {task.status === 'accepted' && (
              <>
                {isAcceptor && (
                  <div className="mb-2">
                    {!task.acceptorContacted ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                        <p className="text-[10px] text-amber-800 leading-relaxed font-bold">
                          ⚠️ 提醒：請於承接後 24 小時內主動聯繫委託人並按下「我已主動聯繫委託人」。若 24 小時未聯繫，系統將自動重開任務並上記信用違規。
                        </p>
                        <button
                          onClick={handleReportContacted}
                          className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black transition-all transform active:scale-95 shadow-sm"
                        >
                          我已主動聯繫委託人
                        </button>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-xl border border-emerald-100 flex items-center justify-between shadow-sm">
                        <span>✔️ 您已回報已聯繫委託人</span>
                        <span className="text-[9px] text-emerald-500 font-mono">
                          {task.acceptorContactedAt ? formatDate(task.acceptorContactedAt) : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {isOwner && (
                  <div className="mb-2 space-y-2">
                    {!task.acceptorContacted ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <p className="text-[10px] leading-relaxed font-bold text-slate-600">
                          ⌛ 承接人尚未按下「我已主動聯繫委託人」。承接者須於 24 小時內主動聯繫並回報；當承接者回報後，請您於 1 小時內點擊「確認承接者已主動聯繫」。
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="p-2.5 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-xl border border-emerald-100 flex items-center justify-between shadow-sm">
                          <span>✔️ 承接者已回報主動聯繫您</span>
                          <span className="text-[9px] text-emerald-500 font-mono">
                            {task.acceptorContactedAt ? formatDate(task.acceptorContactedAt) : ''}
                          </span>
                        </div>

                        {!task.ownerConfirmedContact ? (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                            <p className="text-[10px] text-blue-800 leading-relaxed font-bold">
                              📢 請於承接者按下「我已主動聯繫委託人」後的 1 小時內點擊下方按鈕。若超過 1 小時未確認，系統將自動重開委託。確認後，將正式進入【執行鎖定階段】。
                            </p>
                            {ownerConfirmTimeLeft && (
                              <div className="p-2 bg-blue-100/80 border border-blue-200/80 rounded-lg text-[10px] text-blue-900 font-bold flex items-center gap-1.5 shadow-xs">
                                <span>⏱️ 委託人確認剩餘時間：</span>
                                <span className="font-mono text-blue-950 underline font-black">{ownerConfirmTimeLeft}</span>
                              </div>
                            )}
                            <button
                              onClick={handleOwnerConfirmContact}
                              className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black transition-all transform active:scale-95 shadow-sm"
                            >
                              確認承接者已主動聯繫
                            </button>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-indigo-50 text-indigo-800 text-[10px] font-bold rounded-xl border border-indigo-100 flex items-center justify-between shadow-sm">
                            <span>✔️ 雙方已確認聯繫</span>
                            <span className="text-[9px] text-indigo-500 font-mono">
                              {task.ownerConfirmedContactAt ? formatDate(task.ownerConfirmedContactAt) : ''}
                            </span>
                          </div>
                        )}

                        {!task.acceptorCompleted && (
                          <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-1 transition-all">
                            <p className="text-[10px] font-bold text-amber-900 leading-relaxed">
                              ⚡ <strong>預計結束時間自動重開保護中</strong>：若承接者未於預計結束時間內回報完工，系統將於 <span className="font-bold font-mono text-amber-950 underline">{staleProgressTimeLeft || '預計結束時間到達時'}</span> 自動重開委託恢復為開放中！
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

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
              <div className="flex flex-col gap-2 mt-1">
                {task.ownerConfirmedContact && (
                  <div className="p-2.5 bg-indigo-50 text-indigo-800 text-[10px] font-bold rounded-xl border border-indigo-100 flex items-center justify-between shadow-sm">
                    <span>✔️ 雙方已確認聯繫</span>
                    <span className="text-[9px] text-indigo-500 font-mono">
                      {task.ownerConfirmedContactAt ? formatDate(task.ownerConfirmedContactAt) : ''}
                    </span>
                  </div>
                )}

                {!task.acceptorCompleted ? (
                  <>
                    {!task.ownerConfirmedContact && (
                      <div className="p-3 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-xl border border-amber-200 flex flex-col gap-1.5 leading-relaxed shadow-sm">
                        <div className="flex items-start gap-1.5">
                          <span className="text-sm shrink-0">🔒</span>
                          <span>
                            <strong>前置關卡未解鎖</strong>：需待委託人於 1 小時內點擊「確認承接者已主動聯繫」後，方可解鎖「回報任務已完成」按鈕。若超過 1 小時委託人未確認，系統將自動重開委託。
                          </span>
                        </div>
                        {ownerConfirmTimeLeft && (
                          <div className="p-2 bg-amber-100/80 border border-amber-200/80 rounded-lg text-[10px] text-amber-900 font-bold flex items-center gap-1.5 shadow-xs">
                            <span>⏱️ 委託人確認倒數計時：</span>
                            <span className="font-mono text-amber-950 underline font-black">{ownerConfirmTimeLeft}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      disabled={!task.ownerConfirmedContact}
                      onClick={handleReportCompleted}
                      className={cn(
                        "w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm",
                        task.ownerConfirmedContact
                          ? "bg-green-600 hover:bg-green-700 text-white transform active:scale-95 cursor-pointer"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      )}
                    >
                      <CheckCircle size={14} />
                      回報任務已完成
                    </button>
                    <button
                      onClick={handleCancelAccept}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all transform active:scale-95 flex items-center justify-center gap-1"
                    >
                      <XCircle size={14} />
                      取消承接
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 flex flex-col gap-1 text-center shadow-sm">
                      <span className="flex items-center justify-center gap-1 text-emerald-600 font-black">
                        🏆 您已回報任務完成！
                      </span>
                      <p className="text-[9px] text-emerald-500 font-normal">
                        已自動鎖定此委託。委託人目前無法直接取消或刪除任務，正等待委託人進行驗收結案...
                      </p>
                      {autoCompleteTimeLeft && (
                        <div className="mt-1 p-1.5 bg-emerald-100/80 border border-emerald-200/80 rounded-lg text-[9px] text-emerald-800 font-medium">
                          ⚡ <strong>預計結束時間自動結案保護中</strong>：若委託人未於預計結束時間內回應，系統將於 <span className="font-bold font-mono text-emerald-950">{autoCompleteTimeLeft}</span> 後自動驗收結案！
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
                  <div className="flex flex-col gap-2">
                    {!task.acceptorCompleted && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                        <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                          🔒 <strong>等待承接者完工中</strong>：需待承接者點擊「回報任務已完成」後，方可解鎖「確認完成結案」按鈕。
                          {task.ownerConfirmedContact && (
                            <span className="block mt-1 text-slate-600 font-semibold">
                              🛡️ 已確認聯繫：系統已鎖定單方面「取消並刪除」功能以保障雙方權益。
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    {task.acceptorCompleted && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 mb-1.5">
                        <div className="flex items-center gap-1.5 text-amber-800 font-black text-xs">
                          <span>📢 承接人已回報任務完工！</span>
                        </div>
                        <p className="text-[10px] text-slate-600 leading-relaxed">
                          請在確認任務成果符合預期後，點擊「確認完成結案」。
                        </p>
                        {autoCompleteTimeLeft && (
                          <div className="p-2 bg-amber-100/80 border border-amber-200/80 rounded-lg text-[10px] text-amber-900 font-bold flex items-center gap-1 shadow-xs">
                            <span>⚡ 預計結束時間自動結案提醒：若未於預計結束時間內驗收，系統將於 <span className="font-mono text-amber-950 underline">{autoCompleteTimeLeft}</span> 後自動審核完成結案。</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleComplete}
                        disabled={!task.acceptorCompleted}
                        className={cn(
                          "py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm",
                          task.acceptorCompleted
                            ? "bg-green-600 hover:bg-green-700 text-white transform active:scale-95 cursor-pointer"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        )}
                      >
                        <CheckCircle size={14} />
                        確認完成結案
                      </button>
                      <button
                        onClick={handleCancelByOwner}
                        disabled={!!(task.ownerConfirmedContact || task.acceptorCompleted)}
                        className={cn(
                          "py-2.5 rounded-xl text-xs font-bold transition-all transform active:scale-95 flex items-center justify-center gap-1",
                          (task.ownerConfirmedContact || task.acceptorCompleted) 
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed active:scale-100"
                            : "bg-red-50 hover:bg-red-100 text-red-600"
                        )}
                      >
                        <XCircle size={14} />
                        取消並刪除
                      </button>
                    </div>
                  </div>
                )}
                {task.status === 'completed' && (
                  <div className="w-full py-2 bg-slate-50 text-slate-500 rounded-xl text-xs font-bold text-center italic flex items-center justify-center gap-1.5">
                    <span>任務已圓滿結束</span>
                    {task.autoCompletedBySystem && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-mono font-bold rounded-md not-italic border border-amber-200 shadow-xs">
                        ⚡ 系統防卡死自動結案
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isOwner && task.status === 'completed' && (
              <div className="w-full py-2 bg-slate-50 text-slate-500 rounded-xl text-xs font-bold text-center italic flex items-center justify-center gap-1.5">
                <span>任務已結案</span>
                {task.autoCompletedBySystem && (
                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-mono font-bold rounded-md not-italic border border-amber-200 shadow-xs">
                    ⚡ 系統防卡死自動結案
                  </span>
                )}
              </div>
            )}
            
            {!isOwner && task.status === 'accepted' && !isAcceptor && (
              <div className="w-full py-2 bg-blue-50 text-blue-400 rounded-xl text-xs font-bold text-center">
                任務進行中
              </div>
            )}
          </div>



          {/* Smart Match Experts Recommended Section */}
          {isOwner && (task.status === 'open' || task.status === 'accepted') && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsExpertsExpanded(!isExpertsExpanded)}
                className="w-full flex items-center justify-between py-1 px-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-slate-700">
                  <span>🤝 推薦名單</span>
                  {matchedExperts.length > 0 && (
                    <span className="bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.2 rounded-full">
                      {matchedExperts.length}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">
                  {isExpertsExpanded ? '收折 ▲' : '點擊展開'}
                </span>
              </button>

              {isExpertsExpanded && (
                <div className="mt-2.5 animate-fade-in">
                  {loadingExperts ? (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-xs text-slate-400 gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>自動媒合中...</span>
                    </div>
                  ) : matchedExperts.length === 0 ? (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center text-[10px] text-slate-400">
                      暫目前尚未有此類別的結案紀錄。別擔心，本委託已自動推播給符合偏好的超人們！
                    </div>
                  ) : (
                    <div className="p-3 bg-red-50/40 border border-red-100/50 rounded-xl space-y-2.5">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <span>「{task.category}」自動媒合系統</span>
                        </h4>
                        <span className="text-[9px] bg-red-500 text-white font-bold px-1 rounded animate-pulse">
                          推薦
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
                              {notifiedExperts.includes(exp.uid) ? '已發送邀請 ✔️' : '發出信號彈'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
