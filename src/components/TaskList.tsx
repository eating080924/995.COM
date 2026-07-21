import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Task } from '../types';
import { TaskCard } from './TaskCard';
import { useAuth } from '../lib/AuthContext';
import { motion } from 'motion/react';
import { 
  Loader2, 
  Inbox, 
  ChevronLeft, 
  ShoppingBag, 
  Sparkles, 
  Heart, 
  BookOpen, 
  Wrench, 
  FileText, 
  Truck, 
  Tag, 
  Briefcase, 
  HelpCircle, 
  Layers 
} from 'lucide-react';
import { TASK_CATEGORIES } from '../config/achievements';
import { cn } from '../lib/utils';

interface TaskListProps {
  filter: 'all' | 'open' | 'accepted' | 'my-tasks';
  searchQuery: string;
  categoryFilter?: string;
  regionFilter?: string;
  onCategoryChange?: (category: string) => void;
}

// Map each category to an elegant icon, color, background and border style
const CATEGORY_META: Record<string, { icon: React.ComponentType<any>; color: string; bgColor: string; borderColor: string }> = {
  '跑腿代購': { icon: ShoppingBag, color: 'text-rose-500', bgColor: 'bg-rose-50', borderColor: 'border-rose-100' },
  '家事清潔': { icon: Sparkles, color: 'text-amber-500', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
  '寵物照顧': { icon: Heart, color: 'text-red-500', bgColor: 'bg-red-50', borderColor: 'border-red-100' },
  '課業輔導': { icon: BookOpen, color: 'text-emerald-500', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100' },
  '水電維修': { icon: Wrench, color: 'text-blue-500', bgColor: 'bg-blue-50', borderColor: 'border-blue-100' },
  '文書處理': { icon: FileText, color: 'text-violet-500', bgColor: 'bg-violet-50', borderColor: 'border-violet-100' },
  '搬家協助': { icon: Truck, color: 'text-orange-500', bgColor: 'bg-orange-50', borderColor: 'border-orange-100' },
  '買賣交換': { icon: Tag, color: 'text-indigo-500', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-100' },
  '工作機會': { icon: Briefcase, color: 'text-teal-500', bgColor: 'bg-teal-50', borderColor: 'border-teal-100' },
  '其他': { icon: HelpCircle, color: 'text-slate-500', bgColor: 'bg-slate-50', borderColor: 'border-slate-100' }
};

export function TaskList({ filter, searchQuery, categoryFilter, regionFilter, onCategoryChange }: TaskListProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSelectedCategory, setLocalSelectedCategory] = useState('');

  // Handle external category filter changes by synchronizing local state
  useEffect(() => {
    if (categoryFilter !== undefined) {
      setLocalSelectedCategory(categoryFilter);
    }
  }, [categoryFilter]);

  useEffect(() => {
    let q;
    const tasksRef = collection(db, 'tasks');
    
    if (filter === 'all') {
      q = query(
        tasksRef, 
        where('status', 'in', ['open', 'accepted']),
        orderBy('createdAt', 'desc')
      );
    } else if (filter === 'my-tasks') {
      if (!user) {
        setLoading(false);
        setTasks([]);
        return;
      }
      q = query(
        tasksRef, 
        where('requesterId', '==', user.uid),
        where('status', 'in', ['open', 'accepted']),
        orderBy('createdAt', 'desc')
      );
    } else {
      // filter is 'open' or 'accepted'
      q = query(
        tasksRef,
        where('status', '==', filter),
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
    }, (error) => {
      console.warn('TaskList onSnapshot subscription error (client may be offline/connecting):', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filter, user]);

  // Base filtering excluding the category constraint
  const baseFilteredTasks = tasks.filter(task => {
    // Filter out expired open tasks on display
    if (task.status === 'open' && task.deadlineEnd) {
       try {
         const now = new Date();
         const deadlineDate = task.deadlineEnd.toDate ? task.deadlineEnd.toDate() : new Date(task.deadlineEnd);
         if (deadlineDate < now) {
           return false;
         }
       } catch (e) {
         console.warn('Error parsing deadlineEnd in TaskList:', e);
       }
    }

    // Region Filter
    if (regionFilter && task.region !== regionFilter) {
      return false;
    }

    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      task.content.toLowerCase().includes(lowerQuery) ||
      (task.location && task.location.toLowerCase().includes(lowerQuery)) ||
      (task.reward && task.reward.toLowerCase().includes(lowerQuery)) ||
      (task.taskNum && task.taskNum.includes(lowerQuery)) ||
      (task.category && task.category.toLowerCase().includes(lowerQuery)) ||
      (task.region && task.region.toLowerCase().includes(lowerQuery))
    );
  });

  const activeCategory = categoryFilter !== undefined ? categoryFilter : localSelectedCategory;

  const handleSelectCategory = (cat: string) => {
    setLocalSelectedCategory(cat);
    if (onCategoryChange) {
      onCategoryChange(cat);
    }
  };

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

  // FIRST LAYER: Category Overview View (No category selected)
  if (!activeCategory) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-slate-800 mb-2">
          <Layers size={18} className="text-red-500 stroke-[2.5]" />
          <h2 className="text-sm font-black tracking-wider text-slate-400 uppercase">
            請選擇任務類別以瀏覽細項
          </h2>
        </div>

        <motion.div 
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: {
                staggerChildren: 0.05
              }
            }
          }}
          className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
        >
          {TASK_CATEGORIES.map(cat => {
            const meta = CATEGORY_META[cat] || CATEGORY_META['其他'];
            const Icon = meta.icon;
            const totalCount = baseFilteredTasks.filter(task => task.category === cat).length;

            return (
              <motion.div
                key={cat}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show: { opacity: 1, y: 0 }
                }}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelectCategory(cat)}
                className="group bg-white border border-slate-100 rounded-2xl p-3.5 sm:p-5 cursor-pointer hover:border-slate-200 hover:shadow-md transition-all duration-200 flex flex-col justify-between h-32 sm:h-36 shadow-sm"
              >
                <div className="flex justify-between items-start gap-1">
                  <div className={cn("p-1.5 sm:p-2.5 rounded-xl border shrink-0", meta.bgColor, meta.color, meta.borderColor)}>
                    <Icon size={16} className="sm:w-5 sm:h-5 stroke-[2.5]" />
                  </div>
                  
                  <span className={cn(
                    "px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[11px] font-black tracking-tight whitespace-nowrap shrink-0",
                    totalCount > 0 
                      ? "bg-red-50 text-red-600 border border-red-100/50" 
                      : "bg-slate-50 text-slate-400 border border-slate-100"
                  )}>
                    共 {totalCount} 筆任務
                  </span>
                </div>

                <div>
                  <h3 className="font-black text-slate-800 text-sm sm:text-base leading-snug group-hover:text-red-600 transition-colors truncate">
                    {cat}
                  </h3>
                  <div className="flex items-center justify-between mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-50">
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold whitespace-nowrap">
                      瀏覽所有需求
                    </span>
                    <span className="text-xs text-slate-300 group-hover:text-red-500 group-hover:translate-x-1 transition-all font-black">
                      →
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    );
  }

  // SECOND LAYER: Category Detail View (Category selected)
  const finalCategoryFilteredTasks = baseFilteredTasks.filter(task => task.category === activeCategory);
  const activeMeta = CATEGORY_META[activeCategory] || CATEGORY_META['其他'];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumbs / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <button
          onClick={() => handleSelectCategory('')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-black text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all w-fit transform active:scale-95"
        >
          <ChevronLeft size={14} className="stroke-[2.5]" />
          <span>返回類別總覽</span>
        </button>
        
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span>任務大廳</span>
          <span>/</span>
          <span className="text-slate-800 font-bold flex items-center gap-1">
            <ActiveIcon size={12} className={activeMeta.color} />
            {activeCategory}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className={cn("p-2.5 rounded-xl border shrink-0", activeMeta.bgColor, activeMeta.color, activeMeta.borderColor)}>
          <ActiveIcon size={22} className="stroke-[2.5]" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800">{activeCategory}</h2>
          <p className="text-xs text-slate-400 font-semibold">
            共篩選出 {finalCategoryFilteredTasks.length} 筆符合條件的委託
          </p>
        </div>
      </div>

      {finalCategoryFilteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <Inbox size={40} className="mb-3 opacity-20" />
          <p className="text-sm font-bold text-slate-500">此類別目前無相符任務</p>
          <p className="text-xs mt-1 text-slate-400 max-w-xs text-center leading-relaxed px-4">
            此任務類別下目前沒有符合篩選條件的案件。您可以點擊上方「發布新任務」發布委託，或返回瀏覽其他類別。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {finalCategoryFilteredTasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
