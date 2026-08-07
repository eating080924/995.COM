import { doc, getDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile } from '../types';

/**
 * 檢查與修復使用者的信用狀態與處罰：
 * 1. 處罰期滿自動解禁 (bannedUntil 已到期) -> 將違規次數退回至 2 次（警告提醒區），解除停權
 * 2. 滾動式時間冷卻 (每滿 30 天無新違規自動減 1) -> 抵銷違規次數並更新起算時間
 */
export async function checkAndRepairUserCredit(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;

  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;

    const data = userSnap.data() as UserProfile;
    const now = new Date();
    let updateNeeded = false;
    let updates: any = {};

    let currentViolations = data.noContactViolationsCount ?? (data as any).noContactStrikes ?? 0;
    let currentPenaltyStatus = data.penaltyStatus || 'none';
    let currentBannedUntil = data.bannedUntil;
    let lastViolationDate: Date | null = null;

    if ((data as any).lastViolationAt) {
      const lva = (data as any).lastViolationAt;
      lastViolationDate = lva.toDate ? lva.toDate() : new Date(lva);
    }

    // 1. 處罰期滿恢復權限：停權期滿自動解除停權（違規次數保留，由雙軌機制修復）
    if (currentPenaltyStatus === 'suspended' && currentBannedUntil) {
      const bannedUntilDate = currentBannedUntil.toDate ? currentBannedUntil.toDate() : new Date(currentBannedUntil);
      if (now >= bannedUntilDate) {
        currentPenaltyStatus = 'none';
        updates.penaltyStatus = 'none';
        updates.bannedUntil = deleteField();
        updateNeeded = true;
      }
    }

    // 2. 滾動式時間冷卻機制：距離上次違規滿 30 天且期間無新違規，自動抵銷違規
    if (currentViolations > 0 && lastViolationDate && !isNaN(lastViolationDate.getTime())) {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const elapsedMs = now.getTime() - lastViolationDate.getTime();

      if (elapsedMs >= thirtyDaysMs) {
        const cyclesPassed = Math.floor(elapsedMs / thirtyDaysMs);
        if (cyclesPassed > 0) {
          const newViolations = Math.max(0, currentViolations - cyclesPassed);
          const newLastViolationMs = lastViolationDate.getTime() + (cyclesPassed * thirtyDaysMs);
          const newLastViolationDate = new Date(newLastViolationMs);

          currentViolations = newViolations;
          updates.noContactViolationsCount = newViolations;
          updates.noContactStrikes = newViolations;
          updates.lastViolationAt = newLastViolationDate;

          if (currentViolations <= 2 && currentPenaltyStatus === 'suspended') {
            currentPenaltyStatus = 'none';
            updates.penaltyStatus = 'none';
            updates.bannedUntil = deleteField();
          }

          updateNeeded = true;
        }
      }
    }

    if (updateNeeded) {
      updates.updatedAt = serverTimestamp();
      await updateDoc(userRef, updates);
      return {
        ...data,
        ...updates,
        noContactViolationsCount: currentViolations,
        penaltyStatus: currentPenaltyStatus,
      };
    }

    return data;
  } catch (err) {
    console.warn('Failed to check and repair credit status:', err);
    return null;
  }
}

/**
 * 優良完工抵銷機制（以表現換信用）：
 * 超人每成功且順利完工 3 次任務，系統自動將違規計次減 1
 */
export async function recordSuccessfulTaskCompletionForCredit(acceptorUid: string): Promise<void> {
  if (!acceptorUid) return;

  try {
    const userRef = doc(db, 'users', acceptorUid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const uData = userSnap.data();
    let currentViolations = uData.noContactViolationsCount ?? uData.noContactStrikes ?? 0;
    let completedCount = uData.successfulTasksSinceViolation ?? 0;

    // 若無違規紀錄，維持完工計數為 0
    if (currentViolations <= 0) {
      if (completedCount !== 0) {
        await updateDoc(userRef, { successfulTasksSinceViolation: 0, updatedAt: serverTimestamp() });
      }
      return;
    }

    // 完工計數加 1
    completedCount += 1;

    let updates: any = {
      successfulTasksSinceViolation: completedCount,
      updatedAt: serverTimestamp()
    };

    // 每累積 3 次順利完工，扣減 1 次違規
    if (completedCount >= 3) {
      const newViolations = Math.max(0, currentViolations - 1);
      updates.noContactViolationsCount = newViolations;
      updates.noContactStrikes = newViolations;
      updates.successfulTasksSinceViolation = 0; // 重置計數

      if (newViolations <= 2 && uData.penaltyStatus === 'suspended') {
        updates.penaltyStatus = 'none';
        updates.bannedUntil = deleteField();
      }
    }

    await updateDoc(userRef, updates);
  } catch (err) {
    console.warn('Failed to record successful task completion for credit:', err);
  }
}
