import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './errorHandler';

export interface AppNotification {
  id: string;
  userId: string; // recipient
  type: 'task_accepted' | 'task_unaccepted' | 'task_completed';
  taskId: string;
  taskNum: string;
  taskContent: string;
  senderId: string;
  senderName: string;
  read: boolean;
  createdAt: any;
}

/**
 * Send a notification to a specific user.
 */
export async function sendNotification(params: {
  userId: string; // recipient ID
  type: 'task_accepted' | 'task_unaccepted' | 'task_completed';
  taskId: string;
  taskNum: string;
  taskContent: string;
  senderId: string;
  senderName: string;
}) {
  if (!params.userId || params.userId === params.senderId) {
    // No need to send notification to oneself
    return;
  }

  try {
    const notificationsRef = collection(db, 'notifications');
    await addDoc(notificationsRef, {
      userId: params.userId,
      type: params.type,
      taskId: params.taskId,
      taskNum: params.taskNum,
      taskContent: params.taskContent,
      senderId: params.senderId,
      senderName: params.senderName,
      read: false,
      createdAt: serverTimestamp(),
    });

    // Also trigger background Web Push notification via backend API proxy
    try {
      fetch('/api/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      }).catch((err) => console.warn('Background Web Push call failed:', err));
    } catch (pushErr) {
      console.warn('Background Web Push error:', pushErr);
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

/**
 * Subscribe to real-time notifications for a user.
 */
export function subscribeNotifications(
  userId: string,
  onUpdate: (notifications: AppNotification[]) => void
) {
  const notificationsRef = collection(db, 'notifications');
  const q = query(
    notificationsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const notifications: AppNotification[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      notifications.push({
        id: docSnap.id,
        userId: data.userId,
        type: data.type,
        taskId: data.taskId,
        taskNum: data.taskNum,
        taskContent: data.taskContent,
        senderId: data.senderId,
        senderName: data.senderName,
        read: data.read || false,
        createdAt: data.createdAt,
      });
    });
    onUpdate(notifications);
  }, (error) => {
    console.error('Error in notifications subscription:', error);
  });
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId: string) {
  try {
    const docRef = doc(db, 'notifications', notificationId);
    await updateDoc(docRef, { read: true });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
  }
}

/**
 * Mark all user notifications as read.
 */
export async function markAllAsRead(userId: string) {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);
    querySnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    await batch.commit();
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

/**
 * Delete a single notification.
 */
export async function deleteNotification(notificationId: string) {
  try {
    const docRef = doc(db, 'notifications', notificationId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Failed to delete notification:', error);
    handleFirestoreError(error, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

/**
 * Clear all notifications for a user.
 */
export async function clearAllNotifications(userId: string) {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId)
    );
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);
    querySnapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    console.error('Failed to clear all notifications:', error);
    handleFirestoreError(error, OperationType.DELETE, 'notifications');
  }
}
