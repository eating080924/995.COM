import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Facebook, Info } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { isInAppBrowser } from '../lib/detector';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
);

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { signIn } = useAuth();
  const [loading, setLoading] = React.useState<'google' | 'facebook' | null>(null);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = (provider: 'google' | 'facebook') => {
    setErrMsg(null);
    // Unconditionally trigger the sign-in promise completely synchronously first.
    const loginPromise = signIn(provider);

    // Set the loading indicator for UI feedback *after* triggering the popup.
    setLoading(provider);

    loginPromise
      .then(() => {
        onClose();
      })
      .catch((error) => {
        console.error('Sign-in failed:', error);
        setErrMsg('社群登入失敗，請確認是否正常開放彈出視窗並重試。');
      })
      .finally(() => {
        setLoading(null);
      });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-50">
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">登入或註冊會員</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">選擇喜好的方式登入以發布或承接任務</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {isInAppBrowser() && (
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-[10px] space-y-1.5 leading-relaxed shadow-inner">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <span className="text-sm">⚠️</span> 偵測到 App 內建瀏覽器
                </div>
                <p>
                  您目前的環境限制了第三方社群登入授權（如 Google 或 臉書 登入會出現錯誤、重置或卡死）。
                </p>
                <div className="font-semibold text-amber-900 pt-1.5 border-t border-amber-100">
                  💡 建議：點擊本畫面右上角「...」或「分享」選擇「以 Safari 開啟」或「在 Chrome 中開啟」後再登入！
                </div>
              </div>
            )}

            {/* Quick Social Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Google Sign In */}
              <button
                type="button"
                onClick={() => handleSignIn('google')}
                disabled={loading !== null}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 active:scale-98 transition-all disabled:opacity-50 text-[11px]"
              >
                <GoogleIcon />
                <span>
                  {loading === 'google' ? 'Google中...' : 'Google 登入'}
                </span>
              </button>

              {/* Facebook Sign In */}
              <button
                type="button"
                onClick={() => handleSignIn('facebook')}
                disabled={loading !== null}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-[#1877F2] text-white font-bold hover:bg-[#166FE5] active:scale-98 transition-all disabled:opacity-50 shadow-md shadow-blue-100 text-[11px]"
              >
                <Facebook size={16} className="fill-white stroke-none" />
                <span>
                  {loading === 'facebook' ? '登入中...' : 'Facebook 登入 (異常修復中)'}
                </span>
              </button>
            </div>

            {/* Error messages */}
            {errMsg && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-100 text-[10px] font-bold leading-relaxed">
                ⚠️ {errMsg}
              </div>
            )}

            {/* Info Message */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex gap-2 items-start">
              <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
              <div className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                <span className="font-bold text-slate-700 block mb-0.5">登入授權須知：</span>
                登入即代表您同意本平台的{' '}
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-red-500 hover:underline font-bold">隱私權政策</a>
                {' '}與{' '}
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-red-500 hover:underline font-bold">服務條款</a>
                。我們僅會安全地辨識並記錄您的名稱與電子郵件以供發放與管理委託，不會存取 any 隱私敏感內容。
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-center">
            <button
              onClick={onClose}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              返回
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
