export type TaskStatus = 'open' | 'accepted' | 'completed' | 'delete' | 'timeout';

export interface Task {
  id: string;
  taskNum: string; // YYYYMMDDHHMMSS + Serial
  content: string;
  reward: string;
  deadlineStart: string;
  deadlineEnd: string;
  location: string;
  category: string; // Task category (e.g., '跑腿代購')
  region: string; // Task region/city (e.g., '台北市')
  contact: string;
  status: TaskStatus;
  requesterId: string;
  requesterName?: string;
  acceptorId?: string;
  acceptorName?: string;
  acceptedAt?: any; // Timestamp when task was accepted
  requesterRated?: boolean; // Whether requester rated acceptor
  acceptorRated?: boolean; // Whether acceptor rated requester
  acceptorContacted?: boolean; // Whether acceptor confirmed they contacted the requester
  acceptorContactedAt?: any;
  acceptorCompleted?: boolean; // Whether acceptor reported the task as completed
  acceptorCompletedAt?: any;
  hasDispute?: boolean; // Whether there is a cancellation or deletion dispute
  disputeReason?: string;
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
  category?: string;
  region?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  preferredCategories?: string[];
  preferredRegions?: string[];
  activeTitle?: string;
  earnedTitles?: string[];
  completedAsAcceptorCount?: number;
  completedAsRequesterCount?: number;
  ratingCount?: number;
  ratingSum?: number;
  averageRating?: number;
  broadcastCount?: number;
  noContactViolationsCount?: number; // 無故未聯繫違規次數
  penaltyStatus?: 'none' | 'suspended' | 'banned'; // 懲罰狀態：無、停權、封鎖
  bannedUntil?: any; // 停權截止時間
  createdAt: any;
  updatedAt?: any;
}

export interface ViolationLog {
  id: string;
  userId: string; // 違規的超人 ID
  userName: string; // 違規的超人姓名
  taskId: string; // 相關任務 ID
  taskNum: string; // 相關任務編號
  reporterId: string; // 舉報人 ID (委託人)
  reason: string; // 違規原因 (e.g., '無故未聯繫')
  penaltyApplied: string; // 應用的懲罰 (e.g., '警告', '停權 7 天')
  createdAt: any;
}

export interface Rating {
  id: string;
  taskId: string;
  taskNum: string;
  raterId: string;
  raterName: string;
  targetId: string;
  targetName: string;
  targetRole: 'requester' | 'acceptor';
  rating: number; // 1-5
  comment?: string;
  createdAt: any;
}

