import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, deleteField, serverTimestamp, Timestamp, getDoc, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './errorHandler';
import { sendNotification } from './notificationService';

/**
 * Performs cleanup of tasks for the current user based on the following rules:
 * 1. Auto-expire "Open" tasks after deadlineEnd or exceeded max lifespan (14 days / 3 days legacy).
 * 2. Auto-reset "Accepted" tasks if 24 hours passed without acceptor reporting contact (+ penalty log).
 * 3. Auto-reset "Accepted" tasks if 1 hour passed without owner confirming contact.
 * 4. Auto-complete or auto-reset "Accepted" tasks when they reach their expected end time (deadlineEnd).
 */
export async function performTaskCleanup(userId: string | undefined) {
  if (!userId) return;

  try {
    const now = new Date();
    const tasksRef = collection(db, 'tasks');

    // 1. Cleanup "Open" tasks whose deadlineEnd has passed or exceeded max lifespan
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);

    const openTasksQuery = query(
      tasksRef,
      where('status', '==', 'open'),
      where('requesterId', '==', userId)
    );

    let openTasksSnapshot;
    try {
      openTasksSnapshot = await getDocs(openTasksQuery);
    } catch (e) {
      console.warn('Failed to query open tasks for cleanup:', e);
      return;
    }

    const deleteResults = await Promise.all(
      openTasksSnapshot.docs
        .filter(taskDoc => {
          const data = taskDoc.data();
          const currentDate = new Date();
          
          let isExpired = false;

          if (data.deadlineEnd) {
            const deadlineEnd = data.deadlineEnd.toDate ? data.deadlineEnd.toDate() : new Date(data.deadlineEnd);
            if (deadlineEnd < currentDate) {
              isExpired = true;
            }
          } else if (data.createdAt) {
            const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            if (createdAt < threeDaysAgo) {
              isExpired = true;
            }
          }

          if (data.createdAt) {
            const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            if (createdAt < fourteenDaysAgo) {
              isExpired = true;
            }
          }

          return isExpired;
        })
        .map(async (taskDoc) => {
          try {
            await updateDoc(taskDoc.ref, {
              status: 'timeout',
              updatedAt: serverTimestamp()
            });
            return { success: true };
          } catch (e) {
            console.warn(`Failed to auto-expire task ${taskDoc.id}:`, e);
            return { success: false };
          }
        })
    );
    
    const deletedCount = deleteResults.filter(r => r.success).length;
    if (deletedCount > 0) {
      console.log(`Auto-cleaned ${deletedCount} expired/overdue open tasks by setting status to 'timeout'.`);
    }

    // 2. Cleanup "Accepted" tasks for both requester and acceptor roles
    const acceptedAsRequesterQuery = query(
      tasksRef,
      where('status', '==', 'accepted'),
      where('requesterId', '==', userId)
    );

    const acceptedAsAcceptorQuery = query(
      tasksRef,
      where('status', '==', 'accepted'),
      where('acceptorId', '==', userId)
    );

    let acceptedDocsMap = new Map<string, any>();
    try {
      const [reqSnap, accSnap] = await Promise.all([
        getDocs(acceptedAsRequesterQuery),
        getDocs(acceptedAsAcceptorQuery)
      ]);
      reqSnap.docs.forEach(doc => acceptedDocsMap.set(doc.id, doc));
      accSnap.docs.forEach(doc => acceptedDocsMap.set(doc.id, doc));
    } catch (e) {
      console.warn('Failed to query accepted tasks for cleanup:', e);
      return;
    }

    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;

    const completeResults = await Promise.all(
      Array.from(acceptedDocsMap.values())
        .map(async (taskDoc) => {
          const data = taskDoc.data();
          const currentDate = new Date();

          // Rule A: Check 24-hour no contact timeout if acceptor hasn't reported contact
          if (!data.acceptorContacted) {
            const rawAcceptedAt = data.acceptedAt?.toDate 
              ? data.acceptedAt.toDate() 
              : (data.acceptedAt ? new Date(data.acceptedAt) : null);

            // 必須明確擁有 acceptedAt 承接時間紀錄才計算 24 小時未聯繫。若缺少 acceptedAt（例如剛承接未同步），絕對不能退回 createdAt/updatedAt 判定！
            if (rawAcceptedAt && !isNaN(rawAcceptedAt.getTime()) && currentDate.getTime() - rawAcceptedAt.getTime() >= twentyFourHoursMs) {
              try {
                const originalAcceptorId = data.acceptorId;
                await updateDoc(taskDoc.ref, {
                  status: 'open',
                  acceptorId: deleteField(),
                  acceptorName: deleteField(),
                  acceptedAt: deleteField(),
                  acceptorContacted: deleteField(),
                  acceptorContactedAt: deleteField(),
                  ownerConfirmedContact: deleteField(),
                  ownerConfirmedContactAt: deleteField(),
                  acceptorCompleted: deleteField(),
                  acceptorCompletedAt: deleteField(),
                  updatedAt: serverTimestamp()
                });

                if (originalAcceptorId) {
                  await sendNotification({
                    userId: originalAcceptorId,
                    type: 'task_unaccepted',
                    taskId: taskDoc.id,
                    taskNum: data.taskNum || '',
                    taskContent: `⚡ 系統防卡死自動重開：因您承接任務後逾 24 小時未回報「已主動聯繫」，系統已自動取消您的承接資格並重開任務。`,
                    senderId: 'system',
                    senderName: '系統管理員'
                  });

                  // Log penalty for 24h no contact
                  const accUserRef = doc(db, 'users', originalAcceptorId);
                  const accUserSnap = await getDoc(accUserRef);
                  if (accUserSnap.exists()) {
                    const accData = accUserSnap.data();
                    const currentViolations = accData.noContactViolationsCount || accData.noContactStrikes || 0;
                    const newViolations = currentViolations + 1;

                    let penaltyStatus: 'none' | 'suspended' | 'banned' = 'none';
                    let bannedUntil: Date | null = null;
                    let penaltyApplied = '';

                    if (newViolations === 1) {
                      penaltyStatus = 'none';
                      penaltyApplied = '平台警告（第 1 次無故未聯繫違規）';
                    } else if (newViolations === 2) {
                      penaltyStatus = 'none';
                      penaltyApplied = '平台警告與信用提醒（第 2 次無故未聯繫違規）';
                    } else if (newViolations === 3) {
                      penaltyStatus = 'suspended';
                      bannedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                      penaltyApplied = '限制承接任務 3 天（第 3 次無故未聯繫違規）';
                    } else if (newViolations === 4) {
                      penaltyStatus = 'suspended';
                      bannedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                      penaltyApplied = '限制承接任務 7 天（第 4 次無故未聯繫違規）';
                    } else {
                      penaltyStatus = 'banned';
                      penaltyApplied = '帳號永久封鎖（第 5 次無故未聯繫違規）';
                    }

                    await updateDoc(accUserRef, {
                      noContactViolationsCount: newViolations,
                      noContactStrikes: newViolations,
                      penaltyStatus,
                      bannedUntil: bannedUntil ? bannedUntil : deleteField(),
                      lastViolationAt: serverTimestamp(),
                      successfulTasksSinceViolation: 0,
                      updatedAt: serverTimestamp()
                    });

                    await addDoc(collection(db, 'violation_logs'), {
                      userId: originalAcceptorId,
                      userName: data.acceptorName || '在線超人',
                      taskId: taskDoc.id,
                      taskNum: data.taskNum || '',
                      reporterId: 'system',
                      reason: '24小時超時未聯繫 (系統自動觸發)',
                      penaltyApplied: penaltyApplied,
                      createdAt: serverTimestamp()
                    });
                  }
                }
                console.log(`Successfully auto-reset 24h uncontacted task ${taskDoc.id} to 'open'`);
                return { success: true };
              } catch (e) {
                console.warn(`Failed to auto-reset 24h uncontacted task ${taskDoc.id}:`, e);
                return { success: false };
              }
            }
          }

          // Rule B: Owner 1-hour contact confirmation timeout reset to 'open'
          if (data.acceptorContacted && !data.ownerConfirmedContact && data.acceptorContactedAt) {
            const contactedAt = data.acceptorContactedAt.toDate ? data.acceptorContactedAt.toDate() : new Date(data.acceptorContactedAt);
            if (currentDate.getTime() - contactedAt.getTime() > oneHourMs) {
              try {
                await updateDoc(taskDoc.ref, {
                  status: 'open',
                  acceptorId: deleteField(),
                  acceptorName: deleteField(),
                  acceptedAt: deleteField(),
                  acceptorContacted: deleteField(),
                  acceptorContactedAt: deleteField(),
                  ownerConfirmedContact: deleteField(),
                  ownerConfirmedContactAt: deleteField(),
                  acceptorCompleted: deleteField(),
                  acceptorCompletedAt: deleteField(),
                  updatedAt: serverTimestamp()
                });

                if (data.acceptorId) {
                  await sendNotification({
                    userId: data.acceptorId,
                    type: 'task_unaccepted',
                    taskId: taskDoc.id,
                    taskNum: data.taskNum || '',
                    taskContent: `⚡ 系統自動調整：因委託人逾 1 小時未按下「確認聯繫」，任務已自動重開為開放中，釋放您的承接資格。`,
                    senderId: 'system',
                    senderName: '系統管理員'
                  });
                }
                console.log(`Auto-reset task ${taskDoc.id} to 'open' because owner did not confirm contact within 1 hour.`);
                return { success: true };
              } catch (e) {
                console.warn(`Failed to auto-reset unconfirmed contact task ${taskDoc.id}:`, e);
                return { success: false };
              }
            }
          }

          // Rule C: Check deadlineEnd for accepted tasks
          if (data.deadlineEnd) {
            const deadlineDate = data.deadlineEnd.toDate ? data.deadlineEnd.toDate() : new Date(data.deadlineEnd);
            if (deadlineDate < fiveMinutesAgo) {
              if (data.acceptorCompleted) {
                // 1. 已回報完工：自動驗收結案
                try {
                  await updateDoc(taskDoc.ref, {
                    status: 'completed',
                    autoCompletedBySystem: true,
                    updatedAt: serverTimestamp()
                  });
                  if (data.acceptorId) {
                    await sendNotification({
                      userId: data.acceptorId,
                      type: 'task_completed',
                      taskId: taskDoc.id,
                      taskNum: data.taskNum || '',
                      taskContent: data.content || '',
                      senderId: userId,
                      senderName: '系統自動結案',
                    });
                  }
                  console.log(`Successfully auto-completed task ${taskDoc.id} at deadlineEnd`);
                  return { success: true };
                } catch (e) {
                  console.warn(`Failed to auto-complete task ${taskDoc.id}:`, e);
                  return { success: false };
                }
              } else {
                // 2. 未回報完工：逾預計結束時間自動重開委託
                try {
                  await updateDoc(taskDoc.ref, {
                    status: 'open',
                    acceptorId: deleteField(),
                    acceptorName: deleteField(),
                    acceptedAt: deleteField(),
                    acceptorContacted: deleteField(),
                    acceptorContactedAt: deleteField(),
                    ownerConfirmedContact: deleteField(),
                    ownerConfirmedContactAt: deleteField(),
                    acceptorCompleted: deleteField(),
                    acceptorCompletedAt: deleteField(),
                    updatedAt: serverTimestamp()
                  });

                  if (data.acceptorId) {
                    await sendNotification({
                      userId: data.acceptorId,
                      type: 'task_unaccepted',
                      taskId: taskDoc.id,
                      taskNum: data.taskNum || '',
                      taskContent: `⚡ 系統自動重開委託：您承接的委託 [${data.taskNum || ''}] 因已逾預計結束時間未回報完工，系統已自動重開委託，您的承接資格已釋放。`,
                      senderId: 'system',
                      senderName: '系統管理員'
                    });
                  }

                  await sendNotification({
                    userId: data.requesterId,
                    type: 'task_unaccepted',
                    taskId: taskDoc.id,
                    taskNum: data.taskNum || '',
                    taskContent: `⚡ 系統自動重開委託：您的委託 [${data.taskNum || ''}] 因承接者已逾預計結束時間未回報完工，系統已自動為您重開委託為【開放中】。`,
                    senderId: 'system',
                    senderName: '系統管理員'
                  });

                  console.log(`Successfully auto-reset unfinished task ${taskDoc.id} to 'open' at deadlineEnd`);
                  return { success: true };
                } catch (e) {
                  console.warn(`Failed to auto-reset unfinished task ${taskDoc.id}:`, e);
                  return { success: false };
                }
              }
            }
          }

          return { success: false };
        })
    );

    const completedCount = completeResults.filter(r => r.success).length;
    if (completedCount > 0) {
      console.log(`Auto-cleaned/reset ${completedCount} tasks during cleanup.`);
    }
  } catch (error) {
    console.error('Error performing global task cleanup loop:', error);
  }
}

