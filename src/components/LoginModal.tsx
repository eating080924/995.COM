import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Facebook, Chrome, Info } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { signIn } = useAuth();
  const [loading, setLoading] = React.useState<'google' | 'facebook' | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (provider: 'google' | 'facebook') => {
    setLoading(provider);
    try {
      await signIn(provider);
      onClose();
    } catch (error) {
      console.error('Sign-in failed:', error);
    } finally {
      setLoading(null);
    }
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
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-50">
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight">選擇登入方式</h3>
              <p className="text-xs text-slate-400 mt-0.5">請選擇您喜好的社群帳戶以便進行操作</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-3.5">
            {/* Google Sign In */}
            <button
              onClick={() => handleSignIn('google')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border-2 border-slate-100 bg-white text-slate-700 font-bold hover:bg-slate-50 active:scale-98 transition-all disabled:opacity-50"
            >
              <Chrome size={20} className="text-red-500 fill-red-500" />
              <span>
                {loading === 'google' ? 'Google 登入中...' : '使用 Google 帳號登入'}
              </span>
            </button>

            {/* Facebook Sign In */}
            <button
              onClick={() => handleSignIn('facebook')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-[#1877F2] text-white font-bold hover:bg-[#166FE5] active:scale-98 transition-all disabled:opacity-50 shadow-md shadow-blue-100"
            >
              <Facebook size={20} className="fill-white stroke-none" />
              <span>
                {loading === 'facebook' ? 'Facebook 登入中...' : '使用 Facebook 帳號登入'}
              </span>
            </button>

            {/* Info Message */}
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex gap-2.5 items-start">
              <Info size={16} className="text-slate-400 mt-0.5 shrink-0" />
              <div className="text-[11px] text-slate-500 leading-relaxed font-medium">
                <span className="font-bold text-slate-700 block mb-0.5">請選擇</span>
                
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
