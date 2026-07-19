import { collection, doc, updateDoc, getDoc, setDoc, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { TITLE_ACHIEVEMENTS, UserStats } from '../config/achievements';

export async function updateUserStatsAndAchievements(uid: string) {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      // Create profile if not exists
      await setDoc(userRef, {
        displayName: '使用者',
        createdAt: serverTimestamp()
      });
    }
    
    // 1. Get Completed as Acceptor
    const acceptorTasksQ = query(
      collection(db, 'tasks'),
      where('acceptorId', '==', uid),
      where('status', '==', 'completed')
    );
    const acceptorTasksSnap = await getDocs(acceptorTasksQ);
    const completedAsAcceptor = acceptorTasksSnap.size;

    // 2. Get Completed as Requester
    const requesterTasksQ = query(
      collection(db, 'tasks'),
      where('requesterId', '==', uid),
      where('status', '==', 'completed')
    );
    const requesterTasksSnap = await getDocs(requesterTasksQ);
    const completedAsRequester = requesterTasksSnap.size;

    // 3. Get Broadcast count
    const broadcastQ = query(
      collection(db, 'broadcasts'),
      where('creatorId', '==', uid)
    );
    const broadcastSnap = await getDocs(broadcastQ);
    const broadcastCount = broadcastSnap.size;

    // 4. Get Ratings count & sum
    const ratingsQ = query(
      collection(db, 'ratings'),
      where('targetId', '==', uid)
    );
    const ratingsSnap = await getDocs(ratingsQ);
    let ratingSum = 0;
    const ratingCount = ratingsSnap.size;
    ratingsSnap.forEach((doc) => {
      ratingSum += doc.data().rating || 0;
    });
    const averageRating = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : 0;

    const stats: UserStats = {
      completedAsAcceptor,
      completedAsRequester,
      averageRating,
      ratingCount,
      broadcastCount
    };

    // Evaluate Achievements
    const earnedTitles: string[] = [];
    TITLE_ACHIEVEMENTS.forEach((ach) => {
      if (ach.checkFn(stats)) {
        earnedTitles.push(ach.title);
      }
    });

    // Update User Document
    await updateDoc(userRef, {
      completedAsAcceptorCount: completedAsAcceptor,
      completedAsRequesterCount: completedAsRequester,
      ratingCount,
      ratingSum,
      averageRating,
      broadcastCount,
      earnedTitles,
      updatedAt: serverTimestamp()
    });

    return { stats, earnedTitles };
  } catch (error) {
    console.error('Error updating user stats and achievements:', error);
    throw error;
  }
}

export async function submitRating(params: {
  taskId: string;
  taskNum: string;
  raterId: string;
  raterName: string;
  targetId: string;
  targetName: string;
  targetRole: 'requester' | 'acceptor';
  rating: number;
  comment?: string;
}) {
  try {
    // 1. Save rating doc
    const ratingRef = collection(db, 'ratings');
    await addDoc(ratingRef, {
      taskId: params.taskId,
      taskNum: params.taskNum,
      raterId: params.raterId,
      raterName: params.raterName,
      targetId: params.targetId,
      targetName: params.targetName,
      targetRole: params.targetRole,
      rating: params.rating,
      comment: params.comment || '',
      createdAt: serverTimestamp()
    });

    // 2. Update task document rating flags
    const taskRef = doc(db, 'tasks', params.taskId);
    if (params.targetRole === 'requester') {
      // The acceptor is rating the requester
      await updateDoc(taskRef, {
        acceptorRated: true,
        updatedAt: serverTimestamp()
      });
    } else {
      // The requester is rating the acceptor
      await updateDoc(taskRef, {
        requesterRated: true,
        updatedAt: serverTimestamp()
      });
    }

    // 3. Recalculate stats & achievements for target user
    await updateUserStatsAndAchievements(params.targetId);
    
    // 4. Also update the rater's stats just in case
    await updateUserStatsAndAchievements(params.raterId);

  } catch (error) {
    console.error('Error submitting rating:', error);
    throw error;
  }
}
