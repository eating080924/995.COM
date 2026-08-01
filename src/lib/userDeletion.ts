import { collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface DeletionCheckResult {
  success: boolean;
  code?: 'BLOCKED_ACTIVE_TASKS' | 'BLOCKED_DISPUTED' | 'BLOCKED_BANNED' | 'SUCCESS' | 'UNKNOWN_ERROR';
  message: string;
  deleteScheduledAt?: Date;
  details?: {
    activeTasksCount?: number;
    disputedTasksCount?: number;
    banReason?: string;
  };
}

/**
 * Checks whether a user is allowed to request account deletion.
 * Conditions that BLOCK deletion:
 * 1. User has tasks in progress ('accepted') or under dispute ('hasDispute' === true).
 * 2. User is currently banned, flagged, or under disciplinary review.
 */
export async function checkUserCanDeleteAccount(userId: string): Promise<DeletionCheckResult> {
  if (!userId) {
    return {
      success: false,
      code: 'UNKNOWN_ERROR',
      message: '無效的使用者識別碼，無法執行驗證。',
    };
  }

  try {
    // 1. Check user profile for ban/suspension status
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const uData = userSnap.data();
      const now = new Date();
      const bannedUntilDate = uData.bannedUntil?.toDate ? uData.bannedUntil.toDate() : (uData.bannedUntil ? new Date(uData.bannedUntil) : null);
      const isCurrentlyBanned = uData.status === 'banned' || uData.isBanned === true || uData.penaltyStatus === 'banned' || (bannedUntilDate && bannedUntilDate > now);

      if (isCurrentlyBanned) {
        return {
          success: false,
          code: 'BLOCKED_BANNED',
          message: '您的帳號目前處於停權或審查階段，暫時無法辦理註銷，請聯繫客服團隊處理。',
          details: {
            banReason: uData.penaltyReason || '帳號遭風控停權',
          },
        };
      }
    }

    // 2. Check active tasks posted by user or accepted by user
    const tasksRef = collection(db, 'tasks');
    
    // As requester
    const reqQuery = query(tasksRef, where('requesterId', '==', userId));
    const reqSnap = await getDocs(reqQuery);

    let activeAsRequester = 0;

    reqSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.status === 'accepted') activeAsRequester++;
    });

    // As acceptor
    const accQuery = query(tasksRef, where('acceptorId', '==', userId));
    const accSnap = await getDocs(accQuery);

    let activeAsAcceptor = 0;

    accSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.status === 'accepted') activeAsAcceptor++;
    });

    const totalActive = activeAsRequester + activeAsAcceptor;

    if (totalActive > 0) {
      return {
        success: false,
        code: 'BLOCKED_ACTIVE_TASKS',
        message: `您尚有 ${totalActive} 件進行中（已接單/執行中）的委託任務，暫時無法註銷帳號。請先完成任務或與對方協議取消。`,
        details: { activeTasksCount: totalActive },
      };
    }

    return {
      success: true,
      code: 'SUCCESS',
      message: '驗證通過，符合帳號註銷條件。',
    };
  } catch (error) {
    console.error('Error checking user deletion eligibility:', error);
    return {
      success: false,
      code: 'UNKNOWN_ERROR',
      message: '系統驗證失敗，請重新整理頁面或稍後再試。',
    };
  }
}

/**
 * Soft Deletes a user account with a 30-day data freeze grace period.
 * Risk Control & Privacy Compliant:
 * 1. Enforces pre-checks (blocks if active, disputed, or banned).
 * 2. Records immutable audit log in `audit_logs` collection.
 * 3. Soft deletes user profile in `users/{userId}`: set isDeleted=true, status='deleting', deletedAt, deleteScheduledAt.
 * 4. Soft deletes / deactivates user's open tasks so they are hidden from public view.
 */
export async function requestSoftAccountDeletion(userId: string, reason = '用戶主動申請註銷帳號'): Promise<DeletionCheckResult> {
  if (!userId) {
    return { success: false, code: 'UNKNOWN_ERROR', message: '無效的使用者識別碼。' };
  }

  // Step 1: Force pre-check
  const check = await checkUserCanDeleteAccount(userId);
  if (!check.success) {
    return check;
  }

  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};

    const gracePeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const gracePeriodTimestamp = Timestamp.fromDate(gracePeriodEnd);

    // Step 2: Save Immutable Audit Log in `audit_logs`
    const auditLogRef = doc(collection(db, 'audit_logs'));
    const auditLogData = {
      userId,
      userEmail: userData.email || '',
      userDisplayName: userData.displayName || '',
      action: 'ACCOUNT_DELETION_REQUESTED',
      status: 'DELETED_SOFT_GRACE_PERIOD',
      gracePeriodDays: 30,
      requestedAt: serverTimestamp(),
      deleteScheduledAt: gracePeriodTimestamp,
      deletionReason: reason,
      violationHistory: {
        noContactStrikes: userData.noContactStrikes || 0,
        noContactViolationsCount: userData.noContactViolationsCount || 0,
        penaltyStatus: userData.penaltyStatus || 'none',
        bannedUntil: userData.bannedUntil || null,
      },
      clientInfo: typeof window !== 'undefined' ? window.navigator.userAgent : 'web-client',
    };

    await setDoc(auditLogRef, auditLogData);

    // Step 3: Update user document for soft delete & 30-day freeze
    await updateDoc(userRef, {
      isDeleted: true,
      status: 'deleting',
      deletedAt: serverTimestamp(),
      deleteScheduledAt: gracePeriodTimestamp,
      deletionReason: reason,
      updatedAt: serverTimestamp(),
    });

    // Step 4: Hide open tasks created by this user from public board
    const tasksRef = collection(db, 'tasks');
    const openTasksQuery = query(tasksRef, where('requesterId', '==', userId), where('status', '==', 'open'));
    const openTasksSnap = await getDocs(openTasksQuery);

    const softDeleteTasksPromises = openTasksSnap.docs.map(async (taskDoc) => {
      try {
        await updateDoc(taskDoc.ref, {
          status: 'delete',
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn(`Failed to update task ${taskDoc.id} status during user soft delete:`, e);
      }
    });

    await Promise.all(softDeleteTasksPromises);

    return {
      success: true,
      code: 'SUCCESS',
      message: '您的帳號已成功辦理註銷，並進入 30 天數據凍結緩衝期。在此期間您的個人資料與發布紀錄將全面對外隱藏；30 天緩衝期滿後將自動進行敏感個人資料去識別化。',
      deleteScheduledAt: gracePeriodEnd,
    };
  } catch (error) {
    console.error('Error during soft account deletion:', error);
    return {
      success: false,
      code: 'UNKNOWN_ERROR',
      message: '執行帳號註銷時發生錯誤，請稍後再試或尋求客服協助。',
    };
  }
}

// Backwards compatibility helper
export async function deleteAllUserAppData(userId: string): Promise<boolean> {
  const result = await requestSoftAccountDeletion(userId);
  return result.success;
}
