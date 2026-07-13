import React from 'react';
import { useForm } from 'react-hook-form';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { Task } from '../types';
import { isUserUnlimited } from '../config/unlimitedUsers';

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

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: taskToEdit ? {
      content: taskToEdit.content,
      reward: taskToEdit.reward,
      deadlineStart: formatForInput(taskToEdit.deadlineStart),
      deadlineEnd: formatForInput(taskToEdit.deadlineEnd),
      location: taskToEdit.location,
      contact: taskToEdit.contact,
    } : {
      deadlineStart: new Date().toISOString().slice(0, 16),
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

        await addDoc(collection(db, 'tasks'), {
          ...data,
          deadlineStart: Timestamp.fromDate(new Date(data.deadlineStart)),
          deadlineEnd: Timestamp.fromDate(new Date(data.deadlineEnd)),
          taskNum: generateTaskNum(),
          status: 'open',
          requesterId: user.uid,
          requesterName: user.displayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-8 flex flex-col items-center justify-center space-y-4 shadow-2xl">
          <Loader2 className="animate-spin text-red-500" size={36} />
          <p className="text-sm font-bold text-slate-500">正在檢查您的發布狀態...</p>
        </div>
      </div>
    );
  }

  if (!taskToEdit && hasActiveTask) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100">
          <div className="p-6 border-b flex justify-between items-center bg-red-50 text-red-650">
            <h2 className="text-lg font-black flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500 shrink-0" />
              <span>發布數量限制</span>
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="p-6 text-center space-y-4">
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">{taskToEdit ? '編輯任務' : '發布新任務'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
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

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">任務開始時間</label>
              <input
                type="datetime-local"
                {...register('deadlineStart', { required: '請選擇開始時間' })}
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
