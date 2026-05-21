import React from 'react';
import { useForm } from 'react-hook-form';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { X, CreditCard } from 'lucide-react';

interface BroadcastFormProps {
  onClose: () => void;
}

interface FormData {
  content: string;
}

export function BroadcastForm({ onClose }: BroadcastFormProps) {
  const { user } = useAuth();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    try {
      setSubmitError(null);
      // Set active until 30 minutes from now for this demo
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 30);

      await addDoc(collection(db, 'broadcasts'), {
        content: data.content,
        creatorId: user.uid,
        userName: user.displayName || '匿名用戶',
        activeUntil: Timestamp.fromDate(expiry),
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error: any) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'broadcasts');
      } catch (e) {
        console.error('Firestore operation failed:', e);
      }
      const isOffline = error?.message?.includes('offline') || !window.navigator.onLine;
      setSubmitError(isOffline 
        ? '您目前似乎處於離線狀態，請檢查您的網路連線後再試。' 
        : `發送廣播失敗：${error?.message || '未知錯誤'}`
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6 border-b flex justify-between items-center text-red-600 bg-red-50">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black">尬廣 (Premium)</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
              <CreditCard size={18} />
              <span>功能說明</span>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              廣播訊息將同步顯示給所有使用者。測試期間免費開放！
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">廣播內容 (限 50 字)</label>
            <input
              {...register('content', { 
                required: '請輸入廣播內容',
                maxLength: { value: 50, message: '內容過長' }
              })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-shadow"
              placeholder="例如：急尋幫忙遛狗！委託單號:xxxxxxxxxxxx"
            />
            {errors.content && <p className="text-red-500 text-xs mt-1">{errors.content.message}</p>}
          </div>

          {submitError && (
            <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
          >
            {isSubmitting ? '廣播中...' : '發送廣播 (Demo Free)'}
          </button>
        </form>
      </div>
    </div>
  );
}
