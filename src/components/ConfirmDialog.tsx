import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
  showCancel?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '確認',
  cancelText = '取消',
  onConfirm,
  onCancel,
  variant = 'primary',
  showCancel = true
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onCancel}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        >
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                variant === 'danger' ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"
              )}>
                <AlertCircle size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800 leading-tight">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
          </div>
          <div className="flex border-t border-slate-100">
            {showCancel && (
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors border-r border-slate-100"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={() => {
                onConfirm();
                onCancel();
              }}
              className={cn(
                "flex-1 px-4 py-3.5 text-sm font-bold transition-colors shadow-inner",
                variant === 'danger' ? "text-red-500 hover:bg-red-50" : "text-indigo-600 hover:bg-indigo-50"
              )}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
