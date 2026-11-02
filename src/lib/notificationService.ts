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
import { db, auth } from './firebase';
import { handleFirestoreError, OperationType } from './errorHandler';

export interface AppNotification {
  id: string;
  userId: string; // recipient
  type: 'task_accepted' | 'task_unaccepted' | 'task_completed' | 'agent_invite' | 'rpa_push' | 'broadcast';
  taskId: string;
  taskNum: string;
  taskContent: string;
  senderId: string;
  senderName: string;
  read: boolean;
  createdAt: any;
  customTitle?: string;
  category?: string;
  region?: string;
}

/**
 * Send a notification to a specific user.
 */
export async function sendNotification(params: {
  userId: string; // recipient ID
  type: 'task_accepted' | 'task_unaccepted' | 'task_completed' | 'agent_invite' | 'rpa_push' | 'broadcast';
  taskId: string;
  taskNum: string;
  taskContent: string;
  senderId: string;
  senderName: string;
  customTitle?: string;
  category?: string;
  region?: string;
}) {
  if (!params.userId || params.userId === params.senderId) {
    // No need to send notification to oneself
    return;
  }

  try {
    const notificationsRef = collection(db, 'notifications');
    const docData: any = {
      userId: params.userId,
      type: params.type,
      taskId: params.taskId,
      taskNum: params.taskNum,
      taskContent: params.taskContent,
      senderId: params.senderId,
      senderName: params.senderName,
      read: false,
      createdAt: serverTimestamp(),
    };
    if (params.customTitle) docData.customTitle = params.customTitle;
    if (params.category) docData.category = params.category;
    if (params.region) docData.region = params.region;

    await addDoc(notificationsRef, docData);

    // Also trigger background Web Push notification via backend API proxy
    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => null) : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      fetch('/api/send-push', {
        method: 'POST',
        headers,
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
        customTitle: data.customTitle,
        category: data.category,
        region: data.region,
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
    try {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  }
}

/**
 * Mark all notifications for a user as read.
 */
export async function markAllAsRead(userId: string) {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    await batch.commit();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, 'notifications');
    } catch (e) {
      console.error('Failed to mark all notifications as read:', e);
    }
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
    try {
      handleFirestoreError(error, OperationType.DELETE, `notifications/${notificationId}`);
    } catch (e) {
      console.error('Failed to delete notification:', e);
    }
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
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, 'notifications');
    } catch (e) {
      console.error('Failed to clear all notifications:', e);
    }
  }
}
