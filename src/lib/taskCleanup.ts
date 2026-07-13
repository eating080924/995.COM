import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './errorHandler';
import { sendNotification } from './notificationService';

/**
 * Performs cleanup of tasks for the current user based on the following rules:
 * 1. Auto-delete "Open" tasks after 3 days.
 * 2. Auto-complete "Accepted" tasks when they reach their expected end time.
 */
export async function performTaskCleanup(userId: string | undefined) {
  if (!userId) return;

  try {
    const now = new Date();
    const tasksRef = collection(db, 'tasks');

    // 1. Cleanup "Open" tasks older than 3 days
    // Use an extra hour on the client to avoid clock skew issues with Firestore rules
    const threeDaysAnHourAgo = new Date();
    threeDaysAnHourAgo.setDate(now.getDate() - 3);
    threeDaysAnHourAgo.setHours(threeDaysAnHourAgo.getHours() - 1);

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
          
          // Condition 1: Created older than 3 days
          let isOlderThan3Days = false;
          if (data.createdAt) {
            const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            isOlderThan3Days = createdAt < threeDaysAnHourAgo;
          }
          
          // Condition 2: deadlineEnd has passed
          let isDeadlinePassed = false;
          if (data.deadlineEnd) {
            const deadlineEnd = data.deadlineEnd.toDate ? data.deadlineEnd.toDate() : new Date(data.deadlineEnd);
            isDeadlinePassed = deadlineEnd < currentDate;
          }
          
          return isOlderThan3Days || isDeadlinePassed;
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

    // 2. Auto-complete "Accepted" tasks that reached deadlineEnd
    // Use an extra 5 minutes on the client to avoid clock skew
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const acceptedTasksQuery = query(
      tasksRef,
      where('status', '==', 'accepted'),
      where('requesterId', '==', userId)
    );

    let acceptedTasksSnapshot;
    try {
      acceptedTasksSnapshot = await getDocs(acceptedTasksQuery);
    } catch (e) {
      console.warn('Failed to query accepted tasks for cleanup:', e);
      return;
    }

    const completeResults = await Promise.all(
      acceptedTasksSnapshot.docs
        .filter(taskDoc => {
          const data = taskDoc.data();
          if (!data.deadlineEnd) return false;
          const deadlineDate = data.deadlineEnd.toDate ? data.deadlineEnd.toDate() : new Date(data.deadlineEnd);
          return deadlineDate < fiveMinutesAgo;
        })
        .map(async (taskDoc) => {
          const data = taskDoc.data();
          try {
            await updateDoc(taskDoc.ref, {
              status: 'completed',
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
            console.log(`Successfully auto-completed task ${taskDoc.id}`);
            return { success: true };
          } catch (e) {
            console.warn(`Failed to auto-complete task ${taskDoc.id} (Owner: ${data.requesterId}, Viewer: ${userId}):`, e);
            return { success: false };
          }
        })
    );

    const completedCount = completeResults.filter(r => r.success).length;
    if (completedCount > 0) {
      console.log(`Auto-completed ${completedCount} past-due tasks from the system.`);
    }
  } catch (error) {
    console.error('Error performing global task cleanup loop:', error);
  }
}
