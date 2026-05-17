import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Task } from '../types';
import { TaskCard } from './TaskCard';
import { useAuth } from '../lib/AuthContext';
import { motion } from 'motion/react';
import { Loader2, Inbox } from 'lucide-react';

interface TaskListProps {
  filter: 'all' | 'my-tasks';
  searchQuery: string;
}

export function TaskList({ filter, searchQuery }: TaskListProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;
    if (filter === 'all') {
      q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    } else {
      if (!user) {
        setLoading(false);
        setTasks([]);
        return;
      }
      q = query(
        collection(db, 'tasks'), 
        where('requesterId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(docs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filter, user]);

  const filteredTasks = tasks.filter(task => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      task.content.toLowerCase().includes(lowerQuery) ||
      task.location.toLowerCase().includes(lowerQuery) ||
      task.reward.toLowerCase().includes(lowerQuery) ||
      task.taskNum.includes(lowerQuery)
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin mb-2" />
        <p>載入任務中...</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed">
        <Inbox size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-medium">目前沒有任務需求</p>
        <p className="text-xs mt-1">成為第一個發布任務的人吧！</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredTasks.map(task => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
