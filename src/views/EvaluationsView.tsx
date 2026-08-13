import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp, 
  deleteDoc,
  updateDoc 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardList, 
  Settings, 
  Search, 
  Plus, 
  Trash2, 
  Pencil,
  Check, 
  ArrowLeft, 
  Share2, 
  User, 
  Award, 
  FileSpreadsheet, 
  Calendar,
  Layers,
  Sparkles,
  Info,
  CheckCircle,
  HelpCircle,
  FileDown,
  History,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn, isEmployeeEnabled } from '../lib/utils';
import { KPICriterion, DepartmentKPINext, EmployeeEvaluation, Employee, Settings as SettingsType } from '../types';

// Default preloaded KPIs for the 23 roles/departments provided
const DEFAULT_DEP_KPIS: Record<string, KPICriterion[]> = {
  "Account Manager": [
    { category: "Tech", name: "Renwed Cust.", weight: 15 },
    { category: "Tech", name: "Cust. Satisfaction", weight: 15 },
    { category: "Tech", name: "Upsell & Referral", weight: 10 },
    { category: "Tech", name: "Average Response Time", weight: 10 },
    { category: "Tech", name: "problem solving", weight: 10 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Tele-Sales Manager": [
    { category: "Tech", name: "Team Target Achievement", weight: 20 },
    { category: "Tech", name: "Conversion Rate Performance", weight: 15 },
    { category: "Tech", name: "Team Follow-Up Efficiency", weight: 10 },
    { category: "Tech", name: "Call Quality & Client Handling", weight: 5 },
    { category: "Tech", name: "Team Management & Monitoring", weight: 5 },
    { category: "Tech", name: "Reporting & Performance Analysis", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Sales Specialist": [
    { category: "Tech", name: "Sales Target Achievement", weight: 25 },
    { category: "Tech", name: "Conversion Rate", weight: 15 },
    { category: "Tech", name: "Follow-Up Efficiency", weight: 10 },
    { category: "Tech", name: "Client Handling Skills", weight: 5 },
    { category: "Tech", name: "Upselling Ability", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Tele-Sales Specialist": [
    { category: "Tech", name: "Call Handling Efficiency", weight: 20 },
    { category: "Tech", name: "Conversion Rate", weight: 20 },
    { category: "Tech", name: "Daily Target Achievement", weight: 10 },
    { category: "Tech", name: "Follow-Up Commitment", weight: 5 },
    { category: "Tech", name: "Client Communication Skills", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Marketing Manager": [
    { category: "Tech", name: "Marketing Strategy Performance", weight: 20 },
    { category: "Tech", name: "Campaign Results & Growth", weight: 15 },
    { category: "Tech", name: "Team Management", weight: 10 },
    { category: "Tech", name: "Brand Positioning", weight: 5 },
    { category: "Tech", name: "Budget Management", weight: 5 },
    { category: "Tech", name: "Problem Solving & Decision Making", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Chief Marketing Officer (CMO)": [
    { category: "Tech", name: "Business Growth & Revenue Performance", weight: 20 },
    { category: "Tech", name: "Marketing Strategy & Market Expansion", weight: 15 },
    { category: "Tech", name: "Department Performance Management", weight: 10 },
    { category: "Tech", name: "Brand Positioning & Development", weight: 5 },
    { category: "Tech", name: "Campaign Performance & ROI", weight: 5 },
    { category: "Tech", name: "Leadership & Decision Making", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Media Buyer": [
    { category: "Tech", name: "Campaign Performance (ROAS/Results)", weight: 25 },
    { category: "Tech", name: "Campaign Optimization", weight: 15 },
    { category: "Tech", name: "Lead Quality", weight: 10 },
    { category: "Tech", name: "Budget Management", weight: 5 },
    { category: "Tech", name: "Reporting Accuracy", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "SEO Specialist": [
    { category: "Tech", name: "Keyword Ranking Performance", weight: 20 },
    { category: "Tech", name: "Organic Traffic Growth", weight: 20 },
    { category: "Tech", name: "On-Page SEO Optimization", weight: 10 },
    { category: "Tech", name: "Technical SEO Performance", weight: 5 },
    { category: "Tech", name: "Content Optimization", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Motion Graphic Designer": [
    { category: "Tech", name: "Animation Quality", weight: 20 },
    { category: "Tech", name: "Creativity & Visual Impact", weight: 15 },
    { category: "Tech", name: "On-Time Delivery", weight: 10 },
    { category: "Tech", name: "Brand Consistency", weight: 10 },
    { category: "Tech", name: "Problem Solving & Flexibility", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "UI/UX Designer": [
    { category: "Tech", name: "User Experience Quality", weight: 20 },
    { category: "Tech", name: "User Interface Creativity", weight: 15 },
    { category: "Tech", name: "Design Usability & Responsiveness", weight: 10 },
    { category: "Tech", name: "Problem Solving", weight: 10 },
    { category: "Tech", name: "Attention to Details", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Video Editor": [
    { category: "Tech", name: "Video Quality & Creativity", weight: 20 },
    { category: "Tech", name: "Editing Accuracy & Smoothness", weight: 15 },
    { category: "Tech", name: "On-Time Delivery", weight: 10 },
    { category: "Tech", name: "Content Engagement Quality", weight: 10 },
    { category: "Tech", name: "Creative Storytelling", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Graphic Designer": [
    { category: "Tech", name: "Design Quality & Creativity", weight: 20 },
    { category: "Tech", name: "Brand Guidelines Commitment", weight: 15 },
    { category: "Tech", name: "Task Delivery On Time", weight: 10 },
    { category: "Tech", name: "Revisions & Accuracy", weight: 10 },
    { category: "Tech", name: "Creativity & Visual Problem Solving", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Operations Specialist": [
    { category: "Tech", name: "Operations Management Efficiency", weight: 20 },
    { category: "Tech", name: "Task & Workflow Organization", weight: 15 },
    { category: "Tech", name: "Problem Solving", weight: 10 },
    { category: "Tech", name: "Deadline Commitment", weight: 10 },
    { category: "Tech", name: "Team Coordination", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Accountant": [
    { category: "Tech", name: "Financial Accuracy", weight: 20 },
    { category: "Tech", name: "Reporting & Documentation", weight: 15 },
    { category: "Tech", name: "Invoice & Payment Management", weight: 10 },
    { category: "Tech", name: "Attention to Details", weight: 10 },
    { category: "Tech", name: "Deadline Commitmen", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Social Media Specialist": [
    { category: "Tech", name: "Content Performance & Engagement", weight: 20 },
    { category: "Tech", name: "Content Planning & Consistency", weight: 15 },
    { category: "Tech", name: "Audience Interaction", weight: 10 },
    { category: "Tech", name: "Creativity & Trend Awareness", weight: 10 },
    { category: "Tech", name: "Brand Voice Commitment", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Social Media Manager": [
    { category: "Tech", name: "Content Performance & Engagement", weight: 20 },
    { category: "Tech", name: "Content Strategy & Planning", weight: 15 },
    { category: "Tech", name: "Team Coordination", weight: 10 },
    { category: "Tech", name: "Brand Identity Commitment", weight: 10 },
    { category: "Tech", name: "Trend Monitoring & Creativity", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "HR": [
    { category: "Tech", name: "Recruitment & Hiring Efficiency", weight: 20 },
    { category: "Tech", name: "Employee Relations & Support", weight: 15 },
    { category: "Tech", name: "Attendance & HR Documentation Management", weight: 10 },
    { category: "Tech", name: "Problem Solving & Conflict Handling", weight: 10 },
    { category: "Tech", name: "HR Operations Coordination", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Creative Team Manager": [
    { category: "Tech", name: "Creative Team Manager", weight: 20 },
    { category: "Tech", name: "Customer Satisfaction", weight: 15 },
    { category: "Tech", name: "Team Performance Management", weight: 10 },
    { category: "Tech", name: "Upselling & Revenue Growth", weight: 10 },
    { category: "Tech", name: "Problem Solving & Escalation Handling", weight: 5 },
    { category: "Tech", name: "Reporting & Performance Analysis", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Account Management Head": [
    { category: "Tech", name: "Client Retention & Growth", weight: 20 },
    { category: "Tech", name: "Customer Satisfaction", weight: 15 },
    { category: "Tech", name: "Team Performance Management", weight: 10 },
    { category: "Tech", name: "Upselling & Revenue Growth", weight: 10 },
    { category: "Tech", name: "Problem Solving & Escalation Handling", weight: 5 },
    { category: "Tech", name: "Reporting & Performance Analysis", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "SEO Manager": [
    { category: "Tech", name: "SEO Strategy Performance", weight: 20 },
    { category: "Tech", name: "Organic Traffic Growth", weight: 15 },
    { category: "Tech", name: "Team Management", weight: 10 },
    { category: "Tech", name: "Technical SEO Oversight", weight: 10 },
    { category: "Tech", name: "Reporting & Analysis", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Media Buying Manager": [
    { category: "Tech", name: "Campaign Performance (ROAS/Results)", weight: 20 },
    { category: "Tech", name: "Team Performance Management", weight: 15 },
    { category: "Tech", name: "Campaign Optimization", weight: 10 },
    { category: "Tech", name: "Budget Management", weight: 10 },
    { category: "Tech", name: "Reporting & Analysis", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Content Creator": [
    { category: "Tech", name: "Content Creativity & Quality", weight: 20 },
    { category: "Tech", name: "Content Engagement Performance", weight: 15 },
    { category: "Tech", name: "Content Planning & Consistency", weight: 10 },
    { category: "Tech", name: "Brand Identity Commitment", weight: 5 },
    { category: "Tech", name: "Trend Awareness & Content Ideas", weight: 5 },
    { category: "Tech", name: "Content Delivery Commitment", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ],
  "Programmer / Software Developer": [
    { category: "Tech", name: "Code Quality & Efficiency", weight: 20 },
    { category: "Tech", name: "Task Completion & Delivery", weight: 15 },
    { category: "Tech", name: "Problem Solving & Debugging", weight: 10 },
    { category: "Tech", name: "System Performance & Optimization", weight: 5 },
    { category: "Tech", name: "Code Maintenance & Documentation", weight: 5 },
    { category: "Tech", name: "Technical Collaboration", weight: 5 },
    { category: "HR", name: "Internal Communication Efficiency", weight: 15 },
    { category: "HR", name: "Attendance & Commitment", weight: 15 },
    { category: "HR", name: "Leadership ", weight: 10 }
  ]
};

export const EvaluationsView: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  
  // Tabs
  const [subTab, setSubTab] = useState<'all' | 'form' | 'kpis' | 'permissions'>('all');
  
  // Realtime Data from Firestore
  const [systemSettings, setSystemSettings] = useState<SettingsType | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [kpiConfigs, setKpiConfigs] = useState<DepartmentKPINext[]>([]);
  const [kpiEvaluations, setKpiEvaluations] = useState<EmployeeEvaluation[]>([]);
  
  // Separate loading states for each primary data source
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [evaluationsLoading, setEvaluationsLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  
  // The overall loading state is true only if ANY of the sources are still loading.
  const loading = employeesLoading || configsLoading || evaluationsLoading || settingsLoading;

  // Set default formDept and deptFilter for department leaders
  useEffect(() => {
    if (!isAdmin && profile?.department) {
      setFormDept(profile.department);
      setDeptFilter(profile.department);
    }
  }, [profile?.department, isAdmin]);

  // Filters for historical view
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');

  // Evaluation Form state (accessible by managers)
  const [formDept, setFormDept] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formMonth, setFormMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [formScores, setFormScores] = useState<Record<string, number>>({});
  const [formTechNotes, setFormTechNotes] = useState('');
  const [formHrNotes, setFormHrNotes] = useState('');
  const [formShowToEmployee, setFormShowToEmployee] = useState(true);
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(null);
  const [viewingHistoryEvaluation, setViewingHistoryEvaluation] = useState<EmployeeEvaluation | null>(null);

  // KPI Settings states
  const [editingDept, setEditingDept] = useState('');
  const [editingCriteria, setEditingCriteria] = useState<KPICriterion[]>([]);

  // Batch paste / Sheet Upload simulator state
  const [pastedSheetData, setPastedSheetData] = useState('');
  const [showSheetUploader, setShowSheetUploader] = useState(false);

  // Permissions settings states
  const [isOpenDropdown, setIsOpenDropdown] = useState(false);
  const [searchEmpPerm, setSearchEmpPerm] = useState('');

  // Toggle evaluations visibility/access settings for selected employees
  const handleToggleAccess = async (empId: string) => {
    if (!systemSettings) return;
    const currentAccess = systemSettings.evaluationAccess || [];
    let updatedAccess: string[];
    if (currentAccess.includes(empId)) {
      updatedAccess = currentAccess.filter(id => id !== empId);
    } else {
      updatedAccess = [...currentAccess, empId];
    }
    
    try {
      await setDoc(doc(db, 'settings', 'system_config'), {
        ...systemSettings,
        evaluationAccess: updatedAccess
      });
      playChime(true);
      toast.success("تم تحديث صلاحيات الوصول للتقييمات بنجاح");
    } catch (e: any) {
      playChime(false);
      toast.error("حدث خطأ أثناء حفظ الصلاحيات");
    }
  };

  // Toggle specific department access for a selected employee
  const handleToggleDeptAccess = async (empId: string, dept: string) => {
    if (!systemSettings) return;
    const currentDeptsMap = systemSettings.evaluationAccessDepts || {};
    const empDepts = currentDeptsMap[empId] || [];
    let updatedEmpsDepts: string[];
    if (empDepts.includes(dept)) {
      updatedEmpsDepts = empDepts.filter(d => d !== dept);
    } else {
      updatedEmpsDepts = [...empDepts, dept];
    }
    
    try {
      await setDoc(doc(db, 'settings', 'system_config'), {
        ...systemSettings,
        evaluationAccessDepts: {
          ...currentDeptsMap,
          [empId]: updatedEmpsDepts
        }
      });
      playChime(true);
      toast.success(`تم تحديث الأقسام المصرح بها للموظف بنجاح`);
    } catch (e: any) {
      playChime(false);
      toast.error("حدث خطأ أثناء حفظ صلاحية الأقسام");
    }
  };

  const filteredEmployeesForPerm = React.useMemo(() => {
    if (!searchEmpPerm) return employees;
    return employees.filter(e => 
      e.fullName.toLowerCase().includes(searchEmpPerm.toLowerCase()) ||
      e.jobTitle.toLowerCase().includes(searchEmpPerm.toLowerCase()) ||
      (e.department && e.department.toLowerCase().includes(searchEmpPerm.toLowerCase()))
    );
  }, [employees, searchEmpPerm]);

  // Audio chimes
  const playChime = (isSuccess = true) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(isSuccess ? 523.25 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
  };

  // Effect 1: Fetch employees
  useEffect(() => {
    setEmployeesLoading(true);
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      const list: Employee[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Employee);
      });
      setEmployees(list.filter(e => e.status !== 'deleted'));
      setEmployeesLoading(false);
    }, (error) => {
      console.error("Error fetching employees:", error);
      setEmployeesLoading(false);
    });
    return () => unsubEmployees();
  }, []);

  // Effect 2: Fetch customized KPI settings per department
  useEffect(() => {
    setConfigsLoading(true);
    const unsubConfigs = onSnapshot(collection(db, 'kpiConfigs'), (snap) => {
      const list: DepartmentKPINext[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as DepartmentKPINext);
      });
      setKpiConfigs(list);
      setConfigsLoading(false);
    }, (error) => {
      console.error("Error fetching KPI configs:", error);
      setConfigsLoading(false);
    });
    return () => unsubConfigs();
  }, []);

  // Effect 3: Fetch past evaluations
  useEffect(() => {
    setEvaluationsLoading(true);
    const unsubEvaluations = onSnapshot(
      query(collection(db, 'kpiEvaluations'), orderBy('createdAt', 'desc')), 
      (snap) => {
        const list: EmployeeEvaluation[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as EmployeeEvaluation);
        });
        setKpiEvaluations(list);
        setEvaluationsLoading(false);
      }, (error) => {
        console.error("Error fetching evaluations:", error);
        setEvaluationsLoading(false);
      });
    return () => unsubEvaluations();
  }, []);

  // Effect 4: Fetch system settings
  useEffect(() => {
    setSettingsLoading(true);
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system_config'), (snap) => {
      if (snap.exists()) {
        setSystemSettings(snap.data() as SettingsType);
      }
      setSettingsLoading(false);
    }, (error) => {
      console.error("Error fetching system settings:", error);
      setSettingsLoading(false);
    });
    return () => unsubSettings();
  }, []);

  // Sync Form criteria when Department changes
  const activeKpiSubset = React.useMemo(() => {
    if (!formDept) return [];
    const custom = kpiConfigs.find(c => c.departmentName === formDept);
    if (custom) return custom.criteria;
    return DEFAULT_DEP_KPIS[formDept] || DEFAULT_DEP_KPIS["Account Manager"];
  }, [formDept, kpiConfigs]);

  useEffect(() => {
    if (activeKpiSubset.length > 0) {
      if (editingEvaluationId) return;
      const initialScores: Record<string, number> = {};
      activeKpiSubset.forEach(crit => {
        initialScores[crit.name] = 0;
      });
      setFormScores(initialScores);
    }
  }, [activeKpiSubset, editingEvaluationId]);

  // Compute live weighted score out of 100 for current input scores
  const formTotalPercentage = React.useMemo(() => {
    if (activeKpiSubset.length === 0) return 0;
    let sumWeight = 0;
    let weightedPoints = 0;
    activeKpiSubset.forEach(crit => {
      const val = formScores[crit.name] || 0;
      weightedPoints += val;
      sumWeight += crit.weight;
    });
    return sumWeight > 0 ? Math.round((weightedPoints / sumWeight) * 100) : 0;
  }, [formScores, activeKpiSubset]);

  // Debugging log to trace loading states
  console.log({
    employeesLoading,
    configsLoading,
    evaluationsLoading,
    settingsLoading,
  });
  // Save/Edit KPI standards per department
  const startEditingKpis = (deptName: string) => {
    setEditingDept(deptName);
    const existingConfig = kpiConfigs.find(c => c.departmentName === deptName);
    if (existingConfig) {
      setEditingCriteria([...existingConfig.criteria]);
    } else if (DEFAULT_DEP_KPIS[deptName]) {
      setEditingCriteria([...DEFAULT_DEP_KPIS[deptName]]);
    } else {
      setEditingCriteria([
        { category: 'Tech', name: 'جودة العمل الأساسي', weight: 60 },
        { category: 'HR', name: 'الالتزام والتعاون', weight: 40 }
      ]);
    }
  };

  const handleAddCriterion = () => {
    setEditingCriteria(prev => [
      ...prev,
      { category: 'Tech', name: `معيار جديد ${prev.length + 1}`, weight: 10 }
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    setEditingCriteria(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateCriterion = (index: number, fields: Partial<KPICriterion>) => {
    setEditingCriteria(prev => prev.map((crit, idx) => {
      if (idx === index) {
        return { ...crit, ...fields };
      }
      return crit;
    }));
  };

  const saveKpiSettings = async () => {
    if (!editingDept) return;
    
    // Check total weight is exactly 100
    const totalWeight = editingCriteria.reduce((acc, curr) => acc + curr.weight, 0);
    if (totalWeight !== 100) {
      playChime(false);
      toast.error(`خطأ: مجموع الأوزان يجب أن يكون 100% تقريباً (المجموع الحالي: ${totalWeight}%)`, {
        style: { background: '#881337', color: '#fff', direction: 'rtl' }
      });
      return;
    }

    try {
      // Use departmentName as doc ID or clean form
      const docId = editingDept.replace(/\//g, '-');
      await setDoc(doc(db, 'kpiConfigs', docId), {
        departmentName: editingDept,
        criteria: editingCriteria,
        updatedAt: serverTimestamp()
      });
      playChime(true);
      toast.success(`تم حفظ وتحديث نظام الـ KPIs لقسم ${editingDept} بنجاح!`, {
        style: { background: '#1E0F33', border: '1px solid #E2B765', color: '#fff', direction: 'rtl' }
      });
      setEditingDept('');
    } catch (err: any) {
      toast.error(`حدث خطأ أثناء حفظ الإعدادات: ${err.message}`, {
        style: { direction: 'rtl' }
      });
    }
  };

  // Submit new employee evaluation from the Dynamic Form
  const handleSubmitEvaluation = async () => {
    if (!formEmployeeId) {
      toast.error('فضلاً اختر اسم الموظف المراد تقييمه', { style: { direction: 'rtl' } });
      return;
    }
    if (!formDept) {
      toast.error('فضلاً اختر القسم المدار', { style: { direction: 'rtl' } });
      return;
    }

    const employeeObj = employees.find(e => e.id === formEmployeeId);
    if (!employeeObj) return;

    try {
      const evaluationPayload: any = {
        employeeId: formEmployeeId,
        employeeName: employeeObj.fullName,
        roleCode: employeeObj.roleCode,
        department: formDept,
        jobTitle: employeeObj.jobTitle,
        month: formMonth,
        scores: formScores,
        totalScore: formTotalPercentage,
        status: 'Done',
        techNotes: formTechNotes,
        hrNotes: formHrNotes,
        showToEmployee: formShowToEmployee,
        updatedAt: serverTimestamp()
      };

      if (editingEvaluationId) {
        // Edit mode: update existing document and record history log
        const existingDoc = kpiEvaluations.find(e => e.id === editingEvaluationId);
        const previousHistory = existingDoc?.editHistory || [];
        
        const logItem = {
          updatedBy: profile?.fullName || profile?.email || 'Admin',
          updatedByUid: auth.currentUser?.uid || '',
          updatedAt: new Date().toISOString(),
          previousScores: existingDoc?.scores || {},
          previousTotalScore: existingDoc?.totalScore || 0,
          newScores: formScores,
          newTotalScore: formTotalPercentage
        };

        const docRef = doc(db, 'kpiEvaluations', editingEvaluationId);
        await updateDoc(docRef, {
          ...evaluationPayload,
          editHistory: [logItem, ...previousHistory]
        });
        playChime(true);
        toast.success(`تم تحديث تقييم الموظف (${employeeObj.fullName}) لسنوات/شهر ${formMonth} بنجاح! 🟢`, {
          style: { background: '#12071F', border: '1px solid #7C3AED', color: '#fff', direction: 'rtl' }
        });
      } else {
        // Live mode: create a new evaluation
        const payloadToCreate = {
          ...evaluationPayload,
          evaluatedBy: profile?.fullName || profile?.email || 'Admin',
          evaluatedByUid: auth.currentUser?.uid || '',
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'kpiEvaluations'), payloadToCreate);
        playChime(true);
        toast.success(`تم تسجيل تقييم الموظف (${employeeObj.fullName}) لسنوات/شهر ${formMonth} بنجاح! 🟢`, {
          style: { background: '#12071F', border: '1px solid #7C3AED', color: '#fff', direction: 'rtl' }
        });
      }
      
      // Reset form selection and edit mode state
      setFormEmployeeId('');
      setFormTechNotes('');
      setFormHrNotes('');
      setFormShowToEmployee(true);
      setEditingEvaluationId(null);
      setSubTab('all');
    } catch (err: any) {
      toast.error(`حدث خطأ أثناء حفظ التقييم: ${err.message}`, {
        style: { direction: 'rtl' }
      });
    }
  };

  // Start editing evaluation record
  const handleStartEditEvaluation = (evaluation: EmployeeEvaluation) => {
    setEditingEvaluationId(evaluation.id || null);
    setFormDept(evaluation.department);
    setFormEmployeeId(evaluation.employeeId);
    setFormMonth(evaluation.month);
    setFormScores(evaluation.scores || {});
    setFormTechNotes(evaluation.techNotes || '');
    setFormHrNotes(evaluation.hrNotes || '');
    setFormShowToEmployee(evaluation.showToEmployee ?? true);
    setSubTab('form');
    
    toast.success(`تم تحميل بيانات تقييم الموظف (${evaluation.employeeName}) للتعديل 🛠️`, {
      style: { background: '#12071F', border: '1px solid #E2B765', color: '#fff', direction: 'rtl' }
    });
  };

  const canEditEvaluation = (ev: EmployeeEvaluation) => {
    if (isAdmin) return true;
    if (ev.evaluatedByUid === auth.currentUser?.uid) return true;
    if (userAllowedDepts && ev.department && userAllowedDepts.includes(ev.department)) return true;
    return false;
  };

  const canDeleteEvaluation = (ev: EmployeeEvaluation) => {
    return isAdmin;
  };

  // Delete evaluation record
  const handleDeleteEvaluation = async (evalId: string) => {
    if (!isAdmin) {
      toast.error('عذراً، هذه الصلاحية للمدراء والمسؤولين فقط', { style: { direction: 'rtl' } });
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا التقييم نهائياً؟')) return;

    try {
      await deleteDoc(doc(db, 'kpiEvaluations', evalId));
      playChime(true);
      toast.success('تم حذف سجل التقييم بنجاح', { style: { direction: 'rtl' } });
    } catch (err: any) {
      toast.error(err.message, { style: { direction: 'rtl' } });
    }
  };

  // Simulate spreadsheet parser
  const handleImportSheetData = async () => {
    if (!pastedSheetData.trim()) {
      toast.error('يرجى لصق بيانات الشيت أولاً', { style: { direction: 'rtl' } });
      return;
    }

    try {
      const rows = pastedSheetData.split('\n');
      let successCount = 0;
      
      for (const row of rows) {
        if (!row.trim()) continue;
        const cols = row.split(/,|\t/); // handle csv or tab delimited
        if (cols.length < 3) continue;

        // Try mapping to an active employee
        const candidateNameOrCode = cols[0].trim();
        const scoreVal = parseFloat(cols[cols.length - 1].replace('%', '').trim());
        const matchedEmp = employees.find(e => {
          const isMatch = e.fullName.includes(candidateNameOrCode) || 
            e.roleCode.toLowerCase() === candidateNameOrCode.toLowerCase();
          if (!isMatch) return false;
          // Security filter: If not admin, restrict matching to their assigned department only
          if (!isAdmin && profile?.department) {
            return e.department === profile.department;
          }
          return true;
        });

        if (matchedEmp && !isNaN(scoreVal)) {
          // Add evaluation directly
          await addDoc(collection(db, 'kpiEvaluations'), {
            employeeId: matchedEmp.id,
            employeeName: matchedEmp.fullName,
            roleCode: matchedEmp.roleCode,
            department: matchedEmp.department || 'General',
            jobTitle: matchedEmp.jobTitle || 'Staff',
            month: formMonth,
            scores: { "التقييم الشامل المرفوع من الشيت": scoreVal },
            totalScore: scoreVal,
            evaluatedBy: `شيت شيرد (${profile?.fullName || 'مسؤول'})`,
            evaluatedByUid: auth.currentUser?.uid || '',
            createdAt: serverTimestamp(),
            status: 'Done'
          });
          successCount++;
        }
      }

      playChime(true);
      toast.success(`تم استيراد وتقييم ${successCount} موظف بنجاح من الشيت!`, {
        style: { background: '#12071F', border: '1px solid #E2B765', color: '#fff', direction: 'rtl' }
      });
      setPastedSheetData('');
      setShowSheetUploader(false);
    } catch (err: any) {
      toast.error(`خطأ أثناء القراءة: ${err.message}`, { style: { direction: 'rtl' } });
    }
  };

  // Allowed departments for non-admins (own department + extra departments granted)
  const userAllowedDepts = React.useMemo(() => {
    if (isAdmin) return null;
    const list: string[] = [];
    if (profile?.department) {
      list.push(profile.department);
    }
    if (profile?.id && systemSettings?.evaluationAccessDepts?.[profile.id]) {
      const extraDepts = systemSettings.evaluationAccessDepts[profile.id];
      extraDepts.forEach(d => {
        if (!list.includes(d)) list.push(d);
      });
    }
    return list;
  }, [isAdmin, profile, systemSettings?.evaluationAccessDepts]);

  // List of active departments from company settings, fallback to standard defaults if settings are not loaded yet
  const allAvailableDepartments = React.useMemo(() => {
    if (userAllowedDepts) {
      return userAllowedDepts;
    }
    if (systemSettings?.departments && systemSettings.departments.length > 0) {
      return systemSettings.departments;
    }
    const depts = new Set<string>();
    employees.forEach(e => {
      if (e.department) depts.add(e.department);
    });
    Object.keys(DEFAULT_DEP_KPIS).forEach(d => depts.add(d));
    return Array.from(depts);
  }, [employees, systemSettings, userAllowedDepts]);

  // Unique months in evaluations
  const availableMonths = React.useMemo(() => {
    const months = new Set<string>();
    kpiEvaluations.forEach(ev => {
      if (ev.month) months.add(ev.month);
    });
    // add current month
    const d = new Date();
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    return Array.from(months).sort().reverse();
  }, [kpiEvaluations]);

  // Calculate department averages
  const departmentAverages = React.useMemo(() => {
    const deptData: Record<string, { total: number; count: number }> = {};
    
    // Initialize with all available departments
    allAvailableDepartments.forEach(dept => {
      deptData[dept] = { total: 0, count: 0 };
    });

    kpiEvaluations.forEach(ev => {
      const dept = ev.department;
      if (dept) {
        if (!deptData[dept]) {
          deptData[dept] = { total: 0, count: 0 };
        }
        deptData[dept].total += ev.totalScore;
        deptData[dept].count += 1;
      }
    });

    return Object.entries(deptData).map(([name, data]) => {
      const average = data.count > 0 ? Math.round(data.total / data.count) : 0;
      return {
        name,
        average,
        count: data.count
      };
    }).sort((a, b) => b.average - a.average);
  }, [allAvailableDepartments, kpiEvaluations]);

  // Filtered past evaluations
  const filteredEvaluations = React.useMemo(() => {
    return kpiEvaluations.filter(ev => {
      // Access security control: If not admin, restrict only to their allowed departments
      if (userAllowedDepts) {
        if (!ev.department || !userAllowedDepts.includes(ev.department)) return false;
      }
      const matchesSearch = !searchQuery ? true : (
        ev.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.roleCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.jobTitle.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      const matchesDept = deptFilter === 'all' ? true : ev.department === deptFilter;
      const matchesMonth = monthFilter === 'all' ? true : ev.month === monthFilter;
      return matchesSearch && matchesDept && matchesMonth;
    });
  }, [kpiEvaluations, searchQuery, deptFilter, monthFilter, userAllowedDepts]);

  // Helpers for rating performance styling
  const getScoreColorClass = (score: number) => {
    if (score >= 90) return 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20';
    if (score >= 75) return 'text-[#C084FC] bg-[#C084FC]/10 border-[#C084FC]/20';
    if (score >= 50) return 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20';
    return 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20';
  };

  const getScoreBadgeText = (score: number) => {
    if (score >= 90) return 'ممتاز 🏆';
    if (score >= 75) return 'جيد جداً ⭐';
    if (score >= 50) return 'مقبول ⚠️';
    return 'ضعيف 🚨';
  };

  const hasAccess = isAdmin || (profile?.id && systemSettings?.evaluationAccess?.includes(profile.id));

  if (!hasAccess && !loading) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-[#1E0F33]/85 backdrop-blur-2xl p-10 rounded-[3rem] border border-red-500/20 shadow-2xl text-center" dir="rtl">
        <div className="w-20 h-20 bg-[#EF4444]/15 rounded-[2.2rem] flex items-center justify-center text-[#EF4444] border border-[#EF4444]/20 shadow-xl mx-auto mb-8">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0-8v4m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h2 className="text-2xl font-black text-white mb-2">عذراً، غير مسموح بالدخول</h2>
        <p className="text-[#A78BFA] text-sm leading-relaxed mb-6">
          يرجى العلم أنك لا تملك صلاحية الوصول لصفحة ومؤشرات تقييمات الموظفين والـ KPIs حالياً.
        </p>

        <div className="p-5 bg-white/5 border border-white/5 rounded-2xl text-[#E0E7FF] text-xs font-semibold leading-relaxed">
          يتطلب هذا القسم صلاحيات إدارية خاصة أو تصريح صريح من الإدارة التنفيذية أو مدير موارد بشرية (HR).
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none max-w-7xl mx-auto p-4 md:p-6" dir="rtl">
      
      {/* Top Banner Widget */}
      <div className="bg-gradient-to-br from-[#200B3B]/80 via-[#140627]/90 to-[#0A0216]/95 p-8 rounded-[2.5rem] border border-white/10 shadow-3xl shadow-purple-500/5 relative overflow-hidden backdrop-blur-2xl">
        <div className="absolute -top-12 -left-12 w-80 h-80 bg-purple-600/20 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-96 h-96 bg-[#E2B765]/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-pink-500/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="relative flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 z-10 w-full">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-gradient-to-r from-[#E2B765]/20 to-amber-500/10 text-[#E2B765] border border-[#E2B765]/30 text-[10px] font-mono font-black uppercase px-3.5 py-1.5 rounded-full tracking-wider shadow-inner backdrop-blur-md">
                مؤشرات الأداء KPI 📊
              </span>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-500"></span>
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-purple-200">
              تقييمات الأداء والـ KPIs الشاملة
            </h1>
            <p className="text-[#BCA5FF] text-xs md:text-sm mt-2 max-w-2xl leading-relaxed">
              النظام المركزي الموحد لإدارة وقياس أداء الموظفين ومعايير الـ KPIs لجميع أقسام الشركة والتفاعل في الوقت الفعلي مع المديرين لإدراج التقييمات الشهرية.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 w-full xl:w-auto xl:justify-end">
            <button
              onClick={() => setSubTab('all')}
              className={cn(
                "px-5 py-3.5 rounded-2xl text-xs font-black transition-all duration-300 flex items-center gap-2 active:scale-[0.98] border shadow-sm",
                subTab === 'all' 
                  ? "bg-gradient-to-r from-[#E2B765] via-amber-400 to-[#E2B765] text-black border-white/20 shadow-lg shadow-amber-500/20" 
                  : "bg-white/[0.03] text-[#D3C4FF] border-white/10 hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-white backdrop-blur-md"
              )}
            >
              <ClipboardList size={16} />
              سجل التقييمات التاريخي
            </button>
            
            <button
              onClick={() => setSubTab('form')}
              className={cn(
                "px-5 py-3.5 rounded-2xl text-xs font-black transition-all duration-300 flex items-center gap-2 active:scale-[0.98] border shadow-sm",
                subTab === 'form' 
                  ? "bg-gradient-to-r from-[#E2B765] via-amber-400 to-[#E2B765] text-black border-white/20 shadow-lg shadow-amber-500/20" 
                  : "bg-gradient-to-r from-purple-500/15 to-indigo-500/10 text-purple-200 border-purple-500/25 hover:border-purple-500/50 hover:from-purple-500/25 hover:to-indigo-500/20 hover:text-white backdrop-blur-md"
              )}
            >
              <Plus size={16} />
              استمارة تقييم سريع (للمديرين)
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setSubTab('kpis')}
                  className={cn(
                    "px-5 py-3.5 rounded-2xl text-xs font-black transition-all duration-300 flex items-center gap-2 active:scale-[0.98] border shadow-sm",
                    subTab === 'kpis' 
                      ? "bg-gradient-to-r from-[#E2B765] via-amber-400 to-[#E2B765] text-black border-white/20 shadow-lg shadow-amber-500/20" 
                      : "bg-white/[0.03] text-[#D3C4FF] border-white/10 hover:border-pink-500/30 hover:bg-pink-500/10 hover:text-white backdrop-blur-md"
                  )}
                >
                  <Settings size={16} />
                  تعديل وتخصيص معايير KPIs
                </button>

                <button
                  onClick={() => setSubTab('permissions')}
                  className={cn(
                    "px-5 py-3.5 rounded-2xl text-xs font-black transition-all duration-300 flex items-center gap-2 active:scale-[0.98] border shadow-sm",
                    subTab === 'permissions' 
                      ? "bg-gradient-to-r from-[#E2B765] via-amber-400 to-[#E2B765] text-black border-white/20 shadow-lg shadow-amber-500/20" 
                      : "bg-white/[0.03] text-[#D3C4FF] border-white/10 hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-white backdrop-blur-md"
                  )}
                >
                  <User size={16} />
                  صلاحيات الوصول للتقييمات
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-12 h-12 border-4 border-[#7C3AED]/20 border-t-[#C084FC] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#A78BFA]">جاري جلب بيانات وتقارير الـ KPIs...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {subTab === 'all' && (
            <motion.div
              key="all"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              
              {/* Stat Boxes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#1E0F33]/80 border border-[#7C3AED]/15 p-5 rounded-3xl flex items-center justify-between">
                  <div>
                    <span className="text-[#A78BFA] text-[10px] uppercase font-bold tracking-widest block">إجمالي التقييمات المسجلة</span>
                    <span className="text-3xl font-black text-white mt-1 block">{kpiEvaluations.length}</span>
                  </div>
                  <div className="h-12 w-12 bg-[#7C3AED]/10 rounded-2xl flex items-center justify-center text-[#C084FC]">
                    <ClipboardList size={22} />
                  </div>
                </div>

                <div className="bg-[#1E0F33]/80 border border-[#7C3AED]/15 p-5 rounded-3xl flex items-center justify-between">
                  <div>
                    <span className="text-[#A78BFA] text-[10px] uppercase font-bold tracking-widest block">متوسط نتيجة الشركة</span>
                    <span className="text-3xl font-black text-[#E2B765] mt-1 block">
                      {kpiEvaluations.length > 0 
                        ? `${Math.round(kpiEvaluations.reduce((acc, curr) => acc + curr.totalScore, 0) / kpiEvaluations.length)}%`
                        : '---'}
                    </span>
                  </div>
                  <div className="h-12 w-12 bg-[#E2B765]/10 rounded-2xl flex items-center justify-center text-[#E2B765]">
                    <Award size={22} />
                  </div>
                </div>

                <div className="bg-[#1E0F33]/80 border border-[#7C3AED]/15 p-5 rounded-3xl flex items-center justify-between">
                  <div>
                    <span className="text-[#A78BFA] text-[10px] uppercase font-bold tracking-widest block">الأقسام المميزة تفاعلياً</span>
                    <span className="text-3xl font-black text-white mt-1 block">
                      {allAvailableDepartments.length} أقسام
                    </span>
                  </div>
                  <div className="h-12 w-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400">
                    <Layers size={22} />
                  </div>
                </div>
              </div>

              {/* Department Averages Section */}
              <div className="bg-gradient-to-br from-[#200B3B]/60 via-[#10041F]/80 to-[#0C021A]/90 p-6 rounded-[2.5rem] border border-white/10 shadow-3xl shadow-purple-500/5 relative overflow-hidden backdrop-blur-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/5 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/5 rounded-full blur-[80px] pointer-events-none" />
                
                <div className="relative flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400">
                      <Layers size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">متوسط أداء الأقسام</h3>
                      <p className="text-[10px] text-[#A78BFA] mt-0.5">معدل تقييمات الـ KPIs التراكمي لكل قسم بنظام النقاط</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full font-bold">
                    لوحة تحليلات الأقسام 📊
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {departmentAverages.map((dept, idx) => {
                    let colorClass = "from-rose-500 to-red-500";
                    let bgLight = "bg-rose-500/10";
                    let textClass = "text-rose-400";
                    let borderClass = "border-rose-500/20";
                    let glowClass = "group-hover:shadow-rose-500/10";
                    
                    if (dept.average >= 85) {
                      colorClass = "from-emerald-500 via-teal-400 to-emerald-400";
                      bgLight = "bg-emerald-500/10";
                      textClass = "text-emerald-400";
                      borderClass = "border-emerald-500/20";
                      glowClass = "group-hover:shadow-emerald-500/10";
                    } else if (dept.average >= 70) {
                      colorClass = "from-amber-400 to-[#E2B765]";
                      bgLight = "bg-amber-500/10";
                      textClass = "text-amber-400";
                      borderClass = "border-[#E2B765]/20";
                      glowClass = "group-hover:shadow-amber-500/10";
                    } else if (dept.average > 0) {
                      colorClass = "from-orange-500 to-amber-500";
                      bgLight = "bg-orange-500/10";
                      textClass = "text-orange-400";
                      borderClass = "border-orange-500/15";
                      glowClass = "group-hover:shadow-orange-500/10";
                    } else {
                      colorClass = "from-white/10 to-white/5";
                      bgLight = "bg-white/[0.02]";
                      textClass = "text-white/30";
                      borderClass = "border-white/5";
                      glowClass = "shadow-none";
                    }

                    return (
                      <div 
                        key={dept.name} 
                        className={cn(
                          "p-4 rounded-3xl border bg-white/[0.01] hover:bg-white/[0.03] flex flex-col justify-between transition-all duration-300 relative group overflow-hidden shadow-md",
                          borderClass,
                          glowClass
                        )}
                      >
                        {/* Decorative background glow for active departments */}
                        {dept.count > 0 && (
                          <div className={cn("absolute -bottom-10 -left-10 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr", colorClass)} />
                        )}

                        <div className="flex justify-between items-start gap-2 mb-3 relative z-10">
                          <span className="text-white/85 text-xs font-black truncate max-w-[130px]" title={dept.name}>
                            {dept.name}
                          </span>
                          <span className={cn("text-xs font-mono font-black py-0.5 px-2.5 rounded-xl border border-white/5 shadow-inner", bgLight, textClass)}>
                            {dept.count > 0 ? `${dept.average}%` : "---"}
                          </span>
                        </div>

                        <div className="space-y-2 w-full relative z-10">
                          {/* Outer progress track */}
                          <div className="w-full bg-white/[0.04] h-2 rounded-full overflow-hidden p-[1px] border border-white/[0.03]">
                            <div 
                              className={cn("h-full bg-gradient-to-r rounded-full transition-all duration-700 ease-out", colorClass)}
                              style={{ width: `${dept.count > 0 ? dept.average : 0}%` }}
                            />
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] text-white/45">
                            <span className="font-bold">{dept.count} {dept.count === 1 ? 'تقييم' : (dept.count >= 3 && dept.count <= 10 ? 'تقييمات' : 'تقييم')}</span>
                            {dept.count > 0 ? (
                              <span className={cn("font-medium text-[9px] px-1.5 py-0.5 rounded-md", bgLight, textClass)}>
                                {dept.average >= 85 ? 'ممتاز 🟢' : (dept.average >= 70 ? 'جيد جداً 🟡' : 'يحتاج تطوير 🔴')}
                              </span>
                            ) : (
                              <span className="text-[8px] opacity-60">لا توجد تقييمات</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Filters & Actions Bar */}
              <div className="bg-gradient-to-r from-[#200B3B]/40 via-[#10041F]/60 to-[#0C021A]/50 backdrop-blur-xl p-4 md:p-5 rounded-3xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl shadow-purple-900/5">
                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  
                  {/* Search */}
                  <div className="relative flex-1 md:flex-initial min-w-[220px]">
                    <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input 
                      type="text" 
                      placeholder="ابحث باسم الموظف أو الكود..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/10 text-white placeholder-white/35 text-xs px-10 py-3 rounded-2xl focus:border-purple-500/50 focus:bg-[#12071F]/50 focus:outline-none transition-all duration-300"
                    />
                  </div>

                  {/* Department Filter */}
                  <div className="relative">
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="bg-white/[0.03] text-white border border-white/10 text-xs px-4 py-3 rounded-2xl focus:border-purple-500/55 focus:bg-[#12071F]/90 focus:ring-0 focus:outline-none transition-all duration-300"
                    >
                      <option value="all">كل الأقسام</option>
                      {allAvailableDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>

                  {/* Month Filter */}
                  <div className="relative">
                    <select
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      className="bg-white/[0.03] text-white border border-white/10 text-xs px-4 py-3 rounded-2xl focus:border-purple-500/55 focus:bg-[#12071F]/90 focus:ring-0 focus:outline-none transition-all duration-300"
                    >
                      <option value="all">كل الأشهر</option>
                      {availableMonths.map(mon => (
                        <option key={mon} value={mon}>{mon}</option>
                      ))}
                    </select>
                  </div>
                </div>


              </div>

              {/* Sheet Paste Area */}
              <AnimatePresence>
                {showSheetUploader && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-[#1E0F33] p-5 rounded-3xl border border-[#E2B765]/20 space-y-4 overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="text-[#E2B765]" size={18} />
                        <h3 className="text-sm font-extrabold text-white">رفع سريع للتقييم المتكامل من الشيت</h3>
                      </div>
                      <div className="text-xs text-[#A78BFA] flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                        <Info size={12} className="text-[#E2B765]" />
                        <span>الصق سطرًا لكل موظف: (اسم الموظف أو الكود) ثم (نسبة التقييم)</span>
                      </div>
                    </div>
                    
                    <textarea
                      placeholder="امثلة:&#10;AM-104	85%&#10;محمد أحمد	92%&#10;Sales-1	79%"
                      value={pastedSheetData}
                      onChange={(e) => setPastedSheetData(e.target.value)}
                      rows={4}
                      className="w-full bg-[#12071F] text-white p-3.5 text-xs font-mono rounded-2xl border border-white/10 focus:border-[#E2B765] focus:outline-none placeholder-gray-500 leading-relaxed"
                    />

                    <div className="flex items-center gap-2.5 justify-end">
                      <div className="text-xs text-white/50 ml-auto">
                        الاستيراد يبحث كود أو اسم الموظف ويولد له التقييم فوراً للشهر المختار في نموذج التقييم أدناه.
                      </div>
                      <button
                        onClick={() => setShowSheetUploader(false)}
                        className="px-4 py-2 text-xs font-bold text-white/60 hover:text-white"
                      >
                        إلغاء
                      </button>
                      <button
                        onClick={handleImportSheetData}
                        className="bg-[#E2B765] hover:bg-[#d1a654] text-black text-xs font-black px-5 py-2.5 rounded-xl transition-all"
                      >
                        تطبيق الاستيراد الكلي ⚡
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Evaluations Table List */}
              <div className="bg-[#1E0F33]/85 rounded-[2.2rem] border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <ClipboardList className="text-[#C084FC]" size={18} />
                    قائمة سجلات التقييم الحالية
                  </h3>
                  <span className="text-xs text-[#A78BFA] font-bold">عرض {filteredEvaluations.length} تقييم من أصل {kpiEvaluations.length}</span>
                </div>

                <div className="overflow-x-auto">
                  {filteredEvaluations.length === 0 ? (
                    <div className="py-20 text-center text-white/40 space-y-3">
                      <HelpCircle size={40} className="mx-auto text-white/20 animate-bounce" />
                      <p className="text-sm">لا توجد سجلات تقييم مطابقة للبحث أو الفلتر المختار حالياً</p>
                    </div>
                  ) : (
                    <table className="w-full text-right">
                      <thead>
                        <tr className="bg-[#12071F]/40 text-white/50 text-[11px] font-black uppercase tracking-wider border-b border-white/5">
                          <th className="p-4 pr-6">الموظف والكود</th>
                          <th className="p-4">القسم والوظيفة</th>
                          <th className="p-4">الشهر المقيّم</th>
                          <th className="p-4 text-center">أوزان التقييمات التفصيلية</th>
                          <th className="p-4 text-center">النتيجة النهائية</th>
                          <th className="p-4">المقيم المسؤول</th>
                          <th className="p-4 text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredEvaluations.map((ev, idx) => (
                          <tr key={ev.id || idx} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 pr-6">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-gradient-to-tr from-[#7C3AED] to-purple-500 rounded-xl flex items-center justify-center text-white font-black text-xs">
                                  {ev.employeeName?.charAt(0) || 'E'}
                                </div>
                                <div>
                                  <div className="text-xs font-black text-white">{ev.employeeName}</div>
                                  <div className="text-[10px] text-[#A78BFA] font-mono mt-0.5">{ev.roleCode || 'N/A'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="text-xs font-bold text-white/90">{ev.department}</span>
                              <div className="text-[10px] text-gray-400 mt-0.5">{ev.jobTitle}</div>
                            </td>
                            <td className="p-4 text-xs font-bold text-white/80 font-mono">
                              {ev.month}
                            </td>
                            <td className="p-4 max-w-[320px]">
                              <div className="flex flex-wrap gap-1 justify-center">
                                {Object.entries(ev.scores || {}).map(([key, val], sidx) => (
                                  <span key={sidx} className="bg-white/5 text-[9px] text-[#A78BFA] font-medium font-mono px-2 py-0.5 rounded-md border border-white/5 flex items-center gap-1">
                                    <span className="font-sans text-white/80 truncate max-w-[120px]">{key}:</span>
                                    <span className="font-bold text-[#E2B765]">{val}%</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex flex-col items-center justify-center">
                                <span className={cn(
                                  "px-2.5 py-1 text-xs font-black font-mono rounded-lg border",
                                  getScoreColorClass(ev.totalScore)
                                )}>
                                  {ev.totalScore}%
                                </span>
                                <span className="text-[9px] text-[#A78BFA] mt-0.5 font-bold">
                                  {getScoreBadgeText(ev.totalScore)}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 text-xs">
                              <div className="text-[#A78BFA] font-bold">{ev.evaluatedBy}</div>
                              <div className="text-[9px] text-white/30 font-mono mt-0.5">
                                {ev.createdAt?.toDate ? ev.createdAt.toDate().toLocaleDateString('ar-EG') : 'الآن'}
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setViewingHistoryEvaluation(ev)}
                                  className="p-2 text-cyan-400/70 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors relative"
                                  title="سجل التعديلات"
                                >
                                  <History size={14} />
                                  {ev.editHistory && ev.editHistory.length > 0 && (
                                    <span className="absolute -top-1 -right-0.5 w-4 h-3.5 bg-[#E2B765] text-black text-[8px] font-black flex items-center justify-center rounded-full border border-[#1E0F33]">
                                      {ev.editHistory.length}
                                    </span>
                                  )}
                                </button>
                                {canEditEvaluation(ev) && (
                                  <button
                                    onClick={() => handleStartEditEvaluation(ev)}
                                    className="p-2 text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                                    title="تعديل التقييم"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                                {canDeleteEvaluation(ev) && (
                                  <button
                                    onClick={() => handleDeleteEvaluation(ev.id!)}
                                    className="p-2 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                    title="حذف السجل"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </motion.div>
          )}

          {subTab === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#1E0F33]/85 p-6 md:p-8 rounded-[2.5rem] border border-[#7C3AED]/20 space-y-6 max-w-4xl mx-auto"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <ClipboardList className="text-[#E2B765]" size={24} />
                  <div>
                    <h2 className="text-xl font-black text-white">
                      {editingEvaluationId ? `تعديل تقييم الموظف: ${employees.find(e => e.id === formEmployeeId)?.fullName || 'جاري التحميل...'}` : 'قائمة تعبئة التقييم السريع للمديرين'}
                    </h2>
                    <p className="text-xs text-[#A78BFA] mt-0.5">
                      {editingEvaluationId ? 'تعديل المعايير التفصيلية والنتائج لتقييم تم تسجيله مسبقاً' : 'يرجى ملء نتائج التقييم لكل موظف طبقًا لمعايير الـ KPIs لقسمه'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSubTab('all');
                    setEditingEvaluationId(null);
                    setFormEmployeeId('');
                    setFormScores({});
                    setFormTechNotes('');
                    setFormHrNotes('');
                    setFormShowToEmployee(true);
                  }}
                  className="bg-white/5 hover:bg-white/10 text-[#A78BFA] p-2.5 rounded-xl border border-white/5 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* 1. Pick Department */}
                <div className="space-y-2">
                  <label className="text-xs text-[#A78BFA] font-black uppercase tracking-wider block">1. اختر القسم الذي تديره</label>
                  <select
                    value={formDept}
                    disabled={!!editingEvaluationId}
                    onChange={(e) => {
                      setFormDept(e.target.value);
                      setFormEmployeeId(''); // Reset employee
                    }}
                    className="w-full bg-[#12071F] text-white border border-white/10 text-xs px-3.5 py-3 rounded-2xl focus:border-[#E2B765] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">-- اختر القسم --</option>
                    {allAvailableDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Pick Employee */}
                <div className="space-y-2">
                  <label className="text-xs text-[#A78BFA] font-black uppercase tracking-wider block">2. اختر اسم الموظف</label>
                  <select
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    disabled={!formDept || !!editingEvaluationId}
                    className="w-full bg-[#12071F] text-white border border-white/10 text-xs px-3.5 py-3 rounded-2xl focus:border-[#E2B765] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">-- اختر الموظف --</option>
                    {employees
                      .filter(e => e.department === formDept && isEmployeeEnabled(e))
                      .map(e => (
                        <option key={e.id} value={e.id}>
                          {e.fullName} ({e.roleCode}) - {e.jobTitle}
                        </option>
                      ))}
                  </select>
                  {formDept && employees.filter(e => e.department === formDept && isEmployeeEnabled(e)).length === 0 && (
                    <p className="text-[10px] text-[#EF4444] font-bold">⚠️ عذراً، لا يوجد أي موظف نشط مسجل في هذا القسم</p>
                  )}
                </div>

                {/* 3. Choose Month */}
                <div className="space-y-2">
                  <label className="text-xs text-[#A78BFA] font-black block">3. اختر شهر التقييم</label>
                  <input
                    type="month"
                    value={formMonth}
                    disabled={!!editingEvaluationId}
                    onChange={(e) => setFormMonth(e.target.value)}
                    className="w-full bg-[#12071F] text-white border border-white/10 text-xs px-3.5 py-2.5 rounded-2xl focus:border-[#E2B765] focus:outline-none font-mono disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Picked Employee Fast Info Card */}
              {formEmployeeId && (
                <div className="bg-[#12071F]/40 p-4 rounded-2xl border border-[#7C3AED]/20 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-[#E2B765]/10 text-[#E2B765] rounded-xl flex items-center justify-center font-bold">
                      <User size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white">{employees.find(e => e.id === formEmployeeId)?.fullName}</h4>
                      <p className="text-[10px] text-[#A78BFA] mt-0.5">
                        {employees.find(e => e.id === formEmployeeId)?.jobTitle} • كود: {employees.find(e => e.id === formEmployeeId)?.roleCode}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-[#A78BFA] font-bold">الدرجة والقروب</span>
                    <p className="text-xs text-white font-mono mt-0.5">{formDept}</p>
                  </div>
                </div>
              )}

              {/* Dynamic KPI Evaluated Fields standard criteria UI lists */}
              {formDept ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-t border-white/5 pt-5">
                    <h3 className="text-xs font-black text-[#E2B765] uppercase tracking-widest">
                      بناء ومؤشرات KPI تابعة لقسم: {formDept}
                    </h3>
                    <div className="text-xs font-black text-white flex items-center gap-1.5">
                      <span>إجمالي النسبة الحالية لـ {formMonth}:</span>
                      <span className="bg-[#7C3AED] text-white px-3 py-1 font-mono rounded-lg shadow-lg shadow-[#7C3AED]/20 text-sm">
                        {formTotalPercentage}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {/* Technical KPIs List (60% default sum) */}
                    <div className="space-y-4 bg-white/5 p-5 rounded-2xl border border-white/5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="text-xs font-black text-[#C084FC] flex items-center gap-1.5">
                          <Sparkles size={13} />
                          المعايير الفنية والمهام (Tech. %)
                        </span>
                        <span className="text-[10px] text-[#A78BFA] font-mono">
                          الوزن الإجمالي: {activeKpiSubset.filter(c => c.category === 'Tech').reduce((s, c) => s + c.weight, 0)}%
                        </span>
                      </div>

                      {activeKpiSubset.filter(c => c.category === 'Tech').map((crit, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-white/80 font-bold">{crit.name}</span>
                            <span className="text-[#E2B765] font-black font-mono">
                              النتيجة: {formScores[crit.name] || 0}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const current = formScores[crit.name] || 0;
                                  const val = Math.max(0, current - 1);
                                  setFormScores({ ...formScores, [crit.name]: val });
                                }}
                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 active:scale-95 text-white/70 font-black text-sm flex items-center justify-center transition-all select-none"
                              >
                                -
                              </button>
                              
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={crit.weight}
                                  value={formScores[crit.name] ?? 0}
                                  onChange={(e) => {
                                    let val = parseInt(e.target.value);
                                    if (isNaN(val)) val = 0;
                                    if (val < 0) val = 0;
                                    if (val > crit.weight) val = crit.weight;
                                    setFormScores({ ...formScores, [crit.name]: val });
                                  }}
                                  className="w-16 bg-[#12071F] text-[#E2B765] border border-white/10 rounded-lg py-1 text-center font-black font-mono text-xs focus:ring-1 focus:ring-[#E2B765] focus:outline-none"
                                />
                                <span className="absolute right-1 text-[10px] text-white/30 pointer-events-none font-mono font-bold">%</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const current = formScores[crit.name] || 0;
                                  const val = Math.min(crit.weight, current + 1);
                                  setFormScores({ ...formScores, [crit.name]: val });
                                }}
                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 active:scale-95 text-white/70 font-black text-sm flex items-center justify-center transition-all select-none"
                              >
                                +
                              </button>
                            </div>

                            <span className="text-[10px] text-[#A78BFA] bg-[#12071F] px-2.5 py-1.5 rounded-lg border border-white/5 font-mono min-w-[55px] text-center">
                              الوزن الأقصى: {crit.weight}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* HR Performance and soft skills (40% default sum) */}
                    <div className="space-y-4 bg-white/5 p-5 rounded-2xl border border-white/5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="text-xs font-black text-[#C084FC] flex items-center gap-1.5">
                          <CheckCircle size={13} />
                          المعايير العامة والسلوك (HR. %)
                        </span>
                        <span className="text-[10px] text-[#A78BFA] font-mono">
                          الوزن الإجمالي: {activeKpiSubset.filter(c => c.category === 'HR').reduce((s, c) => s + c.weight, 0)}%
                        </span>
                      </div>

                      {activeKpiSubset.filter(c => c.category === 'HR').map((crit, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-white/80 font-bold">{crit.name}</span>
                            <span className="text-[#E2B765] font-black font-mono">
                              النتيجة: {formScores[crit.name] || 0}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const current = formScores[crit.name] || 0;
                                  const val = Math.max(0, current - 1);
                                  setFormScores({ ...formScores, [crit.name]: val });
                                }}
                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 active:scale-95 text-white/70 font-black text-sm flex items-center justify-center transition-all select-none"
                              >
                                -
                              </button>
                              
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={crit.weight}
                                  value={formScores[crit.name] ?? 0}
                                  onChange={(e) => {
                                    let val = parseInt(e.target.value);
                                    if (isNaN(val)) val = 0;
                                    if (val < 0) val = 0;
                                    if (val > crit.weight) val = crit.weight;
                                    setFormScores({ ...formScores, [crit.name]: val });
                                  }}
                                  className="w-16 bg-[#12071F] text-[#E2B765] border border-white/10 rounded-lg py-1 text-center font-black font-mono text-xs focus:ring-1 focus:ring-[#E2B765] focus:outline-none"
                                />
                                <span className="absolute right-1 text-[10px] text-white/30 pointer-events-none font-mono font-bold">%</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const current = formScores[crit.name] || 0;
                                  const val = Math.min(crit.weight, current + 1);
                                  setFormScores({ ...formScores, [crit.name]: val });
                                }}
                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 active:scale-95 text-white/70 font-black text-sm flex items-center justify-center transition-all select-none"
                              >
                                +
                              </button>
                            </div>

                            <span className="text-[10px] text-[#A78BFA] bg-[#12071F] px-2.5 py-1.5 rounded-lg border border-white/5 font-mono min-w-[55px] text-center">
                              الوزن الأقصى: {crit.weight}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notes & Employee Visibility Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white/[0.02] p-5 rounded-2xl border border-white/5 space-y-2 md:space-y-0">
                    <div className="space-y-2">
                      <label className="text-xs text-[#C084FC] font-black flex items-center gap-1.5 bh-rtl">
                        <Sparkles size={14} />
                        ملاحظات التقييم الفني والمهام (Technical Notes)
                      </label>
                      <textarea
                        value={formTechNotes}
                        onChange={(e) => setFormTechNotes(e.target.value)}
                        placeholder="اكتب هنا التوجيهات أو الملاحظات الفنية بخصوص المهام والمستهدفات الخاصة بالقسم..."
                        rows={3}
                        className="w-full bg-[#12071F]/55 text-white/90 border border-white/10 rounded-xl p-3 text-xs leading-relaxed focus:ring-1 focus:ring-[#C084FC]/70 focus:outline-none placeholder:text-white/20 transition-all resize-none"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black flex items-center gap-1.5 bh-rtl">
                        <CheckCircle size={14} />
                        ملاحظات السلوك والأداء العام (HR Notes)
                      </label>
                      <textarea
                        value={formHrNotes}
                        onChange={(e) => setFormHrNotes(e.target.value)}
                        placeholder="اكتب هنا الملاحظات بخصوص الالتزام ومستوى التواصل والعمل الجماعي وحضور الموظف..."
                        rows={3}
                        className="w-full bg-[#12071F]/55 text-white/90 border border-white/10 rounded-xl p-3 text-xs leading-relaxed focus:ring-1 focus:ring-[#A78BFA]/70 focus:outline-none placeholder:text-white/20 transition-all resize-none"
                      />
                    </div>

                    <div className="md:col-span-2 pt-2 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg shrink-0">
                          <Eye size={16} />
                        </div>
                        <div>
                          <label className="text-xs font-black text-white block">إظهار هذا التقييم في صفحة الموظف</label>
                          <span className="text-[10px] text-white/40 block">يمكنك إيقاف التفعيل لتعليق ظهور التقييم للموظف لحين عقد جلسة المراجعة السنوية أو الشهرية معه أولاً.</span>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formShowToEmployee}
                          onChange={(e) => setFormShowToEmployee(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                  </div>

                  <div className="bg-[#E2B765]/10 border border-[#E2B765]/20 p-4 rounded-2xl text-[11px] text-white/90 leading-relaxed flex items-center gap-3">
                    <Info size={16} className="text-[#E2B765] shrink-0" />
                    <div>
                      <strong>طريقة احتساب النسبة المئوية لـ KPIs:</strong> يتم إدخال النسب المحققة لكل معيار مباشرة (من 0 إلى وزن المعيار الأقصى). على سبيل المثال، إذا كان وزن المعيار هو 15%، فإن الحد الأقصى للإدخال المتوفر هو 15% للحصول على الدرجة الكاملة فيه، وبذلك يتم جمع ونمذجة هذه التقييمات تلقائياً بالتزامن مع الأوزان المعتمدة.
                    </div>
                  </div>

                  {/* Submission triggers */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                    <button
                      onClick={() => {
                        setSubTab('all');
                        setEditingEvaluationId(null);
                        setFormEmployeeId('');
                        setFormScores({});
                        setFormTechNotes('');
                        setFormHrNotes('');
                        setFormShowToEmployee(true);
                      }}
                      className="px-5 py-3 text-xs font-black text-white/50 hover:text-white transition-colors"
                    >
                      إلغاء التعديل والرجوع
                    </button>
                    <button
                      onClick={handleSubmitEvaluation}
                      className="bg-gradient-to-l from-[#C084FC] to-[#7C3AED] hover:from-[#b172ee] hover:to-[#6d2fd1] text-white text-xs font-black px-6 py-3.5 rounded-2xl transition-all shadow-xl shadow-purple-500/20"
                    >
                      {editingEvaluationId ? 'حفظ التعديلات وتحديث التقييم 💾' : 'تسجيل التقييم رسمياً وحفظ بالداتا 💾'}
                    </button>
                  </div>

                </div>
              ) : (
                <div className="p-12 text-center text-white/40 border border-dashed border-white/10 rounded-3xl">
                  <ClipboardList size={36} className="mx-auto text-white/15 mb-3" />
                  <p className="text-xs">يرجى البدء بتحديد قسم معتمد أولاً لعرض الحقول وتعبئة تقارير القياس.</p>
                </div>
              )}

            </motion.div>
          )}

          {subTab === 'kpis' && isAdmin && (
            <motion.div
              key="kpis"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#1E0F33]/85 p-6 md:p-8 rounded-[2.5rem] border border-[#7C3AED]/20 space-y-6 max-w-4xl mx-auto"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <Settings className="text-[#E2B765]" size={24} />
                  <div>
                    <h2 className="text-xl font-black text-white">إعدادات وتخصيص معايير الـ KPIs للأقسام</h2>
                    <p className="text-xs text-[#A78BFA] mt-0.5">يمكنك تغيير مسميات المعايير، الأوزان، أو إدراج أوزان جديدة للأقسام</p>
                  </div>
                </div>
                <button
                  onClick={() => setSubTab('all')}
                  className="bg-white/5 hover:bg-white/10 text-[#A78BFA] p-2.5 rounded-xl border border-white/5 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              </div>

              {/* Dept select for editing */}
              <div className="space-y-2 max-w-md">
                <label className="text-xs text-[#A78BFA] font-black uppercase tracking-wider block">حدد القسم المراد ضبط نظام معاييره</label>
                <select
                  value={editingDept}
                  onChange={(e) => {
                    if (e.target.value) {
                      startEditingKpis(e.target.value);
                    } else {
                      setEditingDept('');
                    }
                  }}
                  className="w-full bg-[#12071F] text-white border border-white/10 text-xs px-3.5 py-3 rounded-2xl focus:border-[#E2B765] focus:outline-none"
                >
                  <option value="">-- اختر القسم --</option>
                  {allAvailableDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {editingDept ? (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-t border-white/5 pt-5">
                    <h3 className="text-xs font-black text-white">
                      تعديل معايير قسم: <span className="text-[#E2B765]">{editingDept}</span>
                    </h3>
                    
                    <button
                      onClick={handleAddCriterion}
                      className="bg-[#7C3AED]/20 border border-[#7C3AED]/30 text-[#C084FC] hover:bg-[#7C3AED]/30 text-xs font-bold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      إضافة معيار تقييم جديد
                    </button>
                  </div>

                  {/* Criteria editing list */}
                  <div className="space-y-3">
                    {editingCriteria.map((crit, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row items-center gap-3 bg-[#12071F]/40 p-4 rounded-2xl border border-white/5">
                        
                        {/* Category Selector */}
                        <div className="w-full md:w-32">
                          <select
                            value={crit.category}
                            onChange={(e) => handleUpdateCriterion(idx, { category: e.target.value as 'Tech' | 'HR' })}
                            className="w-full bg-[#12071F] text-xs text-white border border-white/10 px-2 py-2 rounded-xl focus:border-[#E2B765] focus:outline-none"
                          >
                            <option value="Tech">فني (Tech. %)</option>
                            <option value="HR">سلوكي عام (HR. %)</option>
                          </select>
                        </div>

                        {/* Name Input */}
                        <div className="flex-1 w-full">
                          <input
                            type="text"
                            value={crit.name}
                            onChange={(e) => handleUpdateCriterion(idx, { name: e.target.value })}
                            placeholder="مسمى معيار التقييم بالكامل"
                            className="w-full bg-[#12071F] text-xs text-white border border-white/10 px-3.5 py-2 rounded-xl focus:border-[#E2B765] focus:outline-none"
                          />
                        </div>

                        {/* Weight Input */}
                        <div className="w-full md:w-28 flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={crit.weight}
                            onChange={(e) => handleUpdateCriterion(idx, { weight: parseInt(e.target.value) || 0 })}
                            className="w-full bg-[#12071F] text-xs text-white border border-white/10 px-2 py-2 rounded-xl focus:border-[#E2B765] focus:outline-none font-mono text-center"
                          />
                          <span className="text-xs text-white/50">%</span>
                        </div>

                        {/* Delete trigger */}
                        <button
                          onClick={() => handleRemoveCriterion(idx)}
                          className="p-2 text-rose-500/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all self-center shrink-0"
                        >
                          <Trash2 size={16} />
                        </button>

                      </div>
                    ))}
                  </div>

                  {/* Formula Weight checker display */}
                  <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <Layers size={16} className="text-[#E2B765]" />
                      <span>الأوزان المحتسبة:</span>
                      <span className="font-bold text-white">فني ({editingCriteria.filter(c => c.category === 'Tech').reduce((s, c) => s + c.weight, 0)}%)</span>
                      <span className="text-white/30">•</span>
                      <span className="font-bold text-white">سلوكي ({editingCriteria.filter(c => c.category === 'HR').reduce((s, c) => s + c.weight, 0)}%)</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span>مجموع أوزان القسم:</span>
                      <span className={cn(
                        "font-mono font-black border px-3 py-1 rounded-lg text-sm",
                        editingCriteria.reduce((acc, curr) => acc + curr.weight, 0) === 100 
                          ? "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20" 
                          : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                      )}>
                        {editingCriteria.reduce((acc, curr) => acc + curr.weight, 0)}% / 100%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 justify-end border-t border-white/5 pt-5">
                    <button
                      onClick={() => setEditingDept('')}
                      className="px-4 py-2 text-xs font-bold text-white/60 hover:text-white"
                    >
                      إلغاء التعديل
                    </button>
                    <button
                      onClick={saveKpiSettings}
                      className="bg-[#E2B765] hover:bg-[#d1a654] text-black text-xs font-black px-5 py-2.5 rounded-xl transition-all"
                    >
                      حفظ وتعميم نظام الـ KPIs الجديد 💾
                    </button>
                  </div>

                </div>
              ) : (
                <div className="p-12 text-center text-white/40 border border-dashed border-white/10 rounded-3xl">
                  <Settings size={36} className="mx-auto text-white/15 mb-3 animate-spin duration-300" />
                  <p className="text-xs">فضلاً حدد المسمى لقسم لتعديل وإدارة قواعد ومعايير الـ KPIs التابعة له.</p>
                </div>
              )}

            </motion.div>
          )}

          {subTab === 'permissions' && isAdmin && (
            <motion.div
              key="permissions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#1E0F33]/85 p-6 md:p-8 rounded-[2.5rem] border border-[#7C3AED]/20 space-y-6 max-w-4xl mx-auto text-right"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <User className="text-[#E2B765]" size={24} />
                  <div>
                    <h2 className="text-xl font-black text-white">صلاحيات الوصول لصفحة التقييمات</h2>
                    <p className="text-xs text-[#A78BFA] mt-0.5">حدد الموظفين والمديرين المسموح لهم بتصفح صفحة التقييمات وكتابة تقارير KPIs</p>
                  </div>
                </div>
                <button
                  onClick={() => setSubTab('all')}
                  className="bg-white/5 hover:bg-white/10 text-[#A78BFA] p-2.5 rounded-xl border border-white/5 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              </div>

              {/* Informational Note */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-xs text-white/80 leading-relaxed flex items-center gap-3">
                <Info size={18} className="text-[#E2B765] shrink-0" />
                <div>
                  <strong>ملاحظة تنظيمية:</strong> مدراء النظام الرئيسيين (HR-MASTER و GM-MASTER) لديهم صلاحية كاملة وتلقائية لتصفح التقييمات وإعداد الـ KPIs وتعديل الصلاحيات ولا يحتاجون للتحديد أدناه. حدد المديرين والموظفين الآخرين والذين ترغب بظهور صفحة التقييمات في لوحاتهم الجانبية.
                </div>
              </div>

              {/* Custom Dropdown Checklist */}
              <div className="space-y-3 relative">
                <label className="text-xs text-[#A78BFA] font-black uppercase tracking-wider block">البحث واختيار الموظفين والمديرين (قائمة منسدلة مفصلة)</label>
                
                {/* Selector Box */}
                <div className="relative">
                  <button
                    onClick={() => setIsOpenDropdown(prev => !prev)}
                    type="button"
                    className="w-full bg-[#12071F] text-white border border-white/10 text-xs px-4 py-3.5 rounded-2xl focus:border-[#E2B765] focus:outline-none flex items-center justify-between text-right cursor-pointer"
                  >
                    <span className="font-bold">
                      {(systemSettings?.evaluationAccess || []).length === 0 
                        ? "-- اختر الموظفين لمنحهم صلاحية الوصول --" 
                        : `تم تحديد وعرض (${(systemSettings?.evaluationAccess || []).length}) موظفين`}
                    </span>
                    <span className="text-[#A78BFA] text-xs font-black">▼</span>
                  </button>

                  <AnimatePresence>
                    {isOpenDropdown && (
                      <>
                        {/* Outside click detector */}
                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsOpenDropdown(false)} />
                        
                        {/* Dropdown Box */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute right-0 w-full mt-2 bg-[#160A29] border border-[#7C3AED]/30 rounded-2xl shadow-2xl z-50 overflow-hidden text-right"
                        >
                          {/* Search Area */}
                          <div className="p-3 bg-[#1E0F33] border-b border-[#7C3AED]/10 flex items-center gap-2">
                            <Search size={14} className="text-[#A78BFA] shrink-0" />
                            <input
                              type="text"
                              value={searchEmpPerm}
                              onChange={(e) => setSearchEmpPerm(e.target.value)}
                              placeholder="ابحث باسم الموظف أو المسمى الوظيفي..."
                              className="w-full bg-transparent border-none text-white text-xs placeholder-white/30 focus:outline-none focus:ring-0 text-right"
                              dir="rtl"
                            />
                            {searchEmpPerm && (
                              <button 
                                onClick={() => setSearchEmpPerm('')}
                                className="text-[10px] text-white/50 hover:text-white shrink-0"
                              >
                                مسح
                              </button>
                            )}
                          </div>

                          {/* Options Container */}
                          <div className="max-h-60 overflow-y-auto divide-y divide-[#7C3AED]/10 custom-scrollbar">
                            {filteredEmployeesForPerm.length === 0 ? (
                              <div className="p-6 text-center text-xs text-white/40">
                                لا يوجد موظفين مطابقين للبحث
                              </div>
                            ) : (
                              filteredEmployeesForPerm.map((emp) => {
                                const allowedList = systemSettings?.evaluationAccess || [];
                                const isChecked = allowedList.includes(emp.id);
                                return (
                                  <label
                                    key={emp.id}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#1E1035] cursor-pointer transition-all w-full select-none text-right justify-start"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleAccess(emp.id)}
                                      className="w-4 h-4 rounded-md bg-[#12071F] border-white/10 accent-[#E2B765] cursor-pointer focus:ring-0 text-[#E2B765] shrink-0"
                                    />
                                    <div className="grow min-w-0 text-right">
                                      <div className="text-xs font-black text-white truncate">{emp.fullName}</div>
                                      <div className="text-[10px] text-[#A78BFA] mt-0.5 font-bold">
                                        {emp.roleCode} • {emp.jobTitle} • {emp.department || 'بدون قسم'}
                                      </div>
                                    </div>
                                    {isChecked && (
                                      <span className="text-[10px] bg-[#E2B765]/10 text-[#E2B765] px-2.5 py-0.5 rounded-full font-black shrink-0">
                                        صلاحية نشطة ✓
                                      </span>
                                    )}
                                  </label>
                                );
                              })
                            )}
                          </div>

                          <div className="p-2.5 bg-[#1E0F33] border-t border-[#7C3AED]/15 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setIsOpenDropdown(false)}
                              className="bg-[#E2B765] hover:bg-[#d1a654] text-black text-[11px] font-black px-4 py-1.5 rounded-xl transition-all"
                            >
                              إغلاق القائمة
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Tag List display */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <h3 className="text-xs font-black text-[#A78BFA] tracking-wider uppercase block">الموظفون الممنوحون صلاحيات الدخول حالياً:</h3>
                
                {(() => {
                  const allowedIds = systemSettings?.evaluationAccess || [];
                  const allowedEmps = employees.filter(e => allowedIds.includes(e.id));
                  
                  if (allowedEmps.length === 0) {
                    return (
                      <div className="p-4 bg-white/5 rounded-2xl border border-dashed border-white/10 text-center text-xs text-white/45">
                        لم يتم تعيين أي موظف أو مدير حتى الآن. يرجى فتح قائمة الاختيار أعلاه وتحديد الموظفين لمنحهم الصلاحية.
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {allowedEmps.map((emp) => {
                        let allSystemDepts = systemSettings?.departments || [];
                        if (emp.department && !allSystemDepts.includes(emp.department)) {
                          allSystemDepts = [emp.department, ...allSystemDepts];
                        }

                        return (
                          <div 
                            key={emp.id}
                            className="bg-[#12071F]/55 backdrop-blur-md p-4 rounded-[2rem] border border-white/5 hover:border-[#7C3AED]/30 transition-all flex flex-col gap-3 text-right"
                            dir="rtl"
                          >
                            <div className="flex items-center justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 min-w-0 text-right">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#C084FC] flex items-center justify-center text-white text-xs font-black shrink-0 shadow-lg shadow-[#7C3AED]/20">
                                  {emp.fullName?.charAt(0)}
                                </div>
                                <div className="truncate text-right">
                                  <span className="text-xs font-black text-white block truncate">{emp.fullName}</span>
                                  <span className="text-[10px] text-[#A78BFA] block font-bold truncate">
                                    {emp.jobTitle} • {emp.department || 'بدون قسم'}
                                  </span>
                                </div>
                              </div>
                              
                              <button
                                onClick={() => handleToggleAccess(emp.id)}
                                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3 py-1.5 rounded-xl text-[10px] font-black transition-colors shrink-0"
                                title="إلغاء الصلاحية"
                              >
                                إلغاء ✕
                              </button>
                            </div>

                            {/* Additional Departments Checkbox Interface */}
                            <div className="pt-3 border-t border-white/5 space-y-2">
                              <span className="text-[10px] text-[#A78BFA] font-black block tracking-wider uppercase">📁 أقسام إضافية مصرح برؤيتها وتقييمها:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {allSystemDepts.map(dept => {
                                  const isOwnDept = dept === emp.department;
                                  const empExtraDepts = systemSettings?.evaluationAccessDepts?.[emp.id] || [];
                                  const isChecked = isOwnDept || empExtraDepts.includes(dept);

                                  return (
                                    <label
                                      key={dept}
                                      className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer transition-all border select-none",
                                        isChecked 
                                          ? "bg-[#E2B765]/10 text-[#E2B765] border-[#E2B765]/25 font-black" 
                                          : "bg-white/5 text-white/40 border-transparent hover:bg-white/10 hover:text-white"
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={isOwnDept}
                                        onChange={() => handleToggleDeptAccess(emp.id, dept)}
                                        className="w-3.5 h-3.5 rounded bg-[#12071F] border-white/10 accent-[#E2B765] cursor-pointer disabled:opacity-40"
                                      />
                                      <span>
                                        {dept} {isOwnDept && <span className="text-[8px] text-[#A78BFA] font-normal">(قسمه الأصلي)</span>}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      )}

      {/* Modification History Modal */}
      <AnimatePresence>
        {viewingHistoryEvaluation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#12071F] w-full max-w-2xl rounded-[2.5rem] border border-[#E2B765]/20 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="p-6 bg-[#160A26] border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#E2B765]/10 rounded-xl text-[#E2B765] border border-[#E2B765]/20">
                    <History size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">تفاصيل وسجل تعديلات التقييم</h3>
                    <p className="text-xs text-[#A78BFA] mt-0.5">الموظف: {viewingHistoryEvaluation.employeeName} ({viewingHistoryEvaluation.month})</p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingHistoryEvaluation(null)}
                  className="bg-white/5 hover:bg-white/10 text-white/50 hover:text-white px-3.5 py-2 rounded-xl transition-colors border border-white/5 text-xs font-bold leading-none"
                >
                  ✕ إغلاق
                </button>
              </div>

              {/* Body Content */}
              <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
                {/* Current values and notes */}
                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-3xl space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
                    <span className="text-xs text-[#E2B765] font-black">حالة الظهور والملاحظات التوضيحية الحالية</span>
                    <div className="flex items-center gap-2">
                      {viewingHistoryEvaluation.showToEmployee ?? true ? (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <Eye size={12} />
                          يظهر في صفحة الموظف
                        </span>
                      ) : (
                        <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <EyeOff size={12} />
                          مخفي عن صفحة الموظف (للمقابلة أولاً)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-[#C084FC] font-black block tracking-wider uppercase">📝 ملاحظات التقييم الفني والمهام (Technical):</span>
                      <p className="bg-[#12071F] p-3 rounded-xl border border-white/5 text-xs text-white/80 leading-relaxed min-h-[60px] whitespace-pre-wrap">
                        {viewingHistoryEvaluation.techNotes || "لا توجد ملاحظات تيكنيكال مسجلة للقسم."}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-[#A78BFA] font-black block tracking-wider uppercase">🛡️ ملاحظات السلوك والأداء العام (HR):</span>
                      <p className="bg-[#12071F] p-3 rounded-xl border border-white/5 text-xs text-white/80 leading-relaxed min-h-[60px] whitespace-pre-wrap">
                        {viewingHistoryEvaluation.hrNotes || "لا توجد ملاحظات سلوكية مسجلة من الـ HR."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4">
                  <span className="text-xs text-white/50 font-black block mb-1">🕒 سجل التحديثات والتعديلات التاريخية:</span>
                </div>

                {(!viewingHistoryEvaluation.editHistory || viewingHistoryEvaluation.editHistory.length === 0) ? (
                  <div className="py-16 text-center space-y-3">
                    <CheckCircle className="mx-auto text-emerald-400/30" size={48} />
                    <p className="text-sm text-white/60 font-bold">لا توجد تعديلات سابقة على هذا التقييم</p>
                    <p className="text-xs text-white/35">تم تسجيل التقييم في البداية ولم يخضع لأي تعديل من قبل المشرفين حتى الآن.</p>
                  </div>
                ) : (
                  <div className="space-y-6 relative border-r-2 border-white/5 pr-4 mr-2">
                    {viewingHistoryEvaluation.editHistory.map((log, lidx) => {
                      const logDate = new Date(log.updatedAt);
                      return (
                        <div key={lidx} className="relative space-y-3">
                          {/* Timeline dot */}
                          <div className="absolute -right-[23px] top-1 w-3 h-3 bg-[#E2B765] rounded-full border border-[#12071F] shadow" />

                          {/* Event info */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs">
                              <span className="text-white/40 font-bold">عُدّل بواسطة:</span>{" "}
                              <span className="text-[#A78BFA] font-black">{log.updatedBy}</span>
                            </div>
                            <div className="text-[10px] text-white/30 font-mono" dir="ltr">
                              {logDate.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                            </div>
                          </div>

                          <div className="bg-[#1E0F33] p-4 rounded-2xl border border-white/5 space-y-3">
                            {/* Score comparison */}
                            <div className="flex items-center justify-between text-xs pb-2 border-b border-white/5">
                              <span className="text-white/50 font-bold">النتيجة الإجمالية للتقييم:</span>
                              <div className="flex items-center gap-2">
                                <span className="bg-rose-500/10 text-rose-400 font-mono px-2 py-0.5 rounded border border-rose-500/10 text-[10px] line-through">
                                  {log.previousTotalScore}%
                                </span>
                                <span className="text-white/40 text-[10px]">➔</span>
                                <span className="bg-emerald-500/10 text-emerald-400 font-bold font-mono px-2 py-0.5 rounded border border-emerald-500/10 text-[10px]">
                                  {log.newTotalScore}%
                                </span>
                              </div>
                            </div>

                            {/* Detailed Criterion Shifts */}
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] text-[#A78BFA] font-black block tracking-wider uppercase">📊 فوارق معايير الـ KPIs بالتفصيل:</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {Object.keys({ ...(log.previousScores || {}), ...(log.newScores || {}) }).map((critName) => {
                                  const prevVal = log.previousScores?.[critName] ?? 0;
                                  const newVal = log.newScores?.[critName] ?? 0;
                                  const isChanged = prevVal !== newVal;

                                  return (
                                    <div 
                                      key={critName} 
                                      className={cn(
                                        "p-2 rounded-xl border text-[10px] flex items-center justify-between transition-colors",
                                        isChanged 
                                          ? "bg-[#E2B765]/5 border-[#E2B765]/20 text-[#E2B765]" 
                                          : "bg-white/5 border-transparent text-white/50"
                                      )}
                                    >
                                      <span className="truncate max-w-[140px] font-bold">{critName}:</span>
                                      <div className="flex items-center gap-1.5 font-mono">
                                        {isChanged ? (
                                          <>
                                            <span className="text-rose-400 line-through text-[9px]">{prevVal}%</span>
                                            <span className="opacity-40 text-[9px]">➔</span>
                                            <span className="text-emerald-400 font-black text-[9px]">{newVal}%</span>
                                          </>
                                        ) : (
                                          <span className="font-bold">{newVal}%</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
