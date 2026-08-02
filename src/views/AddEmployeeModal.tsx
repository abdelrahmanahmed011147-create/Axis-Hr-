import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserPlus, Mail, Lock, Loader2, Building, Briefcase } from 'lucide-react';
import { db } from '../lib/firebase';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Employee, Settings as SettingsType } from '../types';
import toast from 'react-hot-toast';

interface AddEmployeeModalProps {
  profile?: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsType | null;
  employees: Employee[];
  getNextEmployeeCode: (employees: Employee[], offset?: number) => string;
}

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen, onClose, settings, employees, getNextEmployeeCode, profile
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState(settings?.companies?.[0] || 'مجموعة أكسس');
  const [department, setDepartment] = useState(settings?.departments?.[0] || 'General');
  const [jobTitle, setJobTitle] = useState(settings?.jobTitles?.[0] || 'Employee');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      toast.error('الرجاء إدخال البريد الإلكتروني وكلمة المرور والاسم بالكامل');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/createEmployee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          company,
          department,
          jobTitle,
          employeeCode: getNextEmployeeCode(employees, 0),
          role: 'EMPLOYEE',
          createdBy: profile?.email || 'SYSTEM'
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'فشل في إضافة الموظف');
      }

      toast.success('تمت إضافة الموظف بنجاح');
      onClose();
      setEmail('');
      setPassword('');
      setFullName('');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'حدث خطأ أثناء إضافة الموظف');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#0A0A0A]/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-[#12071F]/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl relative z-10"
          dir="rtl"
        >
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center">
                <UserPlus size={20} />
              </div>
              <h2 className="text-xl font-black text-white">إضافة موظف جديد</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleAdd} className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-white/60 mb-2">الاسم الكامل</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
                placeholder="أحمد محمد..."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-white/60 mb-2">البريد الإلكتروني</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-white/30">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-10 pl-3 text-white placeholder-white/20 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all text-sm"
                    placeholder="name@axis.com"
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/60 mb-2">كلمة المرور الابتدائية</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-white/30">
                    <Lock size={16} />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-10 pl-3 text-white placeholder-white/20 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all text-sm tracking-widest"
                    placeholder="••••••••"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-white/60 mb-2">الشركة</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-white/30">
                    <Building size={16} />
                  </div>
                  <select
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-10 pl-3 text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all text-sm appearance-none"
                  >
                    {settings?.companies?.map(c => (
                      <option key={c} value={c} className="bg-[#12071F]">{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/60 mb-2">القسم</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-white/30">
                    <Briefcase size={16} />
                  </div>
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-10 pl-3 text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all text-sm appearance-none"
                  >
                    {settings?.departments?.map(d => (
                      <option key={d} value={d} className="bg-[#12071F]">{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                type="submit"
                className="w-full py-4 rounded-xl font-black text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    <UserPlus size={20} />
                    <span>إنشاء حساب الموظف</span>
                  </>
                )}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
