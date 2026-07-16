import React from 'react';
import { BookOpen, Shield, HelpCircle, Sparkles, CheckCircle2 } from 'lucide-react';

export function AboutAndFaq() {
  return (
    <div id="about-and-faq-container" className="space-y-8 mt-10">
      {/* 關於本站 Banner */}
      <div id="about-banner" className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 text-white shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <span className="p-1.5 bg-white/20 rounded-lg text-white">
            <Sparkles size={20} />
          </span>
          <h2 className="text-lg font-black tracking-tight">995 委託板 ── 您的社區互助零工與跑腿求助平台</h2>
        </div>
        <p className="text-xs text-red-50 leading-relaxed font-medium">
          995 委託板（救救我）是一個專為社區鄰里互助與即時任務媒合而設計的免費平台。我們深信，每個人都有需要幫助的時刻，也同時具備成為他人「生活超人」的能力。無論是日常小事、臨時急用、專業技術，還是各種生活瑣事，都能在此快速串聯，共創溫暖友善的社區。
        </p>
      </div>

      {/* 平台特色與核心精神 */}
      <div id="about-features" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 text-slate-800">
            <BookOpen size={20} className="text-red-500" />
            <h3 className="font-bold text-sm">💡 平台核心精神與宗旨</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            我們旨在打破人與人之間的隔閡，透過極致簡單的資訊公告，讓閒置的人力、專業技能與社區需求產生實質且溫暖的連結。平台不收取任何抽成與交易手續費，讓每一分汗水與辛勞都能全額回饋給熱心的社區超人。
          </p>
          <ul className="space-y-2 text-xs text-slate-600 font-medium pt-1">
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
              <span>完全免費：發布與接單皆免手續費</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
              <span>即時媒合：利用緊急廣播提高全站曝光</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
              <span>安全隱私：官方社群一鍵註冊與帳戶抹除</span>
            </li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 text-slate-800">
            <Shield size={20} className="text-red-500" />
            <h3 className="font-bold text-sm">🛡️ 社區安全與誠信規範</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            為維護誠信安全的交易環境，本平台設有健全的檢舉與巡檢系統。發布者應遵守資訊撰寫規範，接單者應信守承諾按時履行。對於欺詐、違法、洗板與不實需求，我們採取零容忍態度。
          </p>
          <ul className="space-y-2 text-xs text-slate-600 font-medium pt-1">
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-red-500 shrink-0" />
              <span>安全防範：請勿於公開欄位填寫精確住址或敏感個資</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-red-500 shrink-0" />
              <span>行程知會：到府執行任務前請告知親友行程以保安全</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-red-500 shrink-0" />
              <span>金流安全：雙方自行議定付款細節，並建議保留通訊紀錄</span>
            </li>
          </ul>
        </div>
      </div>

      {/* 常見問題 FAQ */}
      <div id="about-faq-section" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-2.5 text-slate-800 border-b border-slate-100 pb-3">
          <HelpCircle size={20} className="text-red-500" />
          <h3 className="font-black text-sm">💬 常見問題解答 (FAQ)</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-extrabold text-slate-800">Q1：使用 995 委託板需要支付費用嗎？</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              除特殊方案外，基本功能使用上是不需要支付費用的。本站旨在發揮社區鄰里之善意與互助，不論是發布需求任務、承接委託或發送跑馬燈廣播，皆不收取任何平台月費或手續費。所有任務報酬皆為委託人與超人雙方 100% 自行議定並進行全額交付，平台絕不經手或抽取成數。
            </p>
          </div>

          <div className="space-y-1 border-t border-slate-50 pt-3">
            <h4 className="text-xs font-extrabold text-slate-800">Q2：平台如何確保我的隱私與帳號安全性？</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              本服務極為重視您的隱私，我們不儲存您的傳統登入密碼，而是串接極為安全的 Google 與 Facebook 官方 Single Sign-On（OAuth）通道。這能有效杜絕密碼外洩風險。同時，您的個人隱私、電郵與歷史紀錄絕對不轉售或提供給第三方廣告商。
            </p>
          </div>

          <div className="space-y-1 border-t border-slate-50 pt-3">
            <h4 className="text-xs font-extrabold text-slate-800">Q3：如何徹底刪除我的個人資料與所有歷史委託？</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              您對個人數據擁有完全自主決定權（被遺忘權）。登入帳號後，前往「個人委託」 ── 「帳戶與隱私」，點擊「永久刪除帳號與所有委託資料」並輸入「確認刪除」，雲端資料庫將會不可逆地即時抹除您的基本公開檔案、任務內容與廣播紀錄。您亦可參閱 <a href="/deletion.html" target="_blank" className="text-red-500 hover:underline">資料刪除說明頁</a> 或寫信至 <a href="mailto:service@995myhero.com" className="text-red-500 hover:underline font-bold">service@995myhero.com</a> 進行申請。
            </p>
          </div>

          <div className="space-y-1 border-t border-slate-50 pt-3">
            <h4 className="text-xs font-extrabold text-slate-800">Q4：我可以在哪裡看見最新的隱私權聲明與服務條款？</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              您可以隨時造訪網頁底部，或直接點選 <a href="/privacy.html" target="_blank" className="text-red-500 hover:underline">隱私權政策聲明</a>、<a href="/terms.html" target="_blank" className="text-red-500 hover:underline">服務條款規範</a> 頁面，了解有關 Google AdSense 廣告 Cookie 投放規範、第三方個資申明以及使用者權益。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
