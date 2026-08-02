import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { EmployeeEvaluation, DepartmentKPINext } from '../types';
import { 
  Award, 
  Calendar, 
  TrendingUp, 
  Layers, 
  CheckCircle, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  User, 
  Activity, 
  FileText,
  Clock,
  ClipboardList
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export const MyEvaluationsView: React.FC = () => {
  const { profile } = useAuth();
  const [evaluations, setEvaluations] = useState<EmployeeEvaluation[]>([]);
  const [kpiConfigs, setKpiConfigs] = useState<DepartmentKPINext[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvalId, setExpandedEvalId] = useState<string | null>(null);

  // Load KPI configs to display max weight limits for criteria accurately
  useEffect(() => {
    const unsubConfigs = onSnapshot(collection(db, 'kpiConfigs'), (snap) => {
      const list: DepartmentKPINext[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as DepartmentKPINext);
      });
      setKpiConfigs(list);
    });
    return () => unsubConfigs();
  }, []);

  // Fetch Evaluations for this logged-in employee
  useEffect(() => {
    if (!profile?.id) return;

    const q = query(
      collection(db, 'kpiEvaluations'),
      where('employeeId', '==', profile.id)
    );

    const unsubEvals = onSnapshot(q, (snap) => {
      const list: EmployeeEvaluation[] = [];
      snap.forEach((doc) => {
        const item = { id: doc.id, ...doc.data() } as EmployeeEvaluation;
        if (item.showToEmployee !== false) {
          list.push(item);
        }
      });
      
      // Sort evaluations descending by month in memory to avoid needing a Firestore composite index
      list.sort((a, b) => b.month.localeCompare(a.month));
      
      setEvaluations(list);
      
      // Expand the latest evaluation by default
      if (list.length > 0 && !expandedEvalId) {
        setExpandedEvalId(list[0].id || null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching employee evaluations:", error);
      setLoading(false);
    });

    return () => unsubEvals();
  }, [profile?.id]);

  // Find KPI config for the employee's department
  const userKpiConfig = useMemo(() => {
    if (!profile?.department) return null;
    return kpiConfigs.find(
      (c) => c.departmentName.toLowerCase() === profile.department.toLowerCase()
    ) || null;
  }, [kpiConfigs, profile?.department]);

  // Overall statistics
  const stats = useMemo(() => {
    if (evaluations.length === 0) return { avg: 0, count: 0, maxMonth: '---', bestScore: 0 };
    const total = evaluations.reduce((sum, e) => sum + e.totalScore, 0);
    const scoresList = evaluations.map(e => e.totalScore);
    const bestScore = Math.max(...scoresList);
    
    // Sort evaluations chronologically to search latest
    const sorted = [...evaluations].sort((a, b) => a.month.localeCompare(b.month));
    const latest = sorted[sorted.length - 1];

    return {
      avg: Math.round(total / evaluations.length),
      count: evaluations.length,
      latestMonth: latest ? latest.month : '---',
      latestScore: latest ? latest.totalScore : 0,
      bestScore
    };
  }, [evaluations]);

  // Format month label to Arabic (e.g. مايو 2026)
  const formatMonthArabic = (monthStr: string) => {
    if (!monthStr || !monthStr.includes('-')) return monthStr;
    const [year, month] = monthStr.split('-');
    const monthsArabic = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const mIdx = parseInt(month) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${monthsArabic[mIdx]} ${year}`;
    }
    return monthStr;
  };

  // Prepare chart data chronologically (oldest to latest)
  const chartData = useMemo(() => {
    return [...evaluations]
      .reverse() // from oldest to latest
      .map((ev) => ({
        monthName: formatMonthArabic(ev.month),
        'معدل التقدم': ev.totalScore,
        monthRaw: ev.month
      }));
  }, [evaluations]);

  // Determine performance color styles based on score out of 100
  const getScoreBadgeStyles = (score: number) => {
    if (score >= 85) {
      return {
        bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        label: 'ممتاز ✨',
        trackColor: 'from-emerald-500 to-teal-400'
      };
    }
    if (score >= 70) {
      return {
        bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        label: 'جيد جداً 👍',
        trackColor: 'from-amber-400 to-[#E2B765]'
      };
    }
    if (score >= 50) {
      return {
        bg: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
        label: 'مقبول ⚠️',
        trackColor: 'from-orange-500 to-amber-500'
      };
    }
    return {
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      label: 'يحتاج تطوير 🔴',
      trackColor: 'from-rose-600 to-red-400'
    };
  };

  if (loading) {
    return (
      <div id="my-evals-loading" className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div id="my-evals-spinner" className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p id="my-evals-loading-text" className="text-[#A78BFA] text-xs font-bold animate-pulse">جاري تحميل تقييماتك الشخصية...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="my-evaluations-container" className="space-y-8 select-none max-w-7xl mx-auto p-4 md:p-6" dir="rtl">
      
      {/* Top Banner Widget */}
      <div id="my-evals-banner" className="bg-gradient-to-br from-[#200B3B]/80 via-[#140627]/90 to-[#0A0216]/95 p-8 rounded-[2.5rem] border border-white/10 shadow-3xl shadow-purple-500/5 relative overflow-hidden backdrop-blur-2xl">
        <div className="absolute -top-12 -left-12 w-80 h-80 bg-purple-600/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-96 h-96 bg-[#E2B765]/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 z-10 w-full">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-gradient-to-r from-purple-500/20 to-indigo-500/10 text-purple-200 border border-purple-500/30 text-[10px] font-mono font-black uppercase px-3.5 py-1.5 rounded-full tracking-wider shadow-inner backdrop-blur-md">
                لوحة الأداء المهني الشخصية 🏆
              </span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-purple-200">
              مؤشرات تقييمي والـ KPIs
            </h1>
            <p className="text-[#BCA5FF] text-xs md:text-sm mt-2 max-w-2xl leading-relaxed">
              تابع تطور تقييمك الشهري، والنسب المحققة في المعايير التقنية والسلوكية المعتمدة لقسمك في الوقت الفعلي.
            </p>
          </div>
          
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 py-3.5 px-5 rounded-2xl backdrop-blur-md">
            <div className="text-right">
              <span className="text-[10px] text-white/50 block font-bold leading-none mb-1">القسم الحالي</span>
              <span className="text-xs text-[#E2B765] font-black">{profile?.department || 'عام'}</span>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-right">
              <span className="text-[10px] text-white/50 block font-bold leading-none mb-1">المسمى الوظيفي</span>
              <span className="text-xs text-white/90 font-black">{profile?.jobTitle || 'موظف'}</span>
            </div>
          </div>
        </div>
      </div>

      {evaluations.length === 0 ? (
        <div id="no-evals-container" className="bg-[#1E0F33]/20 border border-white/5 p-12 rounded-[2.5rem] text-center max-w-md mx-auto relative overflow-hidden backdrop-blur-xs">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/5 rounded-full blur-[60px] pointer-events-none" />
          <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 mx-auto mb-5 border border-purple-500/15">
            <Award size={32} />
          </div>
          <h2 className="text-lg font-black text-white mb-2">لا تتوفر تقييمات مسجلة بعد</h2>
          <p className="text-[#A78BFA] text-xs leading-relaxed">
            لم يقم مديرو الأقسام بإدراج أي تقييمات KPIs خاصة بحسابك خلال الأشهر الحالية بعد. سيتم إخطارك فور إقرار تقييمك الأول.
          </p>
        </div>
      ) : (
        <>
          {/* Key Analytics Summary Widgets */}
          <div id="my-evals-stats-grid" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Card 1: Cumulative Average Score */}
            <div className="bg-gradient-to-br from-[#1E0F33]/70 to-[#12071F]/90 p-6 rounded-3xl border border-white/10 shadow-xl relative group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#A78BFA] text-[10px] uppercase font-bold tracking-widest block">متوسط الأداء التراكمي</span>
                <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-lg">إجمالي</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-white">{stats.avg}%</span>
                <span className={cn("text-xs font-black px-2 py-0.5 rounded-md border", getScoreBadgeStyles(stats.avg).bg)}>
                  {getScoreBadgeStyles(stats.avg).label}
                </span>
              </div>
              <div className="mt-4 text-[10px] text-white/50">
                معدل تقييماتك الوسطي عبر {stats.count} أشهر مسجلة من الإدارة.
              </div>
            </div>

            {/* Card 2: Latest Evaluation */}
            <div className="bg-gradient-to-br from-[#1E0F33]/70 to-[#12071F]/90 p-6 rounded-3xl border border-white/10 shadow-xl relative">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#A78BFA] text-[10px] uppercase font-bold tracking-widest block">آخر تقييم معتمد</span>
                <span className="text-xs bg-amber-500/10 text-[#E2B765] border border-amber-500/20 px-2 py-0.5 rounded-lg font-mono">
                  {stats.latestMonth}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-white">{stats.latestScore}%</span>
                <span className={cn("text-xs font-black px-2 py-0.5 rounded-md border", getScoreBadgeStyles(stats.latestScore).bg)}>
                  {getScoreBadgeStyles(stats.latestScore).label}
                </span>
              </div>
              <div className="mt-4 text-[10px] text-white/50">
                آخر تقييم معتمد لشهر <span className="text-[#E2B765] font-bold">{formatMonthArabic(stats.latestMonth)}</span>.
              </div>
            </div>

            {/* Card 3: Historical Highest Score */}
            <div className="bg-gradient-to-br from-[#1E0F33]/70 to-[#12071F]/90 p-6 rounded-3xl border border-white/10 shadow-xl relative">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#A78BFA] text-[10px] uppercase font-bold tracking-widest block">أعلى تقييم محقق</span>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-lg">رقم قياسي 🎯</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-[#E2B765]">{stats.bestScore}%</span>
                <span className="text-xs text-white/40">قصارى جهدك</span>
              </div>
              <div className="mt-4 text-[10px] text-white/50">
                أقصى نتيجة نسبية حققتها بنجاح في مهام الـ KPIs المعتمدة.
              </div>
            </div>

          </div>

          {/* Performance Line Chart widget */}
          <div id="my-evals-chart-card" className="bg-gradient-to-br from-[#200B3B]/40 via-[#10041F]/60 to-[#0C021A]/50 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/10 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">منحنى تطور الأداء والالتزام الشهري</h3>
                  <p className="text-[10px] text-[#A78BFA] mt-0.5">شارت التطور التراكمي للنسب المحصلة عبر الأشهر المتوالية</p>
                </div>
              </div>
              <div className="text-[10px] bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 text-slate-300 font-bold">
                تصفح بياني 📉
              </div>
            </div>

            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="monthName" 
                    stroke="rgba(255,255,255,0.4)" 
                    fontSize={10} 
                    fontWeight="bold" 
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="rgba(255,255,255,0.4)" 
                    fontSize={10} 
                    fontWeight="bold" 
                    domain={[0, 100]}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1E0F33', 
                      borderColor: 'rgba(124, 58, 237, 0.3)', 
                      borderRadius: '1rem',
                      color: '#fff',
                      textAlign: 'right',
                      direction: 'rtl',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="معدل التقدم" 
                    stroke="#C084FC" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorScore)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div id="evaluations-interactive-split" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Sidebar List of months (4 spans) */}
            <div className="lg:col-span-4 space-y-3">
              <h3 className="text-xs font-black text-purple-200 tracking-wider flex items-center gap-2 mb-2 pr-2">
                <Calendar size={14} />
                <span>سجل التقييمات الشهرية</span>
              </h3>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {evaluations.map((ev) => {
                  const isActive = expandedEvalId === ev.id;
                  const scoreBadge = getScoreBadgeStyles(ev.totalScore);
                  
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setExpandedEvalId(ev.id || null)}
                      className={cn(
                        "w-full p-4 rounded-2xl border text-right transition-all duration-300 flex items-center justify-between group active:scale-[0.99]",
                        isActive 
                          ? "bg-gradient-to-l from-purple-900/40 via-purple-950/20 to-transparent border-purple-500/40 shadow-md shadow-purple-500/5" 
                          : "bg-white/[0.01] hover:bg-white/[0.03] border-white/5 hover:border-white/10"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-inner shrink-0",
                          isActive ? "bg-purple-500/20 text-purple-300" : "bg-white/5 text-slate-400 group-hover:text-purple-300 group-hover:bg-purple-500/10"
                        )}>
                          <FileText size={18} />
                        </div>
                        <div>
                          <span className="text-white font-bold text-xs block leading-normal">
                            تقييم {formatMonthArabic(ev.month)}
                          </span>
                          <span className="text-[10px] text-white/40 block mt-0.5">
                            المقيم: {ev.evaluatedBy || 'إدارة الموارد البشرية'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-sm font-black text-white font-mono">{ev.totalScore}%</span>
                        <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded-md border", scoreBadge.bg)}>
                          {scoreBadge.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detailed Evaluation Card (8 spans) */}
            <div className="lg:col-span-8">
              {(() => {
                const selectedEval = evaluations.find(e => e.id === expandedEvalId);
                if (!selectedEval) {
                  return (
                    <div className="bg-[#1E0F33]/20 border border-white/5 p-8 rounded-2xl text-center text-slate-400 text-xs">
                      اختر شهراً فرعياً من الجانب الأيمن لاستعراض تفاصيله الدقيقة.
                    </div>
                  );
                }

                const scoreBadge = getScoreBadgeStyles(selectedEval.totalScore);

                // Sort scores keys based on user's department KPI configurations, if matched.
                // Otherwise fall back to keys in technical and soft skills.
                const scoresMap = selectedEval.scores || {};
                
                // Classify by looking up active userKpiConfig criteria list
                const configCriteria = userKpiConfig?.criteria || [];
                
                // Or if they don't have matching criteria configs, we do a fallback determination of 'HR' or 'Tech' criteria categories
                const techCriteriaCombined: { name: string; weight: number; score: number }[] = [];
                const hrCriteriaCombined: { name: string; weight: number; score: number }[] = [];

                if (configCriteria.length > 0) {
                  configCriteria.forEach(crit => {
                    const score = scoresMap[crit.name] ?? 0;
                    if (crit.category === 'Tech') {
                      techCriteriaCombined.push({ name: crit.name, weight: crit.weight, score });
                    } else {
                      hrCriteriaCombined.push({ name: crit.name, weight: crit.weight, score });
                    }
                  });
                } else {
                  // Fallback: If no configuration exists for this employee's department,
                  // we dynamically parse keys from evaluation's scores dictionary and estimate based on name cues
                  Object.entries(scoresMap).forEach(([name, val]) => {
                    // Estimate category simple keyword matching
                    const isHr = /behavior|attendance|regular|soft|سلوك|التزام|حضور|سرعة الرد|تعاون/i.test(name);
                    const weightFactor = 10; // Default weight as a helper display
                    const scoreNum = typeof val === 'number' ? val : 0;
                    if (isHr) {
                      hrCriteriaCombined.push({ name, weight: weightFactor, score: scoreNum });
                    } else {
                      techCriteriaCombined.push({ name, weight: weightFactor, score: scoreNum });
                    }
                  });
                }

                const totalTechWeight = techCriteriaCombined.reduce((sum, item) => sum + item.weight, 0);
                const totalHrWeight = hrCriteriaCombined.reduce((sum, item) => sum + item.weight, 0);

                return (
                  <div id="expanded-eval-detail-card" className="bg-gradient-to-br from-[#200B3B]/50 via-[#10041F]/70 to-[#0C021A]/70 backdrop-blur-2xl p-6 md:p-8 rounded-[2.5rem] border border-white/10 shadow-3xl">
                    
                    {/* Header of Month Info */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5 mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-[#E2B765]/10 text-[#E2B765] border border-[#E2B765]/20 flex items-center justify-center shrink-0">
                          <Activity size={22} className="animate-pulse" />
                        </div>
                        <div>
                          <h4 className="text-base font-black text-white">تفاصيل التقييم - {formatMonthArabic(selectedEval.month)}</h4>
                          <span className="text-[10px] text-white/50 block mt-0.5">
                            كود الموظف: {selectedEval.roleCode || profile?.roleCode} • تم الاعتماد في {selectedEval.createdAt ? new Date(selectedEval.createdAt.seconds * 1000).toLocaleDateString('ar-EG') : '---'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 bg-white/[0.02] border border-white/5 p-2 rounded-2xl shrink-0">
                        <div className="text-right pl-2 border-l border-white/5">
                          <span className="text-[8px] text-white/40 block leading-none font-bold mb-1">النتيجة الإجمالية</span>
                          <span className="text-base font-mono font-black text-white">{selectedEval.totalScore}%</span>
                        </div>
                        <span className={cn("text-xs font-black px-3 py-1.5 rounded-xl border shadow-inner", scoreBadge.bg)}>
                          {scoreBadge.label}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-6">
                      
                      {/* Section 1: Technical & Tasks */}
                      {techCriteriaCombined.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-xs font-black text-[#C084FC] flex items-center gap-1.5">
                              <Sparkles size={13} />
                              المعايير الفنية والمهام الخاصة بالقسم (تأثير نسبي)
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">
                              مجموع الحد الأقصى: {totalTechWeight}%
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {techCriteriaCombined.map((crit, idx) => {
                              const pct = crit.weight > 0 ? (crit.score / crit.weight) * 100 : 0;
                              return (
                                <div key={idx} className="bg-white/[0.02] p-4 rounded-2xl border border-white/[0.04] space-y-2">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-white/80 font-bold">{crit.name}</span>
                                    <span className="text-[#E2B765] font-black font-mono">
                                      {crit.score}% <span className="text-white/30 text-[9px] font-normal">من أصل {crit.weight}%</span>
                                    </span>
                                  </div>

                                  {/* Progress bar visual */}
                                  <div className="w-full bg-white/[0.04] h-2 rounded-full overflow-hidden p-[1px] border border-white/[0.03]">
                                    <div 
                                      className={cn("h-full bg-gradient-to-r rounded-full transition-all duration-500", scoreBadge.trackColor)}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>

                                  <div className="flex justify-between items-center text-[9px] text-white/30">
                                    <span>المستهدف: {crit.weight}%</span>
                                    <span>كفاءة التحصيل: {Math.round(pct)}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Section 2: General Performance and soft skills */}
                      {hrCriteriaCombined.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-xs font-black text-[#A78BFA] flex items-center gap-1.5">
                              <CheckCircle size={13} />
                              المعايير العامة والسلوك (تأثير نسبي)
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">
                              مجموع الحد الأقصى: {totalHrWeight}%
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {hrCriteriaCombined.map((crit, idx) => {
                              const pct = crit.weight > 0 ? (crit.score / crit.weight) * 100 : 0;
                              return (
                                <div key={idx} className="bg-white/[0.02] p-4 rounded-2xl border border-white/[0.04] space-y-2">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-white/80 font-bold">{crit.name}</span>
                                    <span className="text-[#E2B765] font-black font-mono">
                                      {crit.score}% <span className="text-white/30 text-[9px] font-normal">من أصل {crit.weight}%</span>
                                    </span>
                                  </div>

                                  {/* Progress bar visual */}
                                  <div className="w-full bg-white/[0.03] h-2 rounded-full overflow-hidden p-[1px] border border-white/[0.03]">
                                    <div 
                                      className={cn("h-full bg-gradient-to-r rounded-full transition-all duration-500", scoreBadge.trackColor)}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>

                                  <div className="flex justify-between items-center text-[9px] text-white/30">
                                    <span>المستهدف: {crit.weight}%</span>
                                    <span>كفاءة التحصيل: {Math.round(pct)}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Section 3: Technical and HR Appraisal Notes */}
                      {(selectedEval.techNotes || selectedEval.hrNotes) && (
                        <div className="space-y-4 pt-4 border-t border-white/5">
                          <span className="text-xs font-black text-[#E2B765] flex items-center gap-1.5 mb-2 bh-rtl">
                            <ClipboardList size={14} />
                            التوجيهات والتعليقات المكتوبة (Written Feedback)
                          </span>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedEval.techNotes && (
                              <div className="bg-gradient-to-tr from-[#200B3B]/40 to-[#c084fc]/5 p-4 rounded-2xl border border-[#c084fc]/15 space-y-2">
                                <div className="text-xs font-black text-[#C084FC] flex items-center gap-1">
                                  <span>ملاحظات الأداء الفني والمهام (Technical)</span>
                                </div>
                                <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap font-sans">
                                  {selectedEval.techNotes}
                                </p>
                              </div>
                            )}

                            {selectedEval.hrNotes && (
                              <div className="bg-gradient-to-tr from-[#200B3B]/40 to-[#7c3aed]/5 p-4 rounded-2xl border border-[#7c3aed]/15 space-y-2">
                                <div className="text-xs font-black text-[#A78BFA] flex items-center gap-1">
                                  <span>ملاحظات السلوك والأداء العام (HR)</span>
                                </div>
                                <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap font-sans">
                                  {selectedEval.hrNotes}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Info and Evaluated Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5 text-xs text-white/50">
                        <div className="flex items-center gap-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                          <User size={14} className="text-[#E2B765]" />
                          <span>سلطة التقييم المعتمدة: <strong className="text-white">{selectedEval.evaluatedBy || 'الموارد البشرية'}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                          <Clock size={14} className="text-[#C084FC]" />
                          <span>الحالة المعتمدة: <strong className="text-emerald-400">نهائي ومؤمن 🔒</strong></span>
                        </div>
                      </div>

                      {/* Edit History Log inside detail panel if present */}
                      {selectedEval.editHistory && selectedEval.editHistory.length > 0 && (
                        <div className="bg-white/[0.01] p-4 rounded-2xl border border-white/5 space-y-3">
                          <span className="text-[10px] font-black text-[#E2B765] block uppercase tracking-wider">سجل التعديلات السابقة للتقييم 履歴</span>
                          <div className="space-y-2 max-h-24 overflow-y-auto">
                            {selectedEval.editHistory.map((item, hIdx) => (
                              <div key={hIdx} className="text-[10px] text-white/40 flex justify-between border-b border-white/[0.03] pb-1.5">
                                <span>عدلّه {item.updatedBy} في {new Date(item.updatedAt).toLocaleDateString('ar-EG')}</span>
                                <span className="font-mono">الدرجة السابقة: {item.previousTotalScore}% ← الحالية: {item.newTotalScore}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
        </>
      )}

    </div>
  );
};
