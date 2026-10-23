import React, { useState, useEffect } from 'react';
import { MaintenanceConfig } from '../types';
import { Wrench, Shield, X, Save, AlertTriangle, Check, Plus, Trash2, Clock, Globe } from 'lucide-react';
import { DEFAULT_ADMIN_EMAILS } from '../config/admin';

interface MaintenanceAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MaintenanceConfig;
  onSave: (newConfig: Partial<MaintenanceConfig>) => Promise<void>;
}

export function MaintenanceAdminModal({ isOpen, onClose, config, onSave }: MaintenanceAdminModalProps) {
  const [isMaintenance, setIsMaintenance] = useState(config.isMaintenance);
  const [title, setTitle] = useState(config.title || '');
  const [message, setMessage] = useState(config.message || '');
  const [estimatedEndTime, setEstimatedEndTime] = useState(config.estimatedEndTime || '');
  const [allowedEmails, setAllowedEmails] = useState<string[]>(config.allowedEmails || DEFAULT_ADMIN_EMAILS);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setIsMaintenance(config.isMaintenance);
      setTitle(config.title || '系統例行升級維護中');
      setMessage(config.message || '為了提供更穩定且流暢的鄰里互助體驗，995 委託板正在進行例行伺服器與資料庫升級，期間暫停公開發布與接單服務，造成不便敬請見諒。');
      setEstimatedEndTime(config.estimatedEndTime || '');
      setAllowedEmails(config.allowedEmails && config.allowedEmails.length > 0 ? config.allowedEmails : DEFAULT_ADMIN_EMAILS);
      setSaveSuccess(false);
      setErrorMsg('');
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleAddEmail = () => {
    const trimmed = newEmailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes('@')) {
      setErrorMsg('請輸入有效的 Email 地址');
      return;
    }
    if (allowedEmails.includes(trimmed)) {
      setErrorMsg('此 Email 已在白名單中');
      return;
    }
    setAllowedEmails([...allowedEmails, trimmed]);
    setNewEmailInput('');
    setErrorMsg('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setAllowedEmails(allowedEmails.filter(e => e.toLowerCase() !== emailToRemove.toLowerCase()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    try {
      await onSave({
        isMaintenance,
        title: title.trim() || '系統例行升級維護中',
        message: message.trim() || '系統維護中，造成不便敬請見諒。',
        estimatedEndTime: estimatedEndTime.trim(),
        allowedEmails,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Failed to update maintenance settings:', err);
      setErrorMsg(err.message || '儲存設定失敗，請檢查權限');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Wrench size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight">雲端停機維護控制台</h3>
              <p className="text-[10px] text-slate-400">即時生效・全站用戶同步・白名單穿透</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-left text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-2">
              <Check size={16} className="shrink-0" />
              <span>設定已成功儲存並同步至雲端！</span>
            </div>
          )}

          {/* Master Switch */}
          <div className={`p-4 rounded-xl border transition-all ${isMaintenance ? 'bg-amber-50/80 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 text-sm block">停機維護模式開關</span>
                <span className="text-[11px] text-slate-500">
                  {isMaintenance 
                    ? '⚠️ 目前狀態：全站停機維護中（一般使用者無法進入，僅白名單人員可存取）' 
                    : '✅ 目前狀態：全站正常營運中（所有使用者可正常使用）'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMaintenance}
                  onChange={(e) => setIsMaintenance(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">維護公告標題</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：系統例行升級維護中"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
              required
            />
          </div>

          {/* Message */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">維護公告詳細說明</label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="說明維護原因或預期恢復事項..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs resize-none"
              required
            />
          </div>

          {/* Estimated End Time */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Clock size={13} className="text-slate-500" />
              <span>預計維護結束時間 (選填)</span>
            </label>
            <input
              type="text"
              value={estimatedEndTime}
              onChange={(e) => setEstimatedEndTime(e.target.value)}
              placeholder="例如：2026-10-23 04:00 或 今日 18:30"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
            />
            <p className="text-[10px] text-slate-400 mt-1">留空則不顯示預估時間卡片。</p>
          </div>

          {/* Allowed Emails Whitelist */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Shield size={13} className="text-slate-500" />
              <span>內部測試白名單 (可穿透維護頁面正常存取)</span>
            </label>

            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                placeholder="輸入測試人員 Email，例如 tester@gmail.com"
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddEmail}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1 shrink-0 text-xs active:scale-95"
              >
                <Plus size={14} />
                <span>新增</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {allowedEmails.map((email) => {
                const isDefault = DEFAULT_ADMIN_EMAILS.includes(email.toLowerCase().trim());
                return (
                  <div key={email} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono text-slate-700 truncate">{email}</span>
                      {isDefault && (
                        <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold shrink-0">
                          管理員
                        </span>
                      )}
                    </div>
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(email)}
                        className="text-slate-400 hover:text-red-500 p-0.5 transition-colors"
                        title="移除白名單"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-bold transition-all text-xs"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 text-xs active:scale-95 disabled:opacity-50"
            >
              <Save size={14} />
              <span>{isSaving ? '儲存中...' : '儲存並同步至雲端'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
