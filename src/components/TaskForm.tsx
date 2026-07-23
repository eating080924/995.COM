import React from 'react';
import { useForm } from 'react-hook-form';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { X, Loader2, AlertTriangle, Layers, MapPin } from 'lucide-react';
import { Task } from '../types';
import { isUserUnlimited } from '../config/unlimitedUsers';
import { TASK_CATEGORIES, TAIWAN_REGIONS } from '../config/achievements';

interface TaskFormProps {
  onClose: () => void;
  taskToEdit?: Task;
}

interface FormData {
  content: string;
  reward: string;
  deadlineStart: string;
  deadlineEnd: string;
  location: string;
  category: string;
  region: string;
  contact: string;
}


export function TaskForm({ onClose, taskToEdit }: TaskFormProps) {
  const { user } = useAuth();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [checkingActiveTask, setCheckingActiveTask] = React.useState(false);
  const [hasActiveTask, setHasActiveTask] = React.useState<boolean | null>(null);

  // Close form immediately if user is not logged in (e.g., during sign out or page load delays)
  React.useEffect(() => {
    if (!user) {
      onClose();
    }
  }, [user, onClose]);

  // Check if user already has an active task limit reached (status in ['open', 'accepted'])
  React.useEffect(() => {
    if (!taskToEdit && user) {
      if (isUserUnlimited(user.uid, user.email)) {
        setHasActiveTask(false);
        setCheckingActiveTask(false);
        return;
      }
      setCheckingActiveTask(true);
      const q = query(
        collection(db, 'tasks'),
        where('requesterId', '==', user.uid),
        where('status', 'in', ['open', 'accepted'])
      );
      getDocs(q)
        .then((snapshot) => {
          setHasActiveTask(snapshot.size >= 3);
          setCheckingActiveTask(false);
        })
        .catch((error) => {
          console.error('Error checking active tasks:', error);
          setCheckingActiveTask(false);
        });
    }
  }, [user, taskToEdit]);

  const formatForInput = (dateValue: any) => {
    if (!dateValue) return '';
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    // Correctly format to YYYY-MM-DDTHH:mm for datetime-local input
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const nowLocalStr = React.useMemo(() => formatForInput(new Date()), []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: taskToEdit ? {
      content: taskToEdit.content,
      reward: taskToEdit.reward,
      deadlineStart: formatForInput(taskToEdit.deadlineStart),
      deadlineEnd: formatForInput(taskToEdit.deadlineEnd),
      location: taskToEdit.location,
      category: taskToEdit.category || '跑腿代購',
      region: taskToEdit.region || '台北市',
      contact: taskToEdit.contact,
    } : {
      deadlineStart: formatForInput(new Date()),
      category: '跑腿代購',
      region: '台北市',
    }
  });

  const generateTaskNum = () => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const serial = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${YYYY}${MM}${DD}${HH}${mm}${ss}${serial}`;
  };

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    try {
      setSubmitError(null);
      
      const startDate = new Date(data.deadlineStart);
      const endDate = new Date(data.deadlineEnd);
      if (endDate < startDate) {
        setSubmitError('預計結束時間不能早於任務開始時間。');
        return;
      }

      if (taskToEdit) {
        const taskRef = doc(db, 'tasks', taskToEdit.id);
        await updateDoc(taskRef, {
          ...data,
          deadlineStart: Timestamp.fromDate(new Date(data.deadlineStart)),
          deadlineEnd: Timestamp.fromDate(new Date(data.deadlineEnd)),
          updatedAt: serverTimestamp()
        });
      } else {
        // Enforce active task limit on submission
        const isUnlimited = isUserUnlimited(user.uid, user.email);
        if (!isUnlimited) {
          const q = query(
            collection(db, 'tasks'),
            where('requesterId', '==', user.uid),
            where('status', 'in', ['open', 'accepted'])
          );
          const activeTasksSnapshot = await getDocs(q);
          if (activeTasksSnapshot.size >= 3) {
            setSubmitError('您目前已有 3 筆進行中或開放中的委託任務，已達發布上限。');
            setHasActiveTask(true);
            return;
          }
        }

        const taskNum = generateTaskNum();
        await addDoc(collection(db, 'tasks'), {
          ...data,
          deadlineStart: Timestamp.fromDate(new Date(data.deadlineStart)),
          deadlineEnd: Timestamp.fromDate(new Date(data.deadlineEnd)),
          taskNum,
          status: 'open',
          requesterId: user.uid,
          requesterName: user.displayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Query users matching preferences client-side (fully authenticated)
        let matchedUserIds: string[] = [];
        try {
          const qCat = query(collection(db, 'users'), where('preferredCategories', 'array-contains', data.category));
          const qReg = query(collection(db, 'users'), where('preferredRegions', 'array-contains', data.region));
          const [snapCat, snapReg] = await Promise.all([getDocs(qCat), getDocs(qReg)]);
          
          const uids = new Set<string>();
          snapCat.forEach(doc => {
            if (doc.id !== user.uid) uids.add(doc.id);
          });
          snapReg.forEach(doc => {
            if (doc.id !== user.uid) uids.add(doc.id);
          });
          matchedUserIds = Array.from(uids);
        } catch (queryErr) {
          console.warn('Failed to query matching user preferences client-side:', queryErr);
        }

        // Fire and forget: send push notifications to users matching interest subscriptions/preferences in the background
        try {
          fetch('/api/send-matching-push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userIds: matchedUserIds,
              category: data.category,
              region: data.region,
              taskNum,
              taskContent: data.content,
              senderId: user.uid,
              senderName: user.displayName || '平台用戶',
            }),
          }).catch((err) => console.warn('Failed to send matching push notification:', err));
        } catch (pushErr) {
          console.warn('Matching push trigger failed:', pushErr);
        }
      }
      onClose();
    } catch (error: any) {
      try {
        handleFirestoreError(error, taskToEdit ? OperationType.UPDATE : OperationType.CREATE, 'tasks');
      } catch (e) {
        console.error('Firestore operation failed:', e);
      }
      const isOffline = error?.message?.includes('offline') || !window.navigator.onLine;
      setSubmitError(isOffline 
        ? '您目前似乎處於離線狀態，請檢查您的網路連線後再試。' 
        : `發布失敗：${error?.message || '未知錯誤'}`
      );
    }
  };

  if (checkingActiveTask) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-6 sm:p-8 flex flex-col items-center justify-center space-y-4 shadow-2xl">
          <Loader2 className="animate-spin text-red-500" size={36} />
          <p className="text-sm font-bold text-slate-500">正在檢查您的發布狀態...</p>
        </div>
      </div>
    );
  }

  if (!taskToEdit && hasActiveTask) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100">
          <div className="p-4 sm:p-6 border-b flex justify-between items-center bg-red-50 text-red-650 shrink-0">
            <h2 className="text-lg font-black flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500 shrink-0" />
              <span>發布數量限制</span>
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="p-4 sm:p-6 text-center space-y-4 overflow-y-auto">
            <p className="text-sm text-slate-600 leading-relaxed">
              為了維護任務市集品質，每個帳號最多同時<b>發布 3 筆活躍中的委託任務</b>。
            </p>
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-left text-xs text-amber-800 space-y-1.5 font-medium leading-relaxed">
              <p className="font-bold text-amber-900 block">💡 提示與說明：</p>
              <p>您目前已有 3 筆正在進行（進行中）或等待承接（開放中）的委託任務，已達上限。</p>
              <p className="font-bold text-slate-800 pt-1 border-t border-amber-100/50">請先前往「個人委託」專區，將現有任務進行「完成結案」或「取消任務」以釋出額度後，才能建立新委託。</p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg active:scale-95 text-sm"
            >
              我知道了
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-6 border-b flex justify-between items-center shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">{taskToEdit ? '編輯任務' : '發布新任務'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-slate-100 rounded-lg">
            <X size={22} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">任務內容</label>
            <textarea
              {...register('content', { required: '請輸入任務內容' })}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all min-h-[100px] text-sm"
              placeholder="例如：幫忙買晚餐、帶寵物散步..."
            />
            {errors.content && <p className="text-red-500 text-xs mt-1">{errors.content.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">委託報酬 (請包含單位，如：$500、珍奶一杯)</label>
            <input
              {...register('reward', { required: '請輸入報酬' })}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm"
              placeholder="例如：$100、午餐一份"
            />
            {errors.reward && <p className="text-red-500 text-xs mt-1">{errors.reward.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Layers size={13} className="text-slate-400" />
                <span>任務類別</span>
              </label>
              <select
                {...register('category', { required: '請選擇任務類別' })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm font-semibold text-slate-700"
              >
                {TASK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin size={13} className="text-slate-400" />
                <span>縣市地區</span>
              </label>
              <select
                {...register('region', { required: '請選擇縣市地區' })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm font-semibold text-slate-700"
              >
                {TAIWAN_REGIONS.map((reg) => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">任務開始時間</label>
              <input
                type="datetime-local"
                min={!taskToEdit ? nowLocalStr : undefined}
                {...register('deadlineStart', { 
                  required: '請選擇開始時間',
                  validate: (value) => {
                    if (!taskToEdit) {
                      const selected = new Date(value);
                      const current = new Date();
                      // Allow a 1-minute buffer for latency
                      if (selected < new Date(current.getTime() - 60000)) {
                        return '任務開始時間不得小於當下時間';
                      }
                    }
                    return true;
                  }
                })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm"
              />
              {errors.deadlineStart && <p className="text-red-500 text-xs mt-1">{errors.deadlineStart.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">預計結束時間</label>
              <input
                type="datetime-local"
                {...register('deadlineEnd', { required: '請選擇結束時間' })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm"
              />
              {errors.deadlineEnd && <p className="text-red-500 text-xs mt-1">{errors.deadlineEnd.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">任務地點</label>
            <input
              {...register('location', { required: '請輸入地點' })}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm"
              placeholder="例如：台北101"
            />
            {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">聯絡方式 (僅承接者可見)</label>
            <input
              {...register('contact', { required: '請輸入聯絡方式' })}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all text-sm"
              placeholder="例如：Line ID, 電話"
            />
            {errors.contact && <p className="text-red-500 text-xs mt-1">{errors.contact.message}</p>}
          </div>

          {submitError && (
            <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-slate-900 text-white py-3 mt-2 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? '處理中...' : (taskToEdit ? '儲存修改' : '確認發布任務')}
          </button>
        </form>
      </div>
    </div>
  );
}
