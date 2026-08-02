import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { LeaveRequest } from '../types';
import { Clock, Coffee, Sun, Moon, Check, X, AlertCircle, Calendar } from 'lucide-react';
import { cn, formatStringTimeTo12Hour } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const RequestsView: React.FC = () => {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');

  useEffect(() => {
    if (!profile?.id) return;

    const q = query(
      collection(db, 'requests'),
      where('userId', '==', profile.id)
    );

    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
      // Sort in descending order by createdAt manually to avoid composite index requirements
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.seconds 
          ? a.createdAt.seconds * 1000 
          : (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0));
        const timeB = b.createdAt?.seconds 
          ? b.createdAt.seconds * 1000 
          : (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0));
        return timeB - timeA;
      });
      setRequests(fetched);
    }, (error) => {
      console.error("Requests fetch error:", error);
    });

    return () => unsub();
  }, [profile?.id]);

  const filteredRequests = filter === 'All' 
    ? requests 
    : requests.filter(r => r.status === filter);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved': return <Check size={14} className="text-green-400" />;
      case 'Rejected': return <X size={14} className="text-red-400" />;
      default: return <AlertCircle size={14} className="text-orange-400" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'permission': return 'طلب إذن';
      case 'vacation_regular': return 'إجازة اعتيادية';
      case 'vacation_sick': return 'إجازة مرضية';
      case 'remote': return 'يوم ريموت';
      default: return type;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Approved': return 'تم القبول';
      case 'Rejected': return 'تم الرفض';
      default: return 'قيد المراجعة';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-3xl font-bold">سجل الطلبات</h3>
          <p className="text-[#A78BFA]">متابعة حالة طلبات الإذن والإجازات الخاصة بك</p>
        </div>

        <div className="flex bg-[#1E0F33] p-1.5 rounded-2xl border border-[#7C3AED]/20">
          {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                filter === f 
                  ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20" 
                  : "text-[#A78BFA] hover:text-white"
              )}
            >
              {f === 'All' ? 'الكل' : f === 'Pending' ? 'معلق' : f === 'Approved' ? 'مقبول' : 'مرفوض'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredRequests.map((req) => (
            <motion.div
              layout
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              key={req.id}
              className="bg-[#1E0F33] p-6 rounded-[2rem] border border-[#7C3AED]/10 hover:border-[#7C3AED]/30 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                    req.status === 'Approved' ? "bg-green-500/10 text-green-400" : 
                    req.status === 'Rejected' ? "bg-red-500/10 text-red-400" : 
                    "bg-orange-500/10 text-orange-400"
                  )}>
                    {getStatusIcon(req.status)}
                    {getStatusLabel(req.status)}
                  </div>
                  <span className="text-[10px] text-[#A78BFA] font-mono">{req.createdAt?.toDate ? new Date(req.createdAt.toDate()).toLocaleDateString('ar-EG') : ''}</span>
                </div>

                <h4 className="text-xl font-bold mb-1">{getTypeLabel(req.type)}</h4>
                <div className="flex items-center gap-2 text-[#A78BFA] text-xs mb-4">
                  <Calendar size={12} />
                  <span>
                    {req.type === 'permission' 
                      ? `${req.date} (${formatStringTimeTo12Hour(req.fromTime)} - ${formatStringTimeTo12Hour(req.toTime)})`
                      : `${req.fromDate} إلى ${req.toDate}`
                    }
                  </span>
                </div>

                <div className="bg-[#12071F]/50 p-4 rounded-xl border border-[#7C3AED]/5 mb-4">
                  <p className="text-xs text-[#F5F3FF]/80 leading-relaxed italic">"{req.reason}"</p>
                </div>
              </div>

              {req.adminComment && (
                <div className="mt-4 pt-4 border-t border-[#7C3AED]/10">
                   <p className="text-[10px] text-[#A78BFA] mb-1">رد الإدارة:</p>
                   <p className={cn(
                     "text-sm font-bold",
                     req.status === 'Approved' ? "text-emerald-400" : 
                     req.status === 'Rejected' ? "text-rose-400" : 
                     "text-[#C084FC]"
                   )}>{req.adminComment}</p>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredRequests.length === 0 && (
        <div className="bg-[#1E0F33] p-20 rounded-[3rem] border border-[#7C3AED]/10 text-center space-y-6">
           <div className="w-20 h-20 bg-[#7C3AED]/5 rounded-full flex items-center justify-center mx-auto">
             <AlertCircle size={40} className="text-[#7C3AED] opacity-20" />
           </div>
           <div>
             <h4 className="text-xl font-bold mb-2">لا توجد طلبات هنا</h4>
             <p className="text-[#A78BFA]">لم تقم بإرسال أي طلبات بهذا التصنيف حتى الآن</p>
           </div>
        </div>
      )}
    </div>
  );
};
