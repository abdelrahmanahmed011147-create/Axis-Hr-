import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getAuth } from 'firebase/auth';
import { motion } from 'motion/react';
import { Settings as SettingsType } from '../types';
import { Toaster, toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon, Save, Clock, Percent, Building, Briefcase, Trash2, Shield, Plus } from 'lucide-react';
import { seedInitialData } from '../lib/seed';
import { cn } from '../lib/utils';
export const SettingsView: React.FC = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(doc(db, 'settings', 'system_config'), 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as SettingsType;
          if (!data.companies || data.companies.length === 0) {
            data.companies = ["مجموعة أكسس", "شركة مدار", "شركة جذور", "الأكاديمي"];
          }
          if (!data.morningStartTime) data.morningStartTime = "09:00";
          if (!data.morningEndTime) data.morningEndTime = "17:00";
          if (!data.eveningStartTime) data.eveningStartTime = "12:00";
          if (!data.eveningEndTime) data.eveningEndTime = "21:00";
          if (!(data as any).evening2StartTime) (data as any).evening2StartTime = "13:00";
          if (!(data as any).evening2EndTime) (data as any).evening2EndTime = "21:00";
          setSettings(data);
        } else {
          setSettings({} as any);
        }
      },
      (error) => {
        console.error("Settings Fetch Error:", error);
        toast.error("فشل تحميل الإعدادات: " + (error as any).message);
        setSettings({} as any); 
      }
    );
    return () => unsub();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !settings.workStartTime) return;
    setLoading(true);
    try {
      const updatedSettings = {
        ...settings,
        workStartTime: settings.morningStartTime || settings.workStartTime || "09:00",
        workEndTime: settings.morningEndTime || settings.workEndTime || "17:00",
      };
      await setDoc(doc(db, 'settings', 'system_config'), updatedSettings as any);
      toast.success('تم حفظ الإعدادات بنجاح');
    } catch (e: any) {
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  const runSeed = async () => {
    setLoading(true);
    try {
      await seedInitialData();
      toast.success('تمت إضافة البيانات الافتراضية');
    } catch (e) {
      toast.error('حدث خطأ أثناء تهيئة النظام');
    } finally {
      setLoading(false);
    }
  };

  const handleWipeDatabase = async () => {
    const confirmWipe = window.confirm("هل أنت متأكد من رغبتك في حذف كافة بيانات النظام بالكامل والبدء من جديد؟ سيؤدي ذلك إلى مسح جميع طلبات التوظيف، وسجلات الحضور والإنصراف، وطلبات الإجازات، وحسابات الموظفين (مع الإبقاء على حسابك الحالي كمدير نظام).");
    if (!confirmWipe) return;

    setLoading(true);
    try {
      const authInstance = getAuth();
      const currentUserUid = authInstance.currentUser?.uid;

      // 1. Delete Attendance logs
      const attSnap = await getDocs(collection(db, 'attendance'));
      const attBatch = writeBatch(db);
      attSnap.docs.forEach((docSnap) => {
        attBatch.delete(docSnap.ref);
      });
      await attBatch.commit();

      // 2. Delete Requests
      const reqSnap = await getDocs(collection(db, 'requests'));
      const reqBatch = writeBatch(db);
      reqSnap.docs.forEach((docSnap) => {
        reqBatch.delete(docSnap.ref);
      });
      await reqBatch.commit();

      // 3. Delete Audit Logs
      const auditSnap = await getDocs(collection(db, 'auditLogs'));
      const auditBatch = writeBatch(db);
      auditSnap.docs.forEach((docSnap) => {
        auditBatch.delete(docSnap.ref);
      });
      await auditBatch.commit();

      // 4. Delete Employees except the currently logged-in user (Master)
      const empSnap = await getDocs(collection(db, 'employees'));
      const empBatch = writeBatch(db);
      let count = 0;
      empSnap.docs.forEach((docSnap) => {
        if (docSnap.id !== currentUserUid) {
          empBatch.delete(docSnap.ref);
          count++;
        }
      });
      await empBatch.commit();

      // 5. Reset system settings to default seed values
      await seedInitialData();

      toast.success(`تم تفريغ كافة بيانات النظام بنجاح! تم حذف ${count} ملف موظف مع الإبقاء على ملفك الحالي كمدير نظام، وحذف جميع سجلات الحضور والإجازات.`);
    } catch (error: any) {
      console.error("Wipe Database Error:", error);
      toast.error("فشل مسح البيانات: " + (error.message || String(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleWipeRequests = async () => {
    const confirmWipe = window.confirm("هل أنت متأكد من رغبتك في حذف جميع أذونات وإجازات الشركة الحالية وتصفير الأرصدة والمستهلك لكافة الموظفين؟ هذا الإجراء لا يمكن التراجع عنه.");
    if (!confirmWipe) return;

    setLoading(true);
    try {
      const reqSnap = await getDocs(collection(db, 'requests'));
      const reqBatch = writeBatch(db);
      reqSnap.docs.forEach((docSnap) => {
        reqBatch.delete(docSnap.ref);
      });
      await reqBatch.commit();

      toast.success("تم حذف كافة الأذونات والإجازات بنجاح، وتم تصفير رصيد المستهلك لجميع الموظفين! 🟢");
    } catch (error: any) {
      console.error("Wipe Requests Error:", error);
      toast.error("فشل حذف وتصفير الأذونات: " + (error.message || String(error)));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="w-12 h-12 border-4 border-[#E2B765]/20 border-t-[#E2B765] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-[#1E0F33]/80 border border-red-500/20 rounded-3xl max-w-lg mx-auto my-12" dir="rtl">
        <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20">
          <Shield size={32} />
        </div>
        <h2 className="text-xl font-bold text-red-400">غير مصرح بالوصول</h2>
        <p className="text-base text-[#A78BFA] mt-2">عذراً، هذه الصفحة مخصصة لمدراء النظام فقط ولا يسمح للموظفين بالاطلاع على إعدادات المجموعة.</p>
      </div>
    );
  }

  if (!settings) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-[#7C3AED]/20 border-t-[#C084FC] rounded-full animate-spin"></div>
      <p className="text-[#A78BFA] animate-pulse font-medium">جاري مزامنة إعدادات النظام...</p>
    </div>
  );

  const hasSettings = settings && settings.workStartTime;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16 px-4 md:px-6" dir="rtl">
      <Toaster position="top-center" />
      
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-4 text-right">
          <div className="w-12 h-12 bg-[#7C3AED]/20 rounded-xl flex items-center justify-center text-[#C084FC] border border-[#7C3AED]/30 shadow-lg shadow-[#7C3AED]/10 shrink-0">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-black tracking-tight text-white mb-0.5">إعدادات النظام</h3>
            <p className="text-sm text-[#A78BFA]">تخصيص القواعد والبيانات الأساسية للشركة والمجموعة</p>
          </div>
        </div>

        <div className="flex gap-2">
          {!hasSettings && (
            <button 
              onClick={runSeed}
              className="group bg-gradient-to-r from-orange-500 to-rose-500 text-white px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg"
            >
              <Save size={16} />
              <span>تهيئة النظام</span>
            </button>
          )}
        </div>
      </div>

      {!hasSettings ? (
        <div className="max-w-2xl mx-auto bg-white/5 backdrop-blur-md p-10 rounded-2xl border border-white/10 text-center space-y-4 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#7C3AED]/10 blur-[80px] -z-10" />
          <SettingsIcon className="mx-auto text-[#7C3AED] opacity-25 animate-spin-slow" size={60} />
          <div className="max-w-md mx-auto">
            <h4 className="text-xl font-black mb-1">النظام غير جاهز</h4>
            <p className="text-[#A78BFA] text-base leading-relaxed">يرجى الضغط على زر "تهيئة النظام" بالأعلى لإضافة الأقسام ومواعيد العمل والبيانات الضرورية لتشغيل تطبيق AXIS.</p>
          </div>
        </div>
      ) : (
        <div>
          <form onSubmit={handleUpdate} className="space-y-8 text-right">
            
            {/* Shifts & Work Hours Management */}
            <section className="bg-white/[0.03] backdrop-blur-md p-8 rounded-3xl border border-white/10 hover:border-[#E2B765]/35 shadow-xl space-y-6 relative group transition-all duration-300">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#E2B765]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl pointer-events-none" />
              
              <div className="flex items-center gap-3 justify-start border-b border-white/5 pb-3">
                <div className="w-10 h-10 bg-[#E2B765]/10 text-[#E2B765] border border-[#E2B765]/20 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                  <Clock size={20} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">إدارة شيفتات ومواعيد العمل الرسمية</h4>
                  <p className="text-sm text-[#A78BFA]">تخصيص أوقات الشيفت الصباحي والمسائي وقواعد الحضور والانصراف</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Morning Shift Card */}
                <div className="bg-white/[0.02] p-5 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <h5 className="text-base font-black text-white">الشيفت الصباحي</h5>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">وقت بدء العمل</label>
                      <input 
                        type="time"
                        value={settings.morningStartTime || "09:00"}
                        onChange={(e) => setSettings({ ...settings, morningStartTime: e.target.value })}
                        className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">وقت انتهاء العمل</label>
                      <input 
                        type="time"
                        value={settings.morningEndTime || "17:00"}
                        onChange={(e) => setSettings({ ...settings, morningEndTime: e.target.value })}
                        className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Evening Shift Card */}
                <div className="bg-white/[0.02] p-5 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <h5 className="text-base font-black text-white">الشيفت المسائي</h5>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">وقت بدء العمل</label>
                      <input 
                        type="time"
                        value={settings.eveningStartTime || "12:00"}
                        onChange={(e) => setSettings({ ...settings, eveningStartTime: e.target.value })}
                        className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">وقت انتهاء العمل</label>
                      <input 
                        type="time"
                        value={settings.eveningEndTime || "21:00"}
                        onChange={(e) => setSettings({ ...settings, eveningEndTime: e.target.value })}
                        className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Evening Shift 2 Card (NEW third shift) */}
                <div className="bg-white/[0.02] p-5 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <h5 className="text-base font-black text-white">الشيفت المسائي (13:00)</h5>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">وقت بدء العمل</label>
                      <input 
                        type="time"
                        value={(settings as any).evening2StartTime || "13:00"}
                        onChange={(e) => setSettings({ ...settings, evening2StartTime: e.target.value } as any)}
                        className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">وقت انتهاء العمل</label>
                      <input 
                        type="time"
                        value={(settings as any).evening2EndTime || "21:00"}
                        onChange={(e) => setSettings({ ...settings, evening2EndTime: e.target.value } as any)}
                        className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-white/5 pt-5">
                <div>
                  <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">دقائق السماح (تأخير مقبول)</label>
                  <input 
                    type="number"
                    value={settings.graceMinutes ?? 15}
                    onChange={(e) => setSettings({ ...settings, graceMinutes: Number(e.target.value) })}
                    className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">رصيد الأذونات الشهري (بالساعات)</label>
                  <input 
                    type="number"
                    value={settings.monthlyPermissionHours ?? 5}
                    onChange={(e) => setSettings({ ...settings, monthlyPermissionHours: Number(e.target.value) })}
                    className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#A78BFA] mb-1.5 font-bold">عتبة الخصم الإضافي للأذونات</label>
                  <input 
                    type="number"
                    value={settings.permissionOverLimit ?? 7}
                    onChange={(e) => setSettings({ ...settings, permissionOverLimit: Number(e.target.value) })}
                    className="w-full bg-[#12071F] border border-white/10 rounded-xl py-2 px-3 text-white text-sm font-mono outline-none focus:border-[#E2B765] transition-all"
                  />
                </div>
              </div>
            </section>

            {/* 3 Columns Management for Lists (Departments, Job Titles, Companies) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Departments Management */}
              <section className="bg-white/[0.03] backdrop-blur-md p-6 rounded-2xl border border-white/10 hover:border-emerald-500/30 shadow-xl space-y-5 relative group transition-all duration-300">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none" />
                
                <div className="flex items-center gap-3 justify-start border-b border-white/5 pb-3">
                  <div className="w-9 h-9 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                    <Building size={18} />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-white">الهيكل التنظيمي</h4>
                    <p className="text-[10px] text-emerald-400/75">إدارة أقسام وإدارات الشركة</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      id="new-dept"
                      placeholder="قسم جديد..."
                      className="flex-1 bg-white/[0.02] border border-white/10 focus:border-emerald-500 focus:bg-white/[0.04] rounded-xl py-2 px-3 text-sm text-white outline-none transition-all text-right font-sans placeholder-white/20"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            setSettings({ ...settings, departments: [...(settings.departments || []), input.value.trim()] });
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('new-dept') as HTMLInputElement;
                        if (input.value.trim()) {
                          setSettings({ ...settings, departments: [...(settings.departments || []), input.value.trim()] });
                          input.value = '';
                        }
                      }}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-xl text-sm font-black transition-all hover:shadow-lg hover:shadow-emerald-500/10 active:scale-95 flex items-center gap-1 shrink-0"
                    >
                      <Plus size={14} />
                      <span>إضافة</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                    {(!settings.departments || settings.departments.length === 0) ? (
                      <div className="w-full text-center py-8 text-white/20 text-sm">لا توجد أقسام مضافة بعد</div>
                    ) : (
                      settings.departments.map((dept, i) => (
                        <motion.span 
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          key={i} 
                          className="bg-emerald-500/5 text-emerald-300 px-2.5 py-1 rounded-lg text-sm font-bold flex items-center gap-2 border border-emerald-500/10 hover:border-emerald-500/30 transition-all cursor-default font-sans group/tag"
                        >
                          {dept}
                          <button 
                            type="button"
                            onClick={() => setSettings({ ...settings, departments: settings.departments.filter((_, idx) => idx !== i) })}
                            className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center hover:bg-rose-500/20 hover:text-rose-400 transition-colors text-[10px]"
                          >
                            ×
                          </button>
                        </motion.span>
                      ))
                    )}
                  </div>
                </div>
              </section>

              {/* Job Titles Management */}
              <section className="bg-white/[0.03] backdrop-blur-md p-6 rounded-2xl border border-white/10 hover:border-purple-500/30 shadow-xl space-y-5 relative group transition-all duration-300">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none" />
                
                <div className="flex items-center gap-3 justify-start border-b border-white/5 pb-3">
                  <div className="w-9 h-9 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                    <Briefcase size={18} />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-white">المسميات الوظيفية</h4>
                    <p className="text-[10px] text-purple-400/75">إدارة الأدوار والمسميات الوظيفية</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      id="new-title"
                      placeholder="مسمى جديد..."
                      className="flex-1 bg-white/[0.02] border border-white/10 focus:border-purple-500 focus:bg-white/[0.04] rounded-xl py-2 px-3 text-sm text-white outline-none transition-all text-right font-sans placeholder-white/20"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            setSettings({ ...settings, jobTitles: [...(settings.jobTitles || []), input.value.trim()] });
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('new-title') as HTMLInputElement;
                        if (input.value.trim()) {
                          setSettings({ ...settings, jobTitles: [...(settings.jobTitles || []), input.value.trim()] });
                          input.value = '';
                        }
                      }}
                      className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-xl text-sm font-black transition-all hover:shadow-lg hover:shadow-purple-500/10 active:scale-95 flex items-center gap-1 shrink-0"
                    >
                      <Plus size={14} />
                      <span>إضافة</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                    {(!settings.jobTitles || settings.jobTitles.length === 0) ? (
                      <div className="w-full text-center py-8 text-white/20 text-sm">لا توجد مسميات مضافة بعد</div>
                    ) : (
                      settings.jobTitles.map((title, i) => (
                        <motion.span 
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          key={i} 
                          className="bg-purple-500/5 text-purple-300 px-2.5 py-1 rounded-lg text-sm font-bold flex items-center gap-2 border border-purple-500/10 hover:border-purple-500/30 transition-all cursor-default font-sans group/tag"
                        >
                          {title}
                          <button 
                            type="button"
                            onClick={() => setSettings({ ...settings, jobTitles: settings.jobTitles.filter((_, idx) => idx !== i) })}
                            className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center hover:bg-rose-500/20 hover:text-rose-400 transition-colors text-[10px]"
                          >
                            ×
                          </button>
                        </motion.span>
                      ))
                    )}
                  </div>
                </div>
              </section>

              {/* Companies Management */}
              <section className="bg-white/[0.03] backdrop-blur-md p-6 rounded-2xl border border-white/10 hover:border-blue-500/30 shadow-xl space-y-5 relative group transition-all duration-300">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none" />
                
                <div className="flex items-center gap-3 justify-start border-b border-white/5 pb-3">
                  <div className="w-9 h-9 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                    <Building size={18} />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-white">شركات المجموعة</h4>
                    <p className="text-[10px] text-blue-400/75">إدارة الكيانات والشركات التابعة</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      id="new-company"
                      placeholder="شركة جديدة..."
                      className="flex-1 bg-white/[0.02] border border-white/10 focus:border-blue-500 focus:bg-white/[0.04] rounded-xl py-2 px-3 text-sm text-white outline-none transition-all text-right font-sans placeholder-white/20"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            setSettings({ ...settings, companies: [...(settings.companies || []), input.value.trim()] });
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('new-company') as HTMLInputElement;
                        if (input.value.trim()) {
                          setSettings({ ...settings, companies: [...(settings.companies || []), input.value.trim()] });
                          input.value = '';
                        }
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-black transition-all hover:shadow-lg hover:shadow-blue-500/10 active:scale-95 flex items-center gap-1 shrink-0"
                    >
                      <Plus size={14} />
                      <span>إضافة</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                    {(!settings.companies || settings.companies.length === 0) ? (
                      <div className="w-full text-center py-8 text-white/20 text-sm">لا توجد شركات مضافة بعد</div>
                    ) : (
                      settings.companies.map((comp, i) => (
                        <motion.span 
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          key={i} 
                          className="bg-blue-500/5 text-blue-300 px-2.5 py-1 rounded-lg text-sm font-bold flex items-center gap-2 border border-blue-500/10 hover:border-blue-500/30 transition-all cursor-default font-sans group/tag"
                        >
                          {comp}
                          <button 
                            type="button"
                            onClick={() => setSettings({ ...settings, companies: settings.companies.filter((_, idx) => idx !== i) })}
                            className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center hover:bg-rose-500/20 hover:text-rose-400 transition-colors text-[10px]"
                          >
                            ×
                          </button>
                        </motion.span>
                      ))
                    )}
                  </div>
                </div>
              </section>

            </div>



            <div className="flex justify-center pt-6">
              <button 
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-[#7C3AED] via-[#C084FC] to-[#7C3AED] bg-[length:200%_auto] hover:bg-right text-white px-16 py-3 rounded-xl font-black text-sm flex items-center gap-2.5 transition-all duration-500 shadow-xl shadow-[#7C3AED]/20 hover:shadow-[#7C3AED]/30 disabled:opacity-50 hover:scale-[1.03] active:scale-95 cursor-pointer"
              >
                <div className={cn(loading ? "animate-spin" : "")}>
                  {loading ? <Clock size={16} /> : <Save size={16} />}
                </div>
                <span>{loading ? 'جاري الحفظ...' : 'تثبيت التغييرات النهائية'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
