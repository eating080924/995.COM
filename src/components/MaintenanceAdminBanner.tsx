import React from 'react';
import { MaintenanceConfig } from '../types';
import { Wrench, ShieldAlert, Settings, PowerOff, CheckCircle } from 'lucide-react';

interface MaintenanceAdminBannerProps {
  config: MaintenanceConfig;
  userEmail?: string | null;
  onOpenAdminModal: () => void;
  onDisableMaintenance: () => Promise<void>;
}

export function MaintenanceAdminBanner({
  config,
  userEmail,
  onOpenAdminModal,
  onDisableMaintenance,
}: MaintenanceAdminBannerProps) {
  const [isDisabling, setIsDisabling] = React.useState(false);

  const handleQuickDisable = async () => {
    if (window.confirm('確定要立即解除維護模式並重啟對外服務嗎？一般使用者將可立即進入平台。')) {
      setIsDisabling(true);
      try {
        await onDisableMaintenance();
      } finally {
        setIsDisabling(false);
      }
    }
  };

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold shadow-md border-b border-amber-600/30 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping shrink-0" />
        <Wrench size={16} className="text-slate-950 shrink-0" />
        <div className="leading-snug">
          <span className="font-extrabold mr-1.5">【系統停機維護中】</span>
          <span className="font-medium text-slate-900 hidden sm:inline">
            一般用戶目前正看見維護頁面。您正以內部測試者身分（
            <span className="font-mono font-bold text-slate-950 underline">{userEmail || '內部人員'}</span>
            ）進行測試存取。
          </span>
          <span className="font-medium text-slate-900 sm:hidden">
            內部測試通道模式中 ({userEmail})
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onOpenAdminModal}
          className="px-2.5 py-1 bg-slate-950/10 hover:bg-slate-950/20 text-slate-950 border border-slate-950/20 rounded-lg transition-all flex items-center gap-1 active:scale-95 cursor-pointer text-[11px]"
        >
          <Settings size={12} />
          <span>控制台設定</span>
        </button>

        <button
          onClick={handleQuickDisable}
          disabled={isDisabling}
          className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm transition-all flex items-center gap-1 active:scale-95 cursor-pointer text-[11px] disabled:opacity-50"
        >
          <PowerOff size={12} className="text-amber-400" />
          <span>{isDisabling ? '處理中...' : '一鍵結束維護 (對外開放)'}</span>
        </button>
      </div>
    </div>
  );
}
