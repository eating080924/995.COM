import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Irreversibly purges all data related to a user in Firestore.
 * This includes:
 * 1. Searching and deleting all tasks posted by the user
 * 2. Deleting the user profile document at /users/{userId}
 */
export async function deleteAllUserAppData(userId: string): Promise<boolean> {
  if (!userId) return false;

  let success = true;

  // 1. Delete all tasks of the user
  try {
    const tasksRef = collection(db, 'tasks');
    const q = query(tasksRef, where('requesterId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const taskDeletePromises = querySnapshot.docs.map(async (taskDoc) => {
      try {
        await deleteDoc(taskDoc.ref);
      } catch (e) {
        console.error(`Failed to delete task ${taskDoc.id} during account purge:`, e);
        success = false;
      }
    });
    
    await Promise.all(taskDeletePromises);
  } catch (error) {
    console.error('Error locating tasks for user account purge:', error);
    success = false;
  }

  // 2. Delete user profile record in Firestore
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
  } catch (error) {
    console.error(`Error deleting user document details for ${userId}:`, error);
    success = false;
  }

  return success;
}
