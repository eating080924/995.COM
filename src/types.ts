export type TaskStatus = 'open' | 'accepted' | 'completed' | 'delete' | 'timeout';

export interface Task {
  id: string;
  taskNum: string; // YYYYMMDDHHMMSS + Serial
  content: string;
  reward: string;
  deadlineStart: string;
  deadlineEnd: string;
  location: string;
  contact: string;
  status: TaskStatus;
  requesterId: string;
  requesterName?: string;
  acceptorId?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Broadcast {
  id: string;
  content: string;
  creatorId: string;
  activeUntil: any;
  createdAt: any;
  userName?: string;
  taskId?: string;
  taskNum?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  createdAt: any;
}
