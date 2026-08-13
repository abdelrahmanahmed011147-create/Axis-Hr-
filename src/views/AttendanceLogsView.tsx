import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Employee, Attendance, Settings as SettingsType, LeaveRequest } from '../types';
import { 
  Calendar, 
  Search, 
  Download, 
  Filter, 
  User, 
  Clock, 
  AlertTriangle, 
  FileText, 
  ChevronRight, 
  ChevronLeft,
  ArrowUpDown,
  Table as TableIcon,
  X,
  Sun,
  CheckCircle2,
  XCircle,
  CalendarDays,
  TrendingUp,
  Award,
  Coffee,
  AlertCircle,
  Edit
} from 'lucide-react';
import { cn, formatCairoDate, formatTimeTo12Hour, formatDelayToArabic, calculatePermissionHours, isEmployeeEnabled } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import ExcelJS from 'exceljs';

export const AttendanceLogsView: React.FC = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Deduction Edit States
  const [editingLog, setEditingLog] = useState<Attendance | null>(null);
  const [editDeductionValue, setEditDeductionValue] = useState<number>(0);
  const [editDeductionReason, setEditDeductionReason] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  
  // Tab Control
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>(formatCairoDate(new Date()));
  const [dailyStatusFilter, setDailyStatusFilter] = useState<'all' | 'present' | 'late' | 'vacation' | 'absent'>('all');

  // Date Filters
  const [dateFilter, setDateFilter] = useState<'current' | 'last' | 'custom'>('current');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Helper to get month boundaries for a date string timezone-safely
  const getMonthRange = (dateStr: string) => {
    try {
      const [year, month] = dateStr.split('-').map(Number);
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDayVal = new Date(year, month, 0).getDate();
      const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;
      return { first: firstDay, last: lastDay };
    } catch {
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDayVal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const lastDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;
      return { first: firstDay, last: lastDay };
    }
  };

  useEffect(() => {
    if (activeTab === 'daily') {
      const { first, last } = getMonthRange(selectedDailyDate);
      setStartDate(first);
      setEndDate(last);
    } else {
      // Monthly Tab
      if (dateFilter === 'current') {
        const now = new Date();
        const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDayVal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const lastDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;
        setStartDate(firstDay);
        setEndDate(lastDay);
      } else if (dateFilter === 'last') {
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const year = prevMonthDate.getFullYear();
        const month = prevMonthDate.getMonth() + 1;
        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDayVal = new Date(year, month, 0).getDate();
        const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;
        setStartDate(firstDay);
        setEndDate(lastDay);
      }
    }
  }, [activeTab, dateFilter, selectedDailyDate]);

  // Helpers for Daily Logs Tab
  const getEmployeeDailyStatus = (emp: Employee, date: string) => {
    const log = attendance.find(a => {
      const matchId = a.userId && emp.id && a.userId.trim() === emp.id.trim();
      const matchCode = a.roleCode && emp.roleCode && a.roleCode.trim().toLowerCase() === emp.roleCode.trim().toLowerCase();
      return (matchId || matchCode) && a.date === date;
    });
    
    if (log) {
      const isLate = log.status?.trim() === 'Late' || (log.delayMinutes && log.delayMinutes > 0);
      return {
        type: isLate ? 'late' : 'present',
        label: isLate ? 'متأخر' : 'حاضر',
        log
      };
    }
    
    // Check approved vacation
    const approvedVacation = requests.find(r => {
      const matchId = r.userId && emp.id && r.userId.trim() === emp.id.trim();
      const matchCode = r.roleCode && emp.roleCode && r.roleCode.trim().toLowerCase() === emp.roleCode.trim().toLowerCase();
      return (matchId || matchCode) && 
        r.status === 'Approved' && 
        (r.type === 'vacation_regular' || r.type === 'vacation_sick') &&
        r.fromDate && r.toDate &&
        date >= r.fromDate && date <= r.toDate;
    });
    
    if (approvedVacation) {
      return {
        type: 'vacation',
        label: approvedVacation.type === 'vacation_sick' ? 'إجازة مرضية' : 'إجازة اعتيادية',
        request: approvedVacation
      };
    }

    // Check approved or pending permission
    const approvedPermission = requests.find(r => {
      const matchId = r.userId && emp.id && r.userId.trim() === emp.id.trim();
      const matchCode = r.roleCode && emp.roleCode && r.roleCode.trim().toLowerCase() === emp.roleCode.trim().toLowerCase();
      return (matchId || matchCode) && 
        (r.status === 'Approved' || r.status === 'Pending') && 
        r.type === 'permission' &&
        r.date === date;
    });
    
    if (approvedPermission) {
      return {
        type: 'permission',
        label: approvedPermission.status === 'Approved' ? 'إذن معتمد اليوم' : 'إذن معلق (مؤقت)',
        request: approvedPermission
      };
    }

    // Check weekend (Friday & Saturday are weekends in Egypt)
    const dObj = new Date(date);
    const dayOfWeek = dObj.getDay(); // 0 is Sunday, 5 is Friday, 6 is Saturday
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      return {
        type: 'weekend',
        label: 'عطلة نهاية الأسبوع'
      };
    }

    // Check if employee is exempt (GM or HR Master)
    if (emp.role === 'GM-MASTER' || emp.role === 'HR-MASTER') {
      return {
        type: 'exempt',
        label: 'إعفاء إداري'
      };
    }

    const todayStr = formatCairoDate(new Date());
    if (date === todayStr) {
      return {
        type: 'absent',
        label: 'لم يحضر بعد'
      };
    } else if (date > todayStr) {
      return {
        type: 'absent',
        label: 'لم يبدأ الدوام بعد'
      };
    }

    return {
      type: 'absent',
      label: 'غائب'
    };
  };

  const getDailyStats = (date: string) => {
    let totalPresent = 0;
    let totalLate = 0;
    let totalVacation = 0;
    let totalAbsent = 0;
    let totalExempt = 0;

    employees.forEach(emp => {
      const status = getEmployeeDailyStatus(emp, date);
      if (status.type === 'present') {
        totalPresent++;
      } else if (status.type === 'late') {
        totalLate++;
        totalPresent++;
      } else if (status.type === 'vacation') {
        totalVacation++;
      } else if (status.type === 'absent') {
        totalAbsent++;
      } else if (status.type === 'exempt') {
        totalExempt++;
      }
    });

    return { totalPresent, totalLate, totalVacation, totalAbsent, totalExempt };
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDailyDate);
    d.setDate(d.getDate() - 1);
    setSelectedDailyDate(formatCairoDate(d));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDailyDate);
    d.setDate(d.getDate() + 1);
    setSelectedDailyDate(formatCairoDate(d));
  };

  const handleGoToToday = () => {
    setSelectedDailyDate(formatCairoDate(new Date()));
  };

  const formatArabicDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => isEmployeeEnabled(e)));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'system_config'), (snap) => {
      if (snap.exists()) setSettings(snap.data() as SettingsType);
    });

    const unsubRequests = onSnapshot(collection(db, 'requests'), (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    });

    return () => {
      unsubEmployees();
      unsubSettings();
      unsubRequests();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    if (!startDate || !endDate) return;

    setLoading(true);
    // Fetch attendance within range
    const q = query(
      collection(db, 'attendance'),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );

    const unsubAttendance = onSnapshot(q, (snap) => {
      setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      setLoading(false);
    }, (error) => {
      console.error("Attendance fetch error:", error);
      toast.error("خطأ في تحميل البيانات");
      setLoading(false);
    });

    return () => unsubAttendance();
  }, [startDate, endDate]);

  const filteredEmployees = employees.filter(emp => 
    emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.roleCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getEmployeeApprovedVacationDays = (roleCode: string, empId?: string) => {
    if (!startDate || !endDate) return 0;
    
    let totalDays = 0;
    const employeeRequests = requests.filter(r => {
      const matchId = empId && r.userId && r.userId.trim() === empId.trim();
      const matchCode = r.roleCode && roleCode && r.roleCode.trim().toLowerCase() === roleCode.trim().toLowerCase();
      return (matchId || matchCode) && 
        r.status === 'Approved' && 
        (r.type === 'vacation_regular' || r.type === 'vacation_sick');
    });

    employeeRequests.forEach(req => {
      const fromD = req.fromDate || req.date;
      const toD = req.toDate || req.date;

      if (fromD && toD) {
        // Find overlap between [fromD, toD] and [startDate, endDate]
        const reqStart = new Date(fromD);
        const reqEnd = new Date(toD);
        const filterStart = new Date(startDate);
        const filterEnd = new Date(endDate);

        const overlapStart = reqStart > filterStart ? reqStart : filterStart;
        const overlapEnd = reqEnd < filterEnd ? reqEnd : filterEnd;

        if (overlapStart <= overlapEnd) {
          const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          totalDays += diffDays;
        }
      }
    });

    return totalDays;
  };

  const getEmployeeApprovedPermissionHours = (roleCode: string, empId?: string) => {
    if (!startDate || !endDate) return 0;
    
    let totalHours = 0;
    const employeeRequests = requests.filter(r => {
      const matchId = empId && r.userId && r.userId.trim() === empId.trim();
      const matchCode = r.roleCode && roleCode && r.roleCode.trim().toLowerCase() === roleCode.trim().toLowerCase();
      return (matchId || matchCode) && 
        r.status === 'Approved' && 
        r.type === 'permission';
    });

    employeeRequests.forEach(req => {
      const d = req.date || req.fromDate;
      if (d) {
        const reqDate = new Date(d);
        const filterStart = new Date(startDate);
        const filterEnd = new Date(endDate);

        reqDate.setHours(0,0,0,0);
        filterStart.setHours(0,0,0,0);
        filterEnd.setHours(0,0,0,0);

        if (reqDate >= filterStart && reqDate <= filterEnd) {
          const h = req.fromTime && req.toTime ? calculatePermissionHours(req.fromTime, req.toTime) : (req.hours || 2);
          totalHours += h;
        }
      }
    });

    return totalHours;
  };

  const getEmployeeStats = (roleCode: string, empId?: string) => {
    const logs = attendance.filter(a => {
      const matchId = empId && a.userId && a.userId.trim() === empId.trim();
      const matchCode = a.roleCode && roleCode && a.roleCode.trim().toLowerCase() === roleCode.trim().toLowerCase();
      return matchId || matchCode;
    });
    const presentDays = logs.length;
    const totalDelay = logs.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);
    const totalDeductions = logs.reduce((acc, curr) => acc + (curr.deductionValue || 0), 0);
    const approvedVacationDays = getEmployeeApprovedVacationDays(roleCode, empId);
    const approvedPermissionHours = getEmployeeApprovedPermissionHours(roleCode, empId);
    
    return {
      presentDays,
      totalDelay,
      totalDeductions,
      approvedVacationDays,
      approvedPermissionHours,
      logs
    };
  };

  const selectedEmployee = selectedEmployeeId ? employees.find(e => e.id === selectedEmployeeId) : null;
  const selectedEmployeeLogs = selectedEmployee ? {
    employee: selectedEmployee,
    stats: getEmployeeStats(selectedEmployee.roleCode, selectedEmployee.id),
    logs: getEmployeeStats(selectedEmployee.roleCode, selectedEmployee.id).logs
  } : null;

  const handleSaveDeduction = async () => {
    if (!editingLog || !editingLog.id) {
      toast.error("لم يتم تحديد سجل صالح لتعديله");
      return;
    }
    
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, 'attendance', editingLog.id), {
        deductionValue: Number(editDeductionValue),
        deductionReason: editDeductionReason,
      });
      toast.success("تم تعديل الخصم بنجاح");
      setEditingLog(null);
    } catch (error: any) {
      console.error("Error updating deduction:", error);
      toast.error("فشل تعديل الخصم: " + error.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const exportToExcel = async () => {
    try {
      toast.loading('جاري تجهيز ملف الـ Excel الملون والمفصل...', { id: 'excel-export' });
      
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Axis HR System';
      workbook.lastModifiedBy = 'Axis HR System';
      workbook.created = new Date();
      workbook.modified = new Date();

      // ==========================================
      // 1. ADD GENERAL SUMMARY SHEET
      // ==========================================
      const summarySheet = workbook.addWorksheet('الملخص العام', {
        views: [{ rightToLeft: true }]
      });

      // Spacing & width configurations
      summarySheet.getColumn('A').width = 4;   // Empty spacing column
      summarySheet.getColumn('B').width = 16;  // Employee Code
      summarySheet.getColumn('C').width = 30;  // Full Name
      summarySheet.getColumn('D').width = 20;  // Department
      summarySheet.getColumn('E').width = 18;  // Current Shift
      summarySheet.getColumn('F').width = 15;  // Present Days
      summarySheet.getColumn('G').width = 15;  // Delay
      summarySheet.getColumn('H').width = 18;  // Deduction Days
      summarySheet.getColumn('I').width = 22;  // Deduction EGP Before Clemency
      summarySheet.getColumn('J').width = 22;  // HR Clemency Ratio
      summarySheet.getColumn('K').width = 24;  // Deduction After Clemency EGP
      summarySheet.getColumn('L').width = 22;  // Approved Vacation Days

      // Title Block
      summarySheet.getRow(2).height = 40;
      summarySheet.mergeCells('B2:L2');
      const titleCell = summarySheet.getCell('B2');
      titleCell.value = 'نظام إدارة الموارد البشرية - AXIS GROUP';
      titleCell.font = { name: 'Segoe UI', family: 4, size: 16, bold: true, color: { argb: 'FFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4C1D95' } }; // Deep Purple
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Subtitle Block
      summarySheet.getRow(3).height = 25;
      summarySheet.mergeCells('B3:L3');
      const subtitleCell = summarySheet.getCell('B3');
      subtitleCell.value = 'تقرير ملخص الحضور والانصراف والخصومات العامة للموظفين';
      subtitleCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: '374151' } };
      subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } }; // Soft light purple
      subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Date Period Row
      summarySheet.getRow(4).height = 22;
      summarySheet.mergeCells('B4:L4');
      const dateCell = summarySheet.getCell('B4');
      dateCell.value = `الفترة الزمنية للتقرير: من ${startDate || '---'} إلى ${endDate || '---'}`;
      dateCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: '4B5563' } };
      dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9FAFB' } }; // Light gray
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // SUMMARY STATS CARDS (Row 6 & 7)
      summarySheet.getRow(6).height = 20;
      summarySheet.getRow(7).height = 28;

      // Card 1: Total Present Records
      summarySheet.mergeCells('B6:D6');
      summarySheet.getCell('B6').value = 'إجمالي الحضور المسجل لجميع الموظفين';
      summarySheet.getCell('B6').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '4B5563' } };
      summarySheet.getCell('B6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
      summarySheet.getCell('B6').alignment = { horizontal: 'center', vertical: 'middle' };

      summarySheet.mergeCells('B7:D7');
      summarySheet.getCell('B7').value = `${attendance.length} سجل حضور`;
      summarySheet.getCell('B7').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: '065F46' } }; // Dark green
      summarySheet.getCell('B7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } }; // Light green
      summarySheet.getCell('B7').alignment = { horizontal: 'center', vertical: 'middle' };

      // Card 2: Total Financial Deductions
      summarySheet.mergeCells('F6:L6');
      summarySheet.getCell('F6').value = 'إجمالي الخصومات المالية للجميع';
      summarySheet.getCell('F6').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '4B5563' } };
      summarySheet.getCell('F6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
      summarySheet.getCell('F6').alignment = { horizontal: 'center', vertical: 'middle' };

      summarySheet.mergeCells('F7:L7');
      const totalDeductionsSumEGP = attendance.reduce((acc, c) => {
        const emp = employees.find(e => c.userId ? e.id === c.userId : (c.roleCode && e.roleCode && e.roleCode.toLowerCase() === c.roleCode.toLowerCase()));
        const salary = Number(emp?.basicSalary) || 0;
        return acc + (c.deductionValue * (salary / 30));
      }, 0);
      summarySheet.getCell('F7').value = `${totalDeductionsSumEGP.toFixed(2)} ج.م`;
      summarySheet.getCell('F7').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: '991B1B' } }; // Dark red
      summarySheet.getCell('F7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } }; // Light red
      summarySheet.getCell('F7').alignment = { horizontal: 'center', vertical: 'middle' };

      // Add borders to Stats Cards
      const summaryCardBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'D1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
        left: { style: 'thin', color: { argb: 'D1D5DB' } },
        right: { style: 'thin', color: { argb: 'D1D5DB' } }
      };
      ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach(col => {
        summarySheet.getCell(`${col}6`).border = summaryCardBorder;
        summarySheet.getCell(`${col}7`).border = summaryCardBorder;
      });

      // Table Header Row (Row 9)
      summarySheet.getRow(9).height = 32;
      const summaryCols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
      const summaryHeaders = ['كود الموظف', 'اسم الموظف', 'القسم', 'الشيفت الحالي', 'أيام الحضور', 'إجمالي التأخير', 'أيام الخصم', 'إجمالي الخصم (ج.م)', 'نسبة الرأفة للـ HR', 'الخصم بعد الرأفة (ج.م)', 'أيام الإجازات'];
      
      summaryCols.forEach((col, idx) => {
        const cell = summarySheet.getCell(`${col}9`);
        cell.value = summaryHeaders[idx];
        cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C3AED' } }; // Primary Violet
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: '5B21B6' } },
          bottom: { style: 'thin', color: { argb: '5B21B6' } },
          left: { style: 'thin', color: { argb: '5B21B6' } },
          right: { style: 'thin', color: { argb: '5B21B6' } }
        };
      });

      // Loop over employees for summary rows
      let currentRow = 10;
      let grandPresent = 0;
      let grandDelay = 0;
      let grandDeductionsDays = 0;
      let grandDeductionsEGP = 0;
      let grandVacations = 0;

      filteredEmployees.forEach((emp, index) => {
        const stats = getEmployeeStats(emp.roleCode, emp.id);
        const row = summarySheet.getRow(currentRow);
        row.height = 24;

        row.getCell('B').value = emp.roleCode;
        row.getCell('C').value = emp.fullName;
        row.getCell('D').value = emp.department;
        row.getCell('E').value = (emp.activeShift === 'evening2') ? 'الشيفت المسائي (13:00)' : (emp.activeShift === 'evening') ? 'الشيفت المسائي' : 'الشيفت الصباحي';
        row.getCell('F').value = stats.presentDays;
        row.getCell('G').value = stats.totalDelay ? formatDelayToArabic(stats.totalDelay) : 'لا يوجد';
        row.getCell('H').value = stats.totalDeductions; // total deduction days
        const salary = Number(emp.basicSalary) || 0;
        const totalEGP = Number((stats.totalDeductions * (salary / 30)).toFixed(2));
        row.getCell('I').value = totalEGP; // total deduction EGP

        // Clemency dropdown (J)
        const clemencyCell = row.getCell('J');
        clemencyCell.value = ''; // Empty by default
        clemencyCell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"100%,90%,80%,75%,70%,60%,50%,40%,30%,25%,20%,10%,0%"']
        };

        // Deduction After Clemency (K) - formula: I * J (if J is blank, use full I)
        row.getCell('K').value = { formula: `IF(OR(ISBLANK(J${currentRow}), J${currentRow}=""), I${currentRow}, I${currentRow}*J${currentRow})` };

        row.getCell('L').value = stats.approvedVacationDays;

        grandPresent += stats.presentDays;
        grandDelay += stats.totalDelay;
        grandDeductionsDays += stats.totalDeductions;
        grandDeductionsEGP += totalEGP;
        grandVacations += stats.approvedVacationDays;

        const isEven = index % 2 === 0;
        const rowBg = isEven ? 'FFFFFF' : 'F9F5FF'; // Subtle lavender tint for alternating rows

        summaryCols.forEach(col => {
          const cell = row.getCell(col);
          cell.font = { name: 'Segoe UI', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } }
          };

          if (col === 'C' || col === 'D') {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }

          // Specific highlight for non-zero deductions on summary page
          if ((col === 'H' || col === 'I' || col === 'K') && stats.totalDeductions > 0) {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'B91C1C' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF2F2' } };
          }
        });

        currentRow++;
      });

      // Summary Grand Total Row
      const totalRow = summarySheet.getRow(currentRow);
      totalRow.height = 30;
      totalRow.getCell('B').value = 'الإجمالي العام للمؤسسة';
      summarySheet.mergeCells(`B${currentRow}:E${currentRow}`);

      totalRow.getCell('F').value = grandPresent;
      totalRow.getCell('G').value = grandDelay ? formatDelayToArabic(grandDelay) : 'لا يوجد';
      totalRow.getCell('H').value = grandDeductionsDays;
      totalRow.getCell('I').value = Number(grandDeductionsEGP.toFixed(2));
      totalRow.getCell('J').value = ''; // Clemency col doesn't need sum
      totalRow.getCell('K').value = { formula: `SUM(K10:K${currentRow - 1})` }; // Total of Deduction After Clemency
      totalRow.getCell('L').value = grandVacations;

      summaryCols.forEach(col => {
        const cell = totalRow.getCell(col);
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '4C1D95' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } }; // Soft violet
        cell.border = {
          top: { style: 'medium', color: { argb: '7C3AED' } },
          bottom: { style: 'double', color: { argb: '7C3AED' } },
          left: { style: 'thin', color: { argb: 'E5E7EB' } },
          right: { style: 'thin', color: { argb: 'E5E7EB' } }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Style the merged part borders
      ['B', 'C', 'D', 'E'].forEach(col => {
        const cell = totalRow.getCell(col);
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '4C1D95' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } };
        cell.border = {
          top: { style: 'medium', color: { argb: '7C3AED' } },
          bottom: { style: 'double', color: { argb: '7C3AED' } },
          left: { style: 'thin', color: { argb: 'E5E7EB' } },
          right: { style: 'thin', color: { argb: 'E5E7EB' } }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });


      // ==========================================
      // 2. ADD INDIVIDUAL SHEETS FOR EACH EMPLOYEE
      // ==========================================
      filteredEmployees.forEach(emp => {
        // Build Excel-safe tab name (max 31 chars, no forbidden chars \ / ? * : [ ])
        let safeName = emp.fullName.replace(/[\\\/\?\*：\:\[\]]/g, '');
        let sheetName = `${safeName.slice(0, 15)} (${emp.roleCode})`;
        if (sheetName.length > 31) {
          sheetName = `${safeName.slice(0, 12)}... (${emp.roleCode})`;
        }

        const empSheet = workbook.addWorksheet(sheetName, {
          views: [{ rightToLeft: true }]
        });

        // Column settings
        empSheet.getColumn('A').width = 4;   // Spacing
        empSheet.getColumn('B').width = 16;  // Date
        empSheet.getColumn('C').width = 18;  // Check-in
        empSheet.getColumn('D').width = 18;  // Check-out
        empSheet.getColumn('E').width = 18;  // Delay minutes
        empSheet.getColumn('F').width = 18;  // Deduction days
        empSheet.getColumn('G').width = 24;  // Deduction EGP
        empSheet.getColumn('H').width = 24;  // Clemency %
        empSheet.getColumn('I').width = 24;  // Deduction after clemency
        empSheet.getColumn('J').width = 28;  // Deduction reason
        empSheet.getColumn('K').width = 18;  // Status
        empSheet.getColumn('L').width = 18;  // Shift (NEW!)

        // Employee Sheet Title
        empSheet.getRow(2).height = 36;
        empSheet.mergeCells('B2:L2');
        const empTitleCell = empSheet.getCell('B2');
        empTitleCell.value = `تقرير تفاصيل الحضور والانصراف: ${emp.fullName}`;
        empTitleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFF' } };
        empTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '5B21B6' } }; // Deep violet
        empTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Employee Subtitle Information
        empSheet.getRow(3).height = 24;
        empSheet.mergeCells('B3:L3');
        const empSubtitleCell = empSheet.getCell('B3');
        empSubtitleCell.value = `كود الموظف: ${emp.roleCode}  |  القسم: ${emp.department}  |  الفترة: من ${startDate || '---'} إلى ${endDate || '---'}`;
        empSubtitleCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '4C1D95' } };
        empSubtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } };
        empSubtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const stats = getEmployeeStats(emp.roleCode, emp.id);

        // Statistics Visual Cards for Individual Employee
        empSheet.getRow(5).height = 20;
        empSheet.getRow(6).height = 28;

        // Card 1: أيام الحضور
        empSheet.mergeCells('B5:C5');
        empSheet.getCell('B5').value = 'أيام الحضور';
        empSheet.getCell('B5').font = { name: 'Segoe UI', size: 9, color: { argb: '4B5563' } };
        empSheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
        empSheet.getCell('B5').alignment = { horizontal: 'center', vertical: 'middle' };

        empSheet.mergeCells('B6:C6');
        empSheet.getCell('B6').value = `${stats.presentDays} يوم`;
        empSheet.getCell('B6').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: '065F46' } };
        empSheet.getCell('B6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
        empSheet.getCell('B6').alignment = { horizontal: 'center', vertical: 'middle' };

        // Card 2: دقائق التأخير
        empSheet.mergeCells('D5:F5');
        empSheet.getCell('D5').value = 'دقائق التأخير';
        empSheet.getCell('D5').font = { name: 'Segoe UI', size: 9, color: { argb: '4B5563' } };
        empSheet.getCell('D5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
        empSheet.getCell('D5').alignment = { horizontal: 'center', vertical: 'middle' };

        empSheet.mergeCells('D6:F6');
        empSheet.getCell('D6').value = stats.totalDelay ? formatDelayToArabic(stats.totalDelay) : 'لا يوجد';
        empSheet.getCell('D6').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: '92400E' } };
        empSheet.getCell('D6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
        empSheet.getCell('D6').alignment = { horizontal: 'center', vertical: 'middle' };

        // Card 3: إجمالي الخصومات المالية
        empSheet.mergeCells('G5:I5');
        empSheet.getCell('G5').value = 'إجمالي الخصومات المسجلة';
        empSheet.getCell('G5').font = { name: 'Segoe UI', size: 9, color: { argb: '4B5563' } };
        empSheet.getCell('G5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
        empSheet.getCell('G5').alignment = { horizontal: 'center', vertical: 'middle' };

        empSheet.mergeCells('G6:I6');
        const salaryVal = Number(emp.basicSalary) || 0;
        empSheet.getCell('G6').value = `${Number((stats.totalDeductions * (salaryVal / 30)).toFixed(2))} ج.م`;
        empSheet.getCell('G6').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: '991B1B' } };
        empSheet.getCell('G6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
        empSheet.getCell('G6').alignment = { horizontal: 'center', vertical: 'middle' };

        // Card 4: إجازات معتمدة
        empSheet.mergeCells('J5:L5');
        empSheet.getCell('J5').value = 'أيام الإجازات';
        empSheet.getCell('J5').font = { name: 'Segoe UI', size: 9, color: { argb: '4B5563' } };
        empSheet.getCell('J5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
        empSheet.getCell('J5').alignment = { horizontal: 'center', vertical: 'middle' };

        empSheet.mergeCells('J6:L6');
        empSheet.getCell('J6').value = `${stats.approvedVacationDays} يوم`;
        empSheet.getCell('J6').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: '1E3A8A' } };
        empSheet.getCell('J6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DBEAFE' } };
        empSheet.getCell('J6').alignment = { horizontal: 'center', vertical: 'middle' };

        // Add border style to cards
        const cardStyleBorder: Partial<ExcelJS.Borders> = {
          top: { style: 'thin', color: { argb: 'D1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
          left: { style: 'thin', color: { argb: 'D1D5DB' } },
          right: { style: 'thin', color: { argb: 'D1D5DB' } }
        };
        ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach(col => {
          empSheet.getCell(`${col}5`).border = cardStyleBorder;
          empSheet.getCell(`${col}6`).border = cardStyleBorder;
        });

        // Header for Logs (Row 8)
        empSheet.getRow(8).height = 28;
        const detailCols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
        const detailHeaders = ['التاريخ', 'وقت الحضور', 'وقت الانصراف', 'التأخير', 'عدد أيام الخصم', 'قيمة الخصم بالجنيه', 'نسبة الرأفة للـ HR', 'الخصم بعد الرأفة', 'سبب الخصم', 'الحالة الحضور', 'الشيفت اليومي'];

        detailCols.forEach((col, idx) => {
          const cell = empSheet.getCell(`${col}8`);
          cell.value = detailHeaders[idx];
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C3AED' } }; // Primary purple
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: '6D28D9' } },
            bottom: { style: 'thin', color: { argb: '6D28D9' } },
            left: { style: 'thin', color: { argb: '6D28D9' } },
            right: { style: 'thin', color: { argb: '6D28D9' } }
          };
        });

        const empLogs = stats.logs || [];

        if (empLogs.length === 0) {
          // If no logs, write elegant empty state row
          empSheet.getRow(9).height = 40;
          empSheet.mergeCells('B9:L9');
          const noLogsCell = empSheet.getCell('B9');
          noLogsCell.value = 'لا توجد سجلات حضور مسجلة لهذا الموظف خلال الفترة المحددة';
          noLogsCell.font = { name: 'Segoe UI', size: 11, italic: true, color: { argb: '6B7280' } };
          noLogsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9FAFB' } };
          noLogsCell.alignment = { horizontal: 'center', vertical: 'middle' };
          noLogsCell.border = {
            top: { style: 'thin', color: { argb: 'D1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
            left: { style: 'thin', color: { argb: 'D1D5DB' } },
            right: { style: 'thin', color: { argb: 'D1D5DB' } }
          };
        } else {
          // Sort logs chronologically
          const sortedLogs = [...empLogs].sort((a, b) => a.date.localeCompare(b.date));

          let logIndex = 9;
          sortedLogs.forEach((log, idx) => {
            const row = empSheet.getRow(logIndex);
            row.height = 24;

            const checkInStr = log.checkInTime ? formatTimeTo12Hour(new Date(log.checkInTime.seconds * 1000)) : '---';
            const checkOutStr = log.checkOutTime ? formatTimeTo12Hour(new Date(log.checkOutTime.seconds * 1000)) : '---';
            const delayText = log.delayMinutes ? formatDelayToArabic(log.delayMinutes) : 'لا يوجد';
            const logStatus = log.status === 'Late' ? 'تأخير حضور' : 'حضور طبيعي';

            const salary = Number(emp.basicSalary) || 0;
            const originalDeductionEGP = Number((log.deductionValue * (salary / 30)).toFixed(2));

            row.getCell('B').value = log.date;
            row.getCell('C').value = checkInStr;
            row.getCell('D').value = checkOutStr;
            row.getCell('E').value = delayText;
            row.getCell('F').value = log.deductionValue || 0;
            row.getCell('G').value = originalDeductionEGP;
            
            // Empty cell for HR clemency drop-down (H)
            const clemencyCell = row.getCell('H');
            clemencyCell.value = ''; // Empty by default as requested
            clemencyCell.dataValidation = {
              type: 'list',
              allowBlank: true,
              formulae: ['"100%,90%,80%,75%,70%,60%,50%,40%,30%,25%,20%,10%,0%"']
            };

            // Deduction after clemency (I) - formula: G * H (if H is blank, use full G)
            row.getCell('I').value = { formula: `IF(OR(ISBLANK(H${logIndex}), H${logIndex}=""), G${logIndex}, G${logIndex}*H${logIndex})` };
            
            row.getCell('J').value = log.deductionReason || '---';
            row.getCell('K').value = logStatus;
            row.getCell('L').value = (log.shift === 'evening2') ? 'الشيفت المسائي (13:00)' : (log.shift === 'evening') ? 'الشيفت المسائي' : 'الشيفت الصباحي';

            const isEven = idx % 2 === 0;
            const rowBg = isEven ? 'FFFFFF' : 'F9F5FF';

            detailCols.forEach(col => {
              const cell = row.getCell(col);
              cell.font = { name: 'Segoe UI', size: 10 };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
              cell.border = {
                top: { style: 'thin', color: { argb: 'E5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
                left: { style: 'thin', color: { argb: 'E5E7EB' } },
                right: { style: 'thin', color: { argb: 'E5E7EB' } }
              };

              if (col === 'J') {
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
              } else {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
              }

              // Highlight late arrival
              if (log.status === 'Late' && (col === 'E' || col === 'K')) {
                cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'D97706' } }; // Amber
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
              }

              // Highlight deductions
              if ((log.deductionValue || 0) > 0 && (col === 'F' || col === 'G' || col === 'I')) {
                cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'DC2626' } }; // Red
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
              }
            });

            logIndex++;
          });

          // Individual Employee Total Summary Row at bottom
          const empTotalRow = empSheet.getRow(logIndex);
          empTotalRow.height = 28;
          empTotalRow.getCell('B').value = 'إجمالي السجل التفصيلي';
          empSheet.mergeCells(`B${logIndex}:E${logIndex}`); // merged B, C, D, E

          empTotalRow.getCell('F').value = stats.totalDeductions; // total days
          const empSalary = Number(emp.basicSalary) || 0;
          const totalOriginalDeductionsEGP = Number((stats.totalDeductions * (empSalary / 30)).toFixed(2));
          empTotalRow.getCell('G').value = totalOriginalDeductionsEGP; // total EGP
          
          empTotalRow.getCell('H').value = '';
          // Let's write a formula for total deduction after clemency: SUM of column I!
          empTotalRow.getCell('I').value = { formula: `SUM(I9:I${logIndex - 1})` };
          
          empTotalRow.getCell('J').value = 'إجمالي الخصومات المالية';
          empTotalRow.getCell('K').value = '';

          detailCols.forEach(col => {
            const cell = empTotalRow.getCell(col);
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '5B21B6' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2F6' } };
            cell.border = {
              top: { style: 'medium', color: { argb: '7C3AED' } },
              bottom: { style: 'double', color: { argb: '7C3AED' } },
              left: { style: 'thin', color: { argb: 'E5E7EB' } },
              right: { style: 'thin', color: { argb: 'E5E7EB' } }
            };

            if (col === 'J') {
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
            } else {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
          });

          // Style merged parts B, C, D, E of total row
          ['B', 'C', 'D', 'E'].forEach(col => {
            const cell = empTotalRow.getCell(col);
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '5B21B6' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2F6' } };
            cell.border = {
              top: { style: 'medium', color: { argb: '7C3AED' } },
              bottom: { style: 'double', color: { argb: '7C3AED' } },
              left: { style: 'thin', color: { argb: 'E5E7EB' } },
              right: { style: 'thin', color: { argb: 'E5E7EB' } }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          });
        }
      });

      // Write buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `تقرير_حضور_AXIS_${startDate || 'بداية'}_إلى_${endDate || 'نهاية'}.xlsx`;
      anchor.click();
      
      window.URL.revokeObjectURL(url);
      
      toast.dismiss('excel-export');
      toast.success('تم تصدير ملف الـ Excel الفاخر بنجاح!');
    } catch (error) {
      toast.dismiss('excel-export');
      console.error("Excel Export Error:", error);
      toast.error("فشل تصدير ملف الـ Excel، يرجى المحاولة مرة أخرى.");
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
          <Calendar size={32} />
        </div>
        <h2 className="text-xl font-bold text-red-400">غير مصرح بالوصول</h2>
        <p className="text-base text-[#A78BFA] mt-2">عذراً، هذه الصفحة مخصصة لمدراء النظام فقط ولا يسمح للموظفين بالاطلاع على سجلات الحضور العامة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700 pb-20" dir="rtl">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h3 className="text-3xl font-black tracking-tight mb-1 text-white">سجلات الحضور التفصيلية</h3>
          <p className="text-[#A78BFA] text-base font-medium">مراقبة دقيقة لجميع تحركات الموظفين والخصومات المالية اليومية والشهرية</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 shrink-0 w-full sm:w-auto max-w-sm">
          <button
            onClick={() => {
              setActiveTab('daily');
              setSearchTerm('');
            }}
            className={cn(
              "flex-1 px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'daily'
                ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20"
                : "text-[#A78BFA] hover:text-white"
            )}
          >
            <Clock size={15} />
            سجلات يومية
          </button>
          <button
            onClick={() => {
              setActiveTab('monthly');
              setSearchTerm('');
            }}
            className={cn(
              "flex-1 px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'monthly'
                ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20"
                : "text-[#A78BFA] hover:text-white"
            )}
          >
            <CalendarDays size={15} />
            سجلات شهرية
          </button>
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      <AnimatePresence mode="wait">
        {activeTab === 'daily' ? (
          <motion.div
            key="daily-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Daily Date Navigation Card */}
            <div className="bg-white/5 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
              <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#7C3AED]/20 rounded-xl flex items-center justify-center text-[#C084FC]">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#A78BFA] font-bold block">اليوم المعروض</span>
                    <h4 className="text-lg font-black text-white">{formatArabicDate(selectedDailyDate)}</h4>
                  </div>
                </div>

                {/* Date Picker Button Wrapper */}
                <div className="relative group shrink-0">
                  <input
                    type="date"
                    value={selectedDailyDate}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDailyDate(e.target.value);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    title="اختر تاريخاً محدداً"
                  />
                  <div className="bg-white/5 hover:bg-white/10 text-white p-2.5 rounded-xl border border-white/10 transition-all flex items-center justify-center">
                    <CalendarDays size={18} className="text-[#A78BFA]" />
                  </div>
                </div>
              </div>

              {/* Day Navigators */}
              <div className="flex items-center gap-3 w-full md:w-auto justify-center">
                <button
                  onClick={handlePrevDay}
                  className="bg-white/5 hover:bg-white/10 text-white px-4 py-3 rounded-xl border border-white/10 transition-all text-sm font-bold flex items-center gap-2 active:scale-95"
                >
                  <ChevronRight size={16} />
                  <span>اليوم السابق</span>
                </button>

                <button
                  onClick={handleGoToToday}
                  disabled={selectedDailyDate === formatCairoDate(new Date())}
                  className={cn(
                    "px-5 py-3 rounded-xl transition-all text-sm font-black border active:scale-95",
                    selectedDailyDate === formatCairoDate(new Date())
                      ? "bg-[#7C3AED]/10 text-[#A78BFA]/50 border-white/5"
                      : "bg-[#7C3AED]/20 hover:bg-[#7C3AED] text-white border-[#7C3AED]/30"
                  )}
                >
                  اليوم الحالي
                </button>

                <button
                  onClick={handleNextDay}
                  disabled={selectedDailyDate >= formatCairoDate(new Date())}
                  className={cn(
                    "px-4 py-3 rounded-xl border transition-all text-sm font-bold flex items-center gap-2 active:scale-95",
                    selectedDailyDate >= formatCairoDate(new Date())
                      ? "opacity-30 cursor-not-allowed bg-white/5 text-white/50 border-white/5"
                      : "bg-white/5 hover:bg-white/10 text-white border-white/10"
                  )}
                >
                  <span>اليوم التالي</span>
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>

            {/* Daily Statistics Cards */}
            {(() => {
              const stats = getDailyStats(selectedDailyDate);
              const todayStr = formatCairoDate(new Date());
              const isToday = selectedDailyDate === todayStr;
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div 
                    onClick={() => setDailyStatusFilter(dailyStatusFilter === 'present' ? 'all' : 'present')}
                    className={cn(
                      "p-5 rounded-3xl flex items-center justify-between shadow-lg transition-all cursor-pointer select-none active:scale-95",
                      dailyStatusFilter === 'present' 
                        ? "bg-emerald-500/20 border-2 border-emerald-400 ring-2 ring-emerald-400/20 scale-[1.02]" 
                        : "bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40"
                    )}
                  >
                    <div>
                      <p className="text-[10px] text-emerald-400 font-bold mb-1">المتواجدون اليوم</p>
                      <h4 className="text-3xl font-black text-emerald-400 font-mono">
                        {stats.totalPresent} <span className="text-sm opacity-60 font-sans">/ {employees.length - stats.totalExempt}</span>
                      </h4>
                      <p className="text-[10px] text-white/50 mt-1 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        سجلوا حضوراً فعلياً
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 size={24} />
                    </div>
                  </div>

                  <div 
                    onClick={() => setDailyStatusFilter(dailyStatusFilter === 'late' ? 'all' : 'late')}
                    className={cn(
                      "p-5 rounded-3xl flex items-center justify-between shadow-lg transition-all cursor-pointer select-none active:scale-95",
                      dailyStatusFilter === 'late' 
                        ? "bg-amber-500/20 border-2 border-amber-400 ring-2 ring-amber-400/20 scale-[1.02]" 
                        : "bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40"
                    )}
                  >
                    <div>
                      <p className="text-[10px] text-amber-400 font-bold mb-1">حالات التأخير</p>
                      <h4 className="text-3xl font-black text-amber-400 font-mono">{stats.totalLate}</h4>
                      <p className="text-[10px] text-white/50 mt-1">حضور بعد مواعيد العمل</p>
                    </div>
                    <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 shrink-0">
                      <AlertCircle size={24} />
                    </div>
                  </div>

                  <div 
                    onClick={() => setDailyStatusFilter(dailyStatusFilter === 'vacation' ? 'all' : 'vacation')}
                    className={cn(
                      "p-5 rounded-3xl flex items-center justify-between shadow-lg transition-all cursor-pointer select-none active:scale-95",
                      dailyStatusFilter === 'vacation' 
                        ? "bg-purple-500/20 border-2 border-purple-400 ring-2 ring-purple-400/20 scale-[1.02]" 
                        : "bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/40"
                    )}
                  >
                    <div>
                      <p className="text-[10px] text-purple-400 font-bold mb-1">في إجازات معتمدة</p>
                      <h4 className="text-3xl font-black text-purple-400 font-mono">{stats.totalVacation}</h4>
                      <p className="text-[10px] text-white/50 mt-1">إجازات اعتيادية/مرضية</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 shrink-0">
                      <Coffee size={24} />
                    </div>
                  </div>

                  <div 
                    onClick={() => setDailyStatusFilter(dailyStatusFilter === 'absent' ? 'all' : 'absent')}
                    className={cn(
                      "p-5 rounded-3xl flex items-center justify-between shadow-lg transition-all cursor-pointer select-none active:scale-95",
                      isToday ? (
                        dailyStatusFilter === 'absent' 
                          ? "bg-amber-500/20 border-2 border-amber-400 ring-2 ring-amber-400/20 scale-[1.02]" 
                          : "bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40"
                      ) : (
                        dailyStatusFilter === 'absent' 
                          ? "bg-rose-500/20 border-2 border-rose-400 ring-2 ring-rose-400/20 scale-[1.02]" 
                          : "bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/40"
                      )
                    )}
                  >
                    <div>
                      <p className={cn(
                        "text-[10px] font-bold mb-1",
                        isToday ? "text-amber-400" : "text-rose-400"
                      )}>
                        {isToday ? "لم يحضروا بعد" : "الغياب اليوم"}
                      </p>
                      <h4 className={cn(
                        "text-3xl font-black font-mono",
                        isToday ? "text-amber-400" : "text-rose-400"
                      )}>{stats.totalAbsent}</h4>
                      <p className="text-[10px] text-white/50 mt-1">
                        {isToday ? "لم يسجلوا حضوراً حتى الآن" : "بدون إجازة أو عذر"}
                      </p>
                    </div>
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                      isToday ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"
                    )}>
                      {isToday ? <Clock size={24} /> : <XCircle size={24} />}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Daily Search and List */}
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div className="relative max-w-lg flex-1">
                  <Search size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-[#7C3AED]" />
                  <input
                    placeholder="البحث باسم الموظف، الكود أو القسم..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-6 text-base focus:outline-none focus:border-[#C084FC]/50 transition-all placeholder:text-[#A78BFA]/30 text-white shadow-inner"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {dailyStatusFilter !== 'all' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-between gap-3 bg-[#7C3AED]/20 border border-[#7C3AED]/30 px-5 py-3 rounded-2xl shrink-0"
                  >
                    <span className="text-sm font-black text-white">
                      تصفية: {" "}
                      <span className="text-[#C084FC]">
                        {dailyStatusFilter === 'present' && "المتواجدون اليوم"}
                        {dailyStatusFilter === 'late' && "حالات التأخير"}
                        {dailyStatusFilter === 'vacation' && "الموظفون في إجازة"}
                        {dailyStatusFilter === 'absent' && "الغياب اليوم"}
                      </span>
                    </span>
                    <button 
                      onClick={() => setDailyStatusFilter('all')}
                      className="text-[10px] font-black bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl border border-white/10 transition-all active:scale-95"
                    >
                      إلغاء التصفية
                    </button>
                  </motion.div>
                )}
              </div>

              {/* Table of Daily Statuses */}
              <section className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#7C3AED]/30 to-transparent" />
                
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-right border-collapse min-w-[900px]">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className="py-6 px-8 text-sm text-[#A78BFA] font-black uppercase tracking-wider">الموظف</th>
                        <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">الحالة اليومية</th>
                        <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">نوع الشيفت</th>
                        <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">وقت الحضور</th>
                        <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">وقت الانصراف</th>
                        <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">الخصم والتأخير</th>
                        <th className="py-6 px-8 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-left">التفاصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let filteredDaily = employees.filter(emp => 
                          emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.roleCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.department.toLowerCase().includes(searchTerm.toLowerCase())
                        );

                        if (dailyStatusFilter !== 'all') {
                          filteredDaily = filteredDaily.filter(emp => {
                            const status = getEmployeeDailyStatus(emp, selectedDailyDate);
                            if (dailyStatusFilter === 'present') {
                              return status.type === 'present' || status.type === 'late';
                            }
                            return status.type === dailyStatusFilter;
                          });
                        }

                        if (filteredDaily.length === 0) {
                          return (
                            <tr>
                              <td colSpan={7} className="py-20 text-center text-[#A78BFA] opacity-50 italic">
                                لا توجد سجلات مطابقة للبحث المحدد
                              </td>
                            </tr>
                          );
                        }

                        return filteredDaily.map((emp) => {
                          const status = getEmployeeDailyStatus(emp, selectedDailyDate);
                          
                          return (
                            <motion.tr
                              layout
                              key={emp.id}
                              className="group hover:bg-white/[0.03] transition-all border-b border-white/5"
                            >
                              {/* Employee Profile */}
                              <td className="py-5 px-8">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED]/30 to-[#C084FC]/10 flex items-center justify-center text-[#C084FC] border border-[#7C3AED]/20 font-black">
                                    {emp.fullName.charAt(0)}
                                  </div>
                                  <div>
                                    <h5 className="font-black text-base text-white group-hover:text-[#C084FC] transition-colors">{emp.fullName}</h5>
                                    <p className="text-[10px] text-[#A78BFA] font-mono">{emp.roleCode} • {emp.department}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Daily Status Badge */}
                              <td className="py-5 px-6 text-center">
                                {status.type === 'present' && (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    حاضر (في الموعد)
                                  </span>
                                )}
                                {status.type === 'late' && (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    حاضر (متأخر)
                                  </span>
                                )}
                                {status.type === 'vacation' && (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                    {status.label}
                                  </span>
                                )}
                                {status.type === 'permission' && (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                    إذن حضور معتمد
                                  </span>
                                )}
                                {status.type === 'weekend' && (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-white/5 text-white/50 border border-white/5">
                                    عطلة نهاية الأسبوع
                                  </span>
                                )}
                                {status.type === 'exempt' && (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-[#C084FC]/10 text-[#C084FC] border border-[#C084FC]/20">
                                    {status.label}
                                  </span>
                                )}
                                {status.type === 'absent' && (
                                  <span className={cn(
                                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black border",
                                    status.label === 'لم يحضر بعد'
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  )}>
                                    {status.label}
                                  </span>
                                )}
                              </td>

                              {/* Shift Type */}
                              <td className="py-5 px-6 text-center">
                                {(() => {
                                  const shiftVal = status.log?.shift || emp.activeShift || 'morning';
                                  if (shiftVal === 'evening2') {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">
                                        الشيفت المسائي (13:00)
                                      </span>
                                    );
                                  }
                                  return shiftVal === 'evening' ? (
                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                      الشيفت المسائي
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black bg-indigo-500/10 text-[#C084FC] border border-indigo-500/20">
                                      الشيفت الصباحي
                                    </span>
                                  );
                                })()}
                              </td>

                              {/* Check-In Time */}
                              <td className="py-5 px-6 text-center">
                                {status.log && status.log.checkInTime ? (
                                  <span className="font-mono text-sm font-bold text-white bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
                                    {formatTimeTo12Hour(new Date(status.log.checkInTime.seconds * 1000))}
                                  </span>
                                ) : (
                                  <span className="text-white/30 text-sm">---</span>
                                )}
                              </td>

                              {/* Check-Out Time */}
                              <td className="py-5 px-6 text-center">
                                {status.log ? (
                                  status.log.checkOutTime ? (
                                    <span className="font-mono text-sm font-bold text-white bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
                                      {formatTimeTo12Hour(new Date(status.log.checkOutTime.seconds * 1000))}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/5 px-2.5 py-1 rounded-lg border border-emerald-500/10 animate-pulse">
                                      قيد الدوام الحالي
                                    </span>
                                  )
                                ) : (
                                  <span className="text-white/30 text-sm">---</span>
                                )}
                              </td>

                              {/* Deductions and Delays */}
                              <td className="py-5 px-6 text-center">
                                {status.log && (status.log.delayMinutes || status.log.deductionValue) ? (
                                  <div className="text-sm space-y-1">
                                    {status.log.delayMinutes > 0 && (
                                      <p className="text-orange-400 font-bold">تأخير {formatDelayToArabic(status.log.delayMinutes)}</p>
                                    )}
                                    {status.log.deductionValue > 0 ? (
                                      <div className="bg-rose-500/5 p-1.5 rounded-lg border border-rose-500/10">
                                        <p className="text-rose-400 font-black">خصم {status.log.deductionValue} يوم</p>
                                        <p className="text-rose-300 text-[10px] font-bold">
                                          ({((status.log.deductionValue * (Number(emp.basicSalary) || 0)) / 30).toFixed(2)} ج.م)
                                        </p>
                                      </div>
                                    ) : (
                                      <p className="text-emerald-400 text-[10px]">لا يوجد خصومات</p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-white/30 text-sm">---</span>
                                )}
                              </td>

                              {/* Detail trigger */}
                              <td className="py-5 px-8 text-left">
                                <button
                                  className="bg-white/5 hover:bg-[#7C3AED] text-[#A78BFA] hover:text-white p-2.5 rounded-xl transition-all border border-white/5 flex items-center justify-center mx-auto"
                                  onClick={() => {
                                    setSelectedEmployeeId(emp.id);
                                  }}
                                  title="عرض كشف الشهر الكامل للموظف"
                                >
                                  <ChevronLeft size={16} />
                                </button>
                              </td>
                            </motion.tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="monthly-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Filters and Action panel */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6 bg-white/5 p-6 rounded-[2rem] border border-white/10 shadow-lg">
              <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 shrink-0">
                  <button 
                    onClick={() => setDateFilter('current')}
                    className={cn("px-5 py-2.5 rounded-xl text-sm font-black transition-all", dateFilter === 'current' ? "bg-[#7C3AED] text-white shadow-md" : "text-[#A78BFA] hover:text-white")}
                  >الشهر الحالي</button>
                  <button 
                    onClick={() => setDateFilter('last')}
                    className={cn("px-5 py-2.5 rounded-xl text-sm font-black transition-all", dateFilter === 'last' ? "bg-[#7C3AED] text-white shadow-md" : "text-[#A78BFA] hover:text-white")}
                  >الشهر الماضي</button>
                  <button 
                    onClick={() => setDateFilter('custom')}
                    className={cn("px-5 py-2.5 rounded-xl text-sm font-black transition-all", dateFilter === 'custom' ? "bg-[#7C3AED] text-white shadow-md" : "text-[#A78BFA] hover:text-white")}
                  >تاريخ مخصص</button>
                </div>
              </div>

              <button 
                onClick={exportToExcel}
                className="w-full lg:w-auto bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
              >
                <Download size={16} />
                تصدير تقرير Excel الفاخر
              </button>
            </div>

            {/* Custom Date Selectors */}
            <AnimatePresence>
              {dateFilter === 'custom' && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/5 p-6 rounded-[2rem] border border-white/10 overflow-hidden"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] text-[#A78BFA] font-black uppercase tracking-wider pr-1">من تاريخ</label>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-[#12071F] border border-white/10 rounded-xl py-3 px-5 text-white text-sm font-mono outline-none focus:border-[#7C3AED] transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[#A78BFA] font-black uppercase tracking-wider pr-1">إلى تاريخ</label>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full bg-[#12071F] border border-white/10 rounded-xl py-3 px-5 text-white text-sm font-mono outline-none focus:border-[#7C3AED] transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Monthly Search */}
            <div className="relative max-w-lg">
              <Search size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-[#7C3AED]" />
              <input 
                placeholder="ابحث باسم الموظف أو الكود أو القسم..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-6 text-base focus:outline-none focus:border-[#C084FC]/50 transition-all placeholder:text-[#A78BFA]/30 text-white shadow-inner"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Employees Detailed Table */}
            <section className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#7C3AED]/30 to-transparent" />
              
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-right border-collapse min-w-[950px]">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <th className="py-6 px-8 text-sm text-[#A78BFA] font-black uppercase tracking-wider">الموظف</th>
                      <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">أيام الحضور</th>
                      <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">إجمالي التأخير</th>
                      <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">أيام الإجازات</th>
                      <th className="py-6 px-6 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-center">قيمة الخصومات</th>
                      <th className="py-6 px-8 text-sm text-[#A78BFA] font-black uppercase tracking-wider text-left">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-20 text-center text-[#A78BFA] opacity-50 italic">لا توجد سجلات مطابقة لهذه الفترة</td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const stats = getEmployeeStats(emp.roleCode, emp.id);
                        return (
                          <motion.tr 
                            layout 
                            key={emp.id} 
                            className="group hover:bg-white/[0.03] transition-all border-b border-white/5"
                          >
                            <td className="py-5 px-8">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED]/30 to-[#C084FC]/10 flex items-center justify-center text-[#C084FC] border border-[#7C3AED]/20 font-black">
                                  {emp.fullName.charAt(0)}
                                </div>
                                <div>
                                  <h5 className="font-black text-base text-white group-hover:text-[#C084FC] transition-colors">{emp.fullName}</h5>
                                  <p className="text-[10px] text-[#A78BFA] font-mono">{emp.roleCode} • {emp.department}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-5 px-6 text-center">
                              <span className="font-black text-lg text-white font-mono">{stats.presentDays}</span>
                              <span className="text-[10px] text-[#A78BFA] block">يوم فعلي</span>
                            </td>
                            <td className="py-5 px-6 text-center">
                              <span className="font-black text-lg text-orange-400 font-mono">{stats.totalDelay}</span>
                              <span className="text-[10px] text-[#A78BFA] block">دقيقة تأخير</span>
                            </td>
                            <td className="py-5 px-6 text-center">
                              <span className="font-black text-lg text-[#C084FC] font-mono">{stats.approvedVacationDays}</span>
                              <span className="text-[10px] text-[#A78BFA] block">يوم إجازة</span>
                            </td>
                            <td className="py-5 px-6 text-center">
                              <div className="inline-flex flex-col items-center">
                                <span className="font-black text-lg text-rose-400 font-mono">-{stats.totalDeductions}</span>
                                <span className="text-[10px] text-[#A78BFA] block">جنيه مصري</span>
                              </div>
                            </td>
                            <td className="py-5 px-8 text-left">
                              <button 
                                className="bg-[#7C3AED]/20 hover:bg-[#7C3AED] text-white px-5 py-2.5 rounded-xl text-sm font-black transition-all border border-[#7C3AED]/30 flex items-center gap-1.5 shadow-md justify-center"
                                onClick={() => {
                                  setSelectedEmployeeId(emp.id);
                                }}
                              >
                                <FileText size={14} />
                                عرض التفاصيل
                              </button>
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Full Detailed History List */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#7C3AED]/20 rounded-xl flex items-center justify-center text-[#7C3AED]">
                  <TableIcon size={18} />
                </div>
                <h4 className="text-lg font-black text-white">كشف الحركات التفصيلي الأخير</h4>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {attendance.slice(0, 50).map((log, i) => {
                  const emp = employees.find(e => log.userId ? e.id === log.userId : (log.roleCode && e.roleCode && e.roleCode.toLowerCase() === log.roleCode.toLowerCase()));
                  return (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.01 }}
                      key={log.id} 
                      className="bg-[#1E0F33]/40 backdrop-blur-sm border border-white/5 p-5 rounded-[1.5rem] flex items-center justify-between group hover:border-[#7C3AED]/30 transition-all shadow-md"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-white/5 px-3 py-2 rounded-xl border border-white/10 text-center min-w-[90px]">
                          <p className="text-sm font-bold text-[#A78BFA] font-mono mb-0.5">{log.date.split('-')[1]}-{log.date.split('-')[2]}</p>
                          <p className="text-[9px] opacity-40 font-mono tracking-tighter">{log.date.split('-')[0]}</p>
                        </div>
                        <div>
                          <h5 className="font-black text-base text-white">{emp?.fullName || '---'}</h5>
                          <p className="text-[10px] text-[#A78BFA]">{log.roleCode} • {emp?.department || '---'}</p>
                        </div>
                      </div>

                      <div className="hidden md:flex items-center gap-8">
                        <div className="text-center">
                          <p className="text-[9px] text-[#A78BFA] font-black uppercase mb-0.5">وقت الحضور</p>
                          <p className="font-mono text-sm text-white bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                            {log.checkInTime ? formatTimeTo12Hour(new Date(log.checkInTime.seconds * 1000)) : '---'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-[#A78BFA] font-black uppercase mb-0.5">الخصم</p>
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className={cn("font-black text-sm font-mono bg-white/5 px-2.5 py-1 rounded-lg border border-white/5", log.deductionValue > 0 ? "text-rose-400" : "text-emerald-400")}>
                              {log.deductionValue > 0 ? (
                                <div className="text-right">
                                  <span>{log.deductionValue} يوم</span>
                                  <span className="block text-[9px] text-rose-300 font-bold">({((log.deductionValue * (Number(emp?.basicSalary) || 0)) / 30).toFixed(2)} ج.م)</span>
                                </div>
                              ) : 'لا يوجد'}
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingLog(log);
                                  setEditDeductionValue(log.deductionValue || 0);
                                  setEditDeductionReason(log.deductionReason || '');
                                }}
                                className="p-1.5 bg-white/5 rounded-lg hover:bg-[#7C3AED]/30 hover:text-white transition-all text-[#A78BFA]"
                                title="تعديل الخصم"
                              >
                                <Edit size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-[#A78BFA] font-black uppercase mb-0.5">الحالة</p>
                          <span className={cn(
                            "text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-tighter",
                            log.status === 'On Time' || log.status === 'حاضر' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          )}>{log.status === 'Late' ? 'تأخير' : 'في الموعد'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {log.deductionReason && (
                          <div className="bg-rose-500/5 px-3 py-1.5 rounded-lg border border-rose-500/10 hidden lg:block">
                            <p className="text-[9px] text-rose-300 font-bold italic line-clamp-1 max-w-[180px]">"{log.deductionReason}"</p>
                          </div>
                        )}
                        <button 
                          className="p-2 bg-white/5 rounded-xl hover:bg-[#7C3AED] hover:text-[#FFFFFF] transition-all text-[#A78BFA] flex items-center justify-center border border-white/5"
                          onClick={() => {
                            const relatedEmp = employees.find(e => log.userId ? e.id === log.userId : (log.roleCode && e.roleCode && e.roleCode.toLowerCase() === log.roleCode.toLowerCase()));
                            if (relatedEmp) {
                              setSelectedEmployeeId(relatedEmp.id);
                            } else {
                              toast.error("لم يتم العثور على بيانات الموظف");
                            }
                          }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
                
                {attendance.length > 50 && (
                  <p className="text-center text-[#A78BFA] py-4 italic text-sm">يتم عرض أحدث 50 سجلاً فقط. استخدم فلترة التاريخ أو التصدير للعرض الكامل.</p>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedEmployeeLogs && (
          <div className="fixed inset-0 bg-[#090312]/85 backdrop-blur-xl z-50 flex items-center justify-center p-4 md:p-10 overflow-y-auto" dir="rtl">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="bg-[#190a2c] border border-[#7C3AED]/30 max-w-4xl w-full rounded-[3rem] shadow-[0_30px_100px_rgba(124,58,237,0.15)] overflow-hidden relative"
            >
              {/* Top Purple Ambient Glow */}
              <div className="absolute top-0 left-0 right-0 h-[120px] bg-gradient-to-b from-[#7C3AED]/20 to-transparent pointer-events-none" />

              {/* Close Button & Header */}
              <div className="p-8 pb-4 relative flex items-start justify-between border-b border-white/5">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-[#7C3AED] to-[#C084FC] flex items-center justify-center text-white text-2xl font-black shadow-lg">
                    {selectedEmployeeLogs.employee.fullName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-white">{selectedEmployeeLogs.employee.fullName}</h4>
                    <p className="text-base text-[#A78BFA] mt-1">
                      <span className="font-mono bg-[#7C3AED]/10 px-2.5 py-1 rounded-lg text-sm leading-none mr-2">{selectedEmployeeLogs.employee.roleCode}</span>
                      {selectedEmployeeLogs.employee.department} • {selectedEmployeeLogs.employee.jobTitle}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedEmployeeId(null)}
                  className="p-3 bg-white/5 rounded-2xl hover:bg-rose-500/20 hover:text-rose-400 transition-all text-[#A78BFA]"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-[#120721] p-5 rounded-2xl border border-[#7C3AED]/10 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#A78BFA] font-black uppercase mb-1">أيام الحضور الفعلي</p>
                      <h5 className="text-2xl font-black text-emerald-400 font-mono">{selectedEmployeeLogs.stats.presentDays} <span className="text-sm opacity-60 font-sans">أيام</span></h5>
                    </div>
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                      <Clock size={20} />
                    </div>
                  </div>

                  <div className="bg-[#120721] p-5 rounded-2xl border border-[#7C3AED]/10 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#A78BFA] font-black uppercase mb-1">إجمالي الأذونات المعتمدة</p>
                      <h5 className="text-2xl font-black text-blue-400 font-mono">{selectedEmployeeLogs.stats.approvedPermissionHours} <span className="text-sm opacity-60 font-sans">ساعات</span></h5>
                    </div>
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                      <Coffee size={20} />
                    </div>
                  </div>

                  <div className="bg-[#120721] p-5 rounded-2xl border border-[#7C3AED]/10 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#A78BFA] font-black uppercase mb-1">إجمالي الإجازات المعتمدة</p>
                      <h5 className="text-2xl font-black text-[#C084FC] font-mono">{selectedEmployeeLogs.stats.approvedVacationDays} <span className="text-sm opacity-60 font-sans">أيام</span></h5>
                    </div>
                    <div className="w-10 h-10 bg-[#7C3AED]/10 rounded-xl flex items-center justify-center text-[#C084FC]">
                      <Sun size={20} />
                    </div>
                  </div>

                  <div className="bg-[#120721] p-5 rounded-2xl border border-[#7C3AED]/10 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#A78BFA] font-black uppercase mb-1">إجمالي الخصومات</p>
                      <h5 className="text-2xl font-black text-rose-400 font-mono">-{selectedEmployeeLogs.stats.totalDeductions} <span className="text-sm opacity-60 font-sans">ج.م</span></h5>
                    </div>
                    <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-400">
                      <FileText size={20} />
                    </div>
                  </div>
                </div>

                {/* Individual Logs List */}
                <div className="space-y-4">
                  <h5 className="text-base font-black text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#7C3AED]" />
                    سجل الحركات اليومي خلال الفترة المحددة
                  </h5>

                  <div className="max-h-[350px] overflow-y-auto custom-scrollbar space-y-3 pr-1 pl-1">
                    {selectedEmployeeLogs.logs.length === 0 ? (
                      <p className="text-center text-[#A78BFA] opacity-50 py-10 italic">لا توجد حركات حضور مسجلة لهذا الموظف في الفترة المحددة</p>
                    ) : (
                      selectedEmployeeLogs.logs.map((log) => (
                        <div key={log.id} className="bg-[#120721]/60 border border-white/5 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-[#7C3AED]/20 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="bg-white/5 px-3 py-2 rounded-xl text-center font-mono">
                              <span className="text-sm text-[#A78BFA] block leading-none">{log.date}</span>
                            </div>
                            <div>
                              <span className={cn(
                                "text-[10px] font-black px-2.5 py-0.5 rounded-full",
                                log.status === 'Late' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              )}>
                                {log.status === 'Late' ? 'متأخر' : 'في الموعد'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 text-center md:text-right">
                            <div>
                              <p className="text-[9px] text-[#A78BFA] uppercase">الحضور</p>
                              <p className="text-sm font-sans font-bold text-white">
                                {log.checkInTime ? formatTimeTo12Hour(new Date(log.checkInTime.seconds * 1000)) : '---'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] text-[#A78BFA] uppercase">الانصراف</p>
                              <p className="text-sm font-sans font-bold text-white">
                                {log.checkOutTime ? formatTimeTo12Hour(new Date(log.checkOutTime.seconds * 1000)) : '---'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] text-[#A78BFA] uppercase">التأخير</p>
                              <p className="text-sm font-bold text-[#A78BFA]">
                                {log.delayMinutes ? formatDelayToArabic(log.delayMinutes) : 'لا يوجد'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] text-[#A78BFA] uppercase">الخصم</p>
                              <div className="flex items-center gap-1.5 justify-center md:justify-start">
                                <div className={cn("text-sm font-black font-mono", log.deductionValue > 0 ? "text-rose-400" : "text-emerald-400")}>
                                  {log.deductionValue > 0 ? (
                                    <div>
                                      <span>{log.deductionValue} يوم</span>
                                      <span className="block text-[10px] text-rose-300 font-bold">({((log.deductionValue * (Number(selectedEmployeeLogs.employee.basicSalary) || 0)) / 30).toFixed(2)} ج.م)</span>
                                    </div>
                                  ) : 'لا يوجد'}
                                </div>
                                {isAdmin && (
                                  <button
                                    onClick={() => {
                                      setEditingLog(log);
                                      setEditDeductionValue(log.deductionValue || 0);
                                      setEditDeductionReason(log.deductionReason || '');
                                    }}
                                    className="p-1 bg-white/5 rounded hover:bg-[#7C3AED]/30 hover:text-white transition-all text-[#A78BFA]"
                                    title="تعديل الخصم"
                                  >
                                    <Edit size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {log.deductionReason && (
                            <div className="bg-rose-500/5 px-3 py-1.5 rounded-xl border border-rose-500/15 max-w-full md:max-w-[200px] text-center md:text-right">
                              <p className="text-[10px] text-rose-300 font-medium italic line-clamp-1">"{log.deductionReason}"</p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 bg-[#130722] border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => setSelectedEmployeeId(null)}
                  className="bg-white/5 hover:bg-white/10 text-white px-8 py-3 rounded-2xl text-sm font-black transition-all"
                >
                  إغلاق السجل
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Deduction Modal */}
      <AnimatePresence>
        {editingLog && (
          <div className="fixed inset-0 bg-[#090312]/95 backdrop-blur-md z-[60] flex items-center justify-center p-4" dir="rtl">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#1e0a35] border border-[#7C3AED]/50 max-w-md w-full rounded-[2.5rem] shadow-[0_20px_50px_rgba(124,58,237,0.3)] overflow-hidden relative"
            >
              {/* Ambient top glow */}
              <div className="absolute top-0 left-0 right-0 h-[80px] bg-gradient-to-b from-[#7C3AED]/30 to-transparent pointer-events-none" />
              
              <div className="p-6 pb-4 border-b border-white/5 flex items-center justify-between relative">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-400">
                    <Edit size={18} />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-white">تعديل قيمة الخصم لليوم</h4>
                    <p className="text-[10px] text-[#A78BFA] font-mono">{editingLog.date}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setEditingLog(null)}
                  className="p-2 bg-white/5 rounded-xl hover:bg-rose-500/20 hover:text-rose-400 transition-all text-[#A78BFA]"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-5 relative">
                <div>
                  <label className="block text-sm font-black text-[#A78BFA] mb-2">عدد أيام الخصم</label>
                  <input 
                    type="number"
                    min="0"
                    step="0.25"
                    value={editDeductionValue}
                    onChange={(e) => setEditDeductionValue(Number(e.target.value))}
                    className="w-full bg-[#120721]/80 border border-white/10 rounded-xl px-4 py-3 text-white text-base font-bold font-mono focus:outline-none focus:border-[#7C3AED] transition-colors"
                    placeholder="مثال: 1 أو 0.5"
                  />
                  <p className="text-[10px] text-[#A78BFA]/60 mt-1.5">أدخل 0 لإلغاء الخصم لهذا اليوم بالكامل.</p>
                </div>

                <div>
                  <label className="block text-sm font-black text-[#A78BFA] mb-2">سبب الخصم / ملاحظات</label>
                  <textarea 
                    value={editDeductionReason}
                    onChange={(e) => setEditDeductionReason(e.target.value)}
                    className="w-full bg-[#120721]/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold focus:outline-none focus:border-[#7C3AED] transition-colors h-24 resize-none"
                    placeholder="اكتب سبب تعديل الخصم أو سبب الخصم الفعلي..."
                  />
                </div>
              </div>

              <div className="p-5 bg-[#130722] border-t border-white/5 flex gap-3 justify-end">
                <button 
                  onClick={() => setEditingLog(null)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-black transition-all"
                  disabled={savingEdit}
                >
                  إلغاء
                </button>
                <button 
                  onClick={handleSaveDeduction}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-black transition-all flex items-center gap-1.5 shadow-lg shadow-rose-950/20 disabled:opacity-50"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'جاري الحفظ...' : 'حفظ التعديل'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
