import React, { useState } from 'react';
import { Task } from '../types';
import { cn, formatTimeAgo } from '../lib/utils';
import { MapPin, Clock, Trash2, Edit2, Phone, CheckCircle, UserCircle, XCircle, Hash } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { doc, updateDoc, deleteDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { TaskForm } from './TaskForm';

export const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);

  const handleAccept = async () => {
    if (!user) return;
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: 'accepted',
        acceptorId: user.uid,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const handleCancelAccept = async () => {
    if (!user || user.uid !== task.acceptorId) return;
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: 'open',
        acceptorId: deleteField(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const handleComplete = async () => {
    if (!user || user.uid !== task.acceptorId) return;
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: 'completed',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const handleDelete = async () => {
    if (!user || user.uid !== task.requesterId) return;
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await deleteDoc(taskRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${task.id}`);
    }
  };

  const handleCancelByOwner = async () => {
    if (!user || user.uid !== task.requesterId) return;
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await deleteDoc(taskRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${task.id}`);
    }
  };

  const isOwner = user?.uid === task.requesterId;
  const isAcceptor = user?.uid === task.acceptorId;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-red-200 hover:shadow-md transition-all shadow-sm flex flex-col group h-full relative"
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-col gap-1">
            <span className={cn(
              "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight w-fit",
              task.status === 'open' && "bg-green-50 text-green-600",
              task.status === 'accepted' && "bg-blue-50 text-blue-600",
              task.status === 'completed' && "bg-slate-100 text-slate-500"
            )}>
              {task.status === 'open' && '開放中'}
              {task.status === 'accepted' && '進行中'}
              {task.status === 'completed' && '已結案'}
            </span>
            <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
              <Hash size={10} />
              {task.taskNum}
            </div>
          </div>
          <span className="text-xl font-black text-slate-800 tabular-nums">
            {task.reward}
          </span>
        </div>

        <h3 className="font-bold text-slate-800 mb-2 line-clamp-2 group-hover:text-red-500 transition-colors">
          {task.content}
        </h3>
        
        <p className="text-xs text-slate-500 mb-4 flex-grow italic">
          由 {task.requesterName || '匿名用戶'} 於 {formatTimeAgo(task.createdAt?.toDate ? task.createdAt.toDate() : new Date())} 發布
        </p>

        <div className="mt-auto space-y-2 border-t pt-4 border-slate-50">
          <div className="flex items-center text-[11px] text-slate-500">
            <MapPin size={12} className="mr-2 opacity-40" />
            {task.location}
          </div>
          <div className="flex items-center text-[11px] text-slate-500">
            <Clock size={12} className="mr-2 opacity-40" />
            {formatDate(task.deadlineStart)} ~ {formatDate(task.deadlineEnd)}
          </div>
          
          { (task.status === 'accepted' || task.status === 'completed') && (isOwner || isAcceptor) && (
            <div className="flex items-center text-[11px] text-indigo-600 font-semibold bg-indigo-50 p-2 rounded-lg break-all">
              <Phone size={12} className="mr-2 flex-shrink-0" />
              聯絡方式：{task.contact}
            </div>
          )}

          <div className="pt-2 flex flex-col gap-2">
            {/* Accept Action */}
            {task.status === 'open' && !isOwner && user && (
              <button
                onClick={handleAccept}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all transform active:scale-95"
              >
                立刻承接任務
              </button>
            )}

            {/* Acceptor Actions */}
            {task.status === 'accepted' && isAcceptor && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleComplete}
                  className="py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all transform active:scale-95 flex items-center justify-center gap-1"
                >
                  <CheckCircle size={14} />
                  完成任務
                </button>
                <button
                  onClick={handleCancelAccept}
                  className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all transform active:scale-95 flex items-center justify-center gap-1"
                >
                  <XCircle size={14} />
                  取消承接
                </button>
              </div>
            )}

            {/* Owner Actions */}
            {isOwner && (
              <div className="flex flex-col gap-2">
                {task.status === 'open' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Edit2 size={12} />
                      編輯
                    </button>
                    <button
                      onClick={handleDelete}
                      className="py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Trash2 size={12} />
                      刪除
                    </button>
                  </div>
                )}
                {task.status === 'accepted' && (
                  <button
                    onClick={handleCancelByOwner}
                    className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <XCircle size={14} />
                    取消該承接者並刪除委託
                  </button>
                )}
                {task.status === 'completed' && (
                  <div className="w-full py-2 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold text-center italic">
                    任務已圓滿結束
                  </div>
                )}
              </div>
            )}

            {!isOwner && task.status === 'completed' && (
              <div className="w-full py-2 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold text-center italic">
                任務已結案
              </div>
            )}
            
            {!isOwner && task.status === 'accepted' && !isAcceptor && (
              <div className="w-full py-2 bg-blue-50 text-blue-400 rounded-xl text-xs font-bold text-center">
                任務進行中
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {isEditing && (
        <TaskForm taskToEdit={task} onClose={() => setIsEditing(false)} />
      )}
    </>
  );
};
