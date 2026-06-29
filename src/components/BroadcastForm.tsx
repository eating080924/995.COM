import React from 'react';
import { useForm } from 'react-hook-form';
import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { X, CreditCard, ShieldAlert, Timer, CheckCircle } from 'lucide-react';

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface BroadcastFormProps {
  onClose: () => void;
}

interface FormData {
  content: string;
}

export function BroadcastForm({ onClose }: BroadcastFormProps) {
  const { user } = useAuth();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [quotaUsed, setQuotaUsed] = React.useState(0);
  const [cooldownRemaining, setCooldownRemaining] = React.useState(0);

  // Close form immediately if user is not logged in (e.g., during sign out or page load delays)
  React.useEffect(() => {
    if (!user) {
      onClose();
    }
  }, [user, onClose]);

  const checkConstraints = React.useCallback(async () => {
    if (!user) return;
    try {
      setChecking(true);
      const q = query(collection(db, 'broadcasts'), where('creatorId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const userBroadcasts = querySnapshot.docs.map(doc => doc.data());
      
      const now = Date.now();
      const COOLDOWN_MS = 30 * 1000; // 30 sec cooldown
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      
      let latestTime = 0;
      let dayCount = 0;
      
      userBroadcasts.forEach(b => {
        const t = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        if (t > latestTime) {
          latestTime = t;
        }
        if (now - t < ONE_DAY_MS) {
          dayCount++;
        }
      });
      
      setQuotaUsed(dayCount);
      
      if (latestTime && now - latestTime < COOLDOWN_MS) {
        setCooldownRemaining(Math.ceil((COOLDOWN_MS - (now - latestTime)) / 1000));
      } else {
        setCooldownRemaining(0);
      }
    } catch (err) {
      console.error('Failed to check broadcast constraints:', err);
    } finally {
      setChecking(false);
    }
  }, [user]);

  React.useEffect(() => {
    checkConstraints();
  }, [checkConstraints]);

  // Handle countdown timer
  React.useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    try {
      setSubmitError(null);
      
      // Secondary check during submission to prevent bypass
      const q = query(collection(db, 'broadcasts'), where('creatorId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const userBroadcasts = querySnapshot.docs.map(doc => doc.data());
      
      const now = Date.now();
      const COOLDOWN_MS = 30 * 1000; // 30 sec cooldown
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      
      let latestTime = 0;
      let dayCount = 0;
      
      userBroadcasts.forEach(b => {
        const t = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        if (t > latestTime) {
          latestTime = t;
        }
        if (now - t < ONE_DAY_MS) {
          dayCount++;
        }
      });

      if (latestTime && now - latestTime < COOLDOWN_MS) {
        const rem = Math.ceil((COOLDOWN_MS - (now - latestTime)) / 1000);
        const remMin = Math.floor(rem / 60);
        const remSec = rem % 60;
        throw new ValidationError(`請勿頻繁發送廣播！冷卻中，請等待 ${remMin} 分 ${remSec} 秒後重試。`);
      }

      if (dayCount >= 10) {
        throw new ValidationError('您已達到每日發布上限 (24 小時內最多 10 則)。');
      }

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
      if (!(error instanceof ValidationError)) {
        try {
          handleFirestoreError(error, OperationType.CREATE, 'broadcasts');
        } catch (e) {
          console.error('Firestore operation failed:', e);
        }
      }
      const isOffline = error?.message?.includes('offline') || !window.navigator.onLine;
      setSubmitError(isOffline 
        ? '您目前似乎處於離線狀態，請檢查您的網路連線後再試。' 
        : (error.message || `發送廣播失敗：${error?.message || '未知錯誤'}`)
      );
    }
  };

  const isLimitReached = quotaUsed >= 10;
  const isCooldownActive = cooldownRemaining > 0;
  const isButtonDisabled = isSubmitting || checking || isLimitReached || isCooldownActive;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100">
        {/* Banner with retro style */}
        <div className="p-6 border-b flex justify-between items-center text-red-600 bg-gradient-to-r from-red-50 to-orange-50">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black tracking-wider">📢 尬  廣</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:rotate-90 transition-all duration-300 p-1 rounded-full hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Rules & Limits Info Dashboard */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3.5">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <CreditCard size={16} className="text-red-500" />
              <span>廣播發布規定與安全機制</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Daily Quota Counter */}
              <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${
                isLimitReached 
                  ? 'bg-red-50 border-red-100 text-red-700' 
                  : (checking ? 'bg-slate-100/50 border-slate-100 animate-pulse' : 'bg-green-50/50 border-green-100/80 text-green-800')
              }`}>
                <span className="text-[10px] text-slate-500 font-bold">24H 額度限制</span>
                {checking ? (
                  <span className="font-extrabold mt-1">檢查中...</span>
                ) : (
                  <span className="font-extrabold text-sm mt-0.5 flex items-center gap-1">
                    {quotaUsed} / 10 則
                    {isLimitReached && <ShieldAlert size={14} className="text-red-500 animate-bounce" />}
                  </span>
                )}
              </div>

              {/* Cooldown Status */}
              <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${
                isCooldownActive 
                  ? 'bg-amber-50 border-amber-100 text-amber-700 animate-pulse' 
                  : (checking ? 'bg-slate-100/50 border-slate-100 animate-pulse' : 'bg-blue-50/50 border-blue-100/80 text-blue-800')
              }`}>
                <span className="text-[10px] text-slate-500 font-bold">發送冷卻狀態</span>
                {checking ? (
                  <span className="font-extrabold mt-1">檢查中...</span>
                ) : isCooldownActive ? (
                  <span className="font-extrabold text-[11px] mt-0.5 flex items-center gap-1">
                    <Timer size={13} className="animate-spin text-amber-500" />
                    剩 {Math.floor(cooldownRemaining / 60)}分{cooldownRemaining % 60}秒
                  </span>
                ) : (
                  <span className="font-extrabold text-sm mt-0.5 flex items-center gap-1">
                    已就緒
                    <CheckCircle size={14} className="text-blue-500" />
                  </span>
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
              * 為防止洗板與惡意廣告，每次廣播間隔需冷卻 30 秒鐘，且每人每日限額 10 則。
            </p>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">廣播內容 (限 50 字)</label>
            <input
              {...register('content', { 
                required: '請輸入廣播內容',
                maxLength: { value: 50, message: '內容長度不能超過 50 個字' }
              })}
              disabled={isButtonDisabled}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400 placeholder:text-slate-300 text-sm font-semibold"
              placeholder={isButtonDisabled ? "目前無法發布..." : "例如：急尋幫忙遛狗！委託單號:xxxxxxxxxxxx"}
            />
            {errors.content && <p className="text-red-500 text-xs mt-1.5 font-bold flex items-center gap-1">⚠️ {errors.content.message}</p>}
          </div>

          {submitError && (
            <div className="bg-red-50 text-red-700 text-xs font-bold p-3.5 rounded-xl border border-red-100 flex items-start gap-2">
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-red-500" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isButtonDisabled}
            className="w-full bg-gradient-to-r from-red-600 to-orange-500 text-white py-3 rounded-xl font-bold hover:from-red-700 hover:to-orange-600 transition-all duration-300 disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 flex items-center justify-center gap-2 shadow-lg shadow-red-500/10 hover:shadow-red-500/25 cursor-pointer disabled:cursor-not-allowed text-sm"
          >
            {isSubmitting ? '廣播中...' : (
              isLimitReached ? '已達今日額度限制' : (
                isCooldownActive ? '冷卻中限制發送' : '確認發送廣播 (Demo Free)'
              )
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

