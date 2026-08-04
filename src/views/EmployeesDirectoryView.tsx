import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ExcelJS from 'exceljs';
import { Employee, Settings as SettingsType } from '../types';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'react-hot-toast';
import { 
  Search, 
  FileSpreadsheet, 
  Users, 
  Filter, 
  ArrowDownToLine, 
  Eye, 
  EyeOff, 
  ChevronDown, 
  ChevronUp, 
  Building, 
  Briefcase, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Lock, 
  Archive, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  Calendar,
  X,
  Edit,
  Trash2,
  AlertTriangle,
  UserCheck,
  CheckCircle,
  XCircle,
  Save,
  Shield
} from 'lucide-react';
import { cn } from '../lib/utils';

const getNextEmployeeCode = (employees: Employee[], offset: number = 0) => {
  let maxNum = 4; // So the next one starts at 5 (AXIS-005)
  employees.forEach(emp => {
    if (emp.roleCode) {
      const match = emp.roleCode.match(/^AXIS-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
  });
  let nextNum = maxNum + 1 + offset;
  let code = `AXIS-${String(nextNum).padStart(3, '0')}`;
  while (employees.some(e => e.roleCode && e.roleCode.trim().toLowerCase() === code.trim().toLowerCase())) {
    nextNum++;
    code = `AXIS-${String(nextNum).padStart(3, '0')}`;
  }
  return code;
};

export const EmployeesDirectoryView: React.FC = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);

  // High-level navigation tab: 'directory' (بيانات الموظفين) or 'pending' (قيد الانتظار للتفعيل)
  const [activeTab, setActiveTab] = useState<'directory' | 'pending'>('directory');

  // Search & Filters state for Directory tab
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [completionFilter, setCompletionFilter] = useState<string>('all');

  // Search state for Edit/Management tab
  const [managementSearchTerm, setManagementSearchTerm] = useState('');

  // Interactive drawer/modal for full details of a single employee (View detail popup on directory tab)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // States for Editing Modal (Inside Tab 2: "التعديل علي الموظفين")
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Employee>>({});
  const [activeEditTab, setActiveEditTab] = useState<'job' | 'financial' | 'personal' | 'education'>('job');
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [pendingForms, setPendingForms] = useState<Record<string, Partial<Employee>>>({});

  // Real-time listener for employees
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(
      collection(db, 'employees'), 
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
        // Filter out deleted employees and preserved migration backups
        setEmployees(list.filter(e => e.status !== 'deleted' && !(e as any).migrated));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching employees directory:", error);
        toast.error("فشل تحميل بيانات الكادر البشري");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Real-time listener for system config (to pull registered company/department option dropdowns)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'system_config'), 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as SettingsType;
          if (!data.companies || data.companies.length === 0) {
            data.companies = ["مجموعة أكسس", "شركة مدار", "شركة جذور", "الأكاديمي"];
          }
          setSettings(data);
        } else {
          setSettings({} as any);
        }
      },
      (error) => {
        console.error("Settings Fetch Error inside directory:", error);
        setSettings({} as any); 
      }
    );
    return () => unsub();
  }, []);

  // One-time auto-cleanup to permanently purge any existing soft-deleted ('deleted') records
  useEffect(() => {
    if (!isAdmin) return;
    const purgeSoftDeleted = async () => {
      try {
        const q = query(collection(db, 'employees'), where('status', '==', 'deleted'));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const batch = writeBatch(db);
          querySnapshot.forEach((docSnap) => {
            batch.delete(docSnap.ref);
          });
          await batch.commit();
          console.log("Successfully permanently purged existing soft-deleted employees on launch.");
        }
      } catch (err) {
        console.error("Failed to automatically purge soft-deleted records:", err);
      }
    };
    purgeSoftDeleted();
  }, []);

  // Stats calculation
  const activeCount = employees.filter(e => e.status === 'active').length;
  const pendingCount = employees.filter(e => e.status === 'pending').length;
  const lockedCount = employees.filter(e => e.status === 'locked' || e.status === 'inactive').length;
  const totalCount = employees.filter(e => e.status === 'active').length;

  // Fetch unique companies & departments for automatic filter options
  const uniqueCompanies = Array.from(
    new Set(employees.map(e => e.company).filter(Boolean))
  );
  
  const uniqueDepartments = Array.from(
    new Set(employees.map(e => e.department).filter(Boolean))
  );

  // Status text translation helpers
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'نشط';
      case 'pending': return 'قيد الانتظار';
      case 'locked': return 'مغلق';
      case 'inactive': return 'غير نشط';
      case 'archived': return 'مؤرشف';
      default: return status || 'غير معروف';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'pending': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'locked': 
      case 'inactive': 
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'archived': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  // Directory Filter Logic
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      (emp.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.roleCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.phone || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || emp.status === statusFilter;
    const matchesCompany = companyFilter === 'all' || emp.company === companyFilter;
    const matchesDept = deptFilter === 'all' || emp.department === deptFilter;
    
    const matchesCompletion = 
      completionFilter === 'all' ||
      (completionFilter === 'completed' && emp.dataCompleted === true) ||
      (completionFilter === 'pending' && emp.dataCompleted !== true);

    return matchesSearch && matchesStatus && matchesCompany && matchesDept && matchesCompletion;
  });

  // Action methods for Tab 2: "تعديل الموظفين / الكادر البشري" Management
  const updatePendingField = (empId: string, field: keyof Employee, value: any) => {
    setPendingForms(prev => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || {}),
        [field]: value
      }
    }));
  };

  const handleActivatePending = async (emp: Employee) => {
    const draft = pendingForms[emp.id] || {};
    const pendingList = employees.filter(e => e.status === 'pending');
    const index = pendingList.indexOf(emp);
    const roleCode = getNextEmployeeCode(employees, index >= 0 ? index : 0);
    const company = draft.company || emp.company || settings?.companies?.[0] || 'مجموعة أكسس';
    const department = draft.department || emp.department || settings?.departments?.[0] || 'General';
    const jobTitle = draft.jobTitle || emp.jobTitle || settings?.jobTitles?.[0] || 'Employee';
    const phone = draft.phone || emp.phone || '';
    const role = draft.role || emp.role || 'EMPLOYEE';

    try {
      const updatedData = {
        roleCode,
        company,
        department,
        jobTitle,
        phone,
        role,
        status: 'active' as const
      };

      await updateDoc(doc(db, 'employees', emp.id), updatedData);
      toast.success(`تم تفعيل حساب الموظف بنجاح: ${emp.fullName}`);
      
      setPendingForms(prev => {
        const copy = { ...prev };
        delete copy[emp.id];
        return copy;
      });
    } catch (error) {
      console.error("Activation Error:", error);
      toast.error('حدث خطأ أثناء تفعيل حساب الموظف');
    }
  };

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp.id);
    setEditFormData(emp);
  };

  const saveEdit = async (id: string) => {
    const codeToCheck = editFormData.roleCode?.trim();
    if (!codeToCheck) {
      toast.error('لا يمكن حفظ بيانات الموظف بكود فارغ');
      return;
    }

    const duplicateEmp = employees.find(e => 
      e.id !== id && 
      e.roleCode && 
      e.roleCode.trim().toLowerCase() === codeToCheck.toLowerCase()
    );

    if (duplicateEmp) {
      toast.error(`خطأ: كود الموظف "${codeToCheck}" مخصص بالفعل لموظف آخر وهو (${duplicateEmp.fullName}). لا يُسمح بتكرار الأكواد!`);
      return;
    }

    try {
      // Isolate sensitive credentials (role, status) from regular profile updates to ensure complete stability
      const { id: _, role, status, createdAt, email, ...safeData } = editFormData;

      // Filter out any undefined or null properties from safeData to ensure complete Firestore update stability
      const cleanData: any = {};
      Object.keys(safeData).forEach((key) => {
        const val = (safeData as any)[key];
        if (val !== undefined && val !== null) {
          cleanData[key] = val;
        }
      });

      cleanData.roleCode = codeToCheck; // save trimmed version

      // Only update the primary email if it is a valid non-empty string to prevent accidental overwrites to empty string ''
      if (email && email.trim()) {
        cleanData.email = email.trim().toLowerCase();
      }

      await updateDoc(doc(db, 'employees', id), cleanData);
      toast.success('تم تحديث بيانات الموظف بنجاح');
      setEditingEmployee(null);
    } catch (e) {
      toast.error('فشل حفظ وتحديث التعديلات');
    }
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    try {
      await deleteDoc(doc(db, 'employees', employeeToDelete.id));
      toast.success('تم حذف الموظف نهائياً بنجاح');
      setEmployeeToDelete(null);
    } catch (e) {
      toast.error('خطأ في عملية الحذف');
    }
  };

  const handleArchive = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'archived' ? 'active' : 'archived';
    try {
      await updateDoc(doc(db, 'employees', id), { status: nextStatus });
      toast.success(nextStatus === 'archived' ? 'تم نقل الموظف للأرشيف بنجاح' : 'تم تفعيل واستعادة الموظف من الأرشيف');
    } catch (e) {
      toast.error('فشل تحديث حالة الأرشفة');
    }
  };

  // Export to Excel Engine
  const exportToExcel = async () => {
    if (filteredEmployees.length === 0) {
      toast.error("لا توجد بيانات لتصديرها");
      return;
    }

    try {
      toast.loading('جاري تجهيز ملف الـ Excel الفاخر للموظفين...', { id: 'employees-export' });

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Axis HR System';
      workbook.lastModifiedBy = 'Axis HR System';
      workbook.created = new Date();
      workbook.modified = new Date();

      const sheet = workbook.addWorksheet('بيانات الموظفين', {
        views: [{ rightToLeft: true }]
      });

      // Gridlines visible
      sheet.views = [{ showGridLines: true, rightToLeft: true }];

      // Set column widths
      const cols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD'];
      const widths = [15, 30, 15, 15, 18, 22, 15, 25, 12, 15, 15, 15, 15, 15, 25, 18, 15, 10, 15, 12, 15, 15, 15, 12, 15, 20, 20, 30, 30];
      
      sheet.getColumn('A').width = 4; // Margin column
      cols.forEach((col, idx) => {
        sheet.getColumn(col).width = widths[idx];
      });

      // Title Block
      sheet.getRow(2).height = 40;
      sheet.mergeCells('B2:AD2');
      const titleCell = sheet.getCell('B2');
      titleCell.value = 'نظام إدارة الموارد البشرية - AXIS GROUP';
      titleCell.font = { name: 'Segoe UI', family: 4, size: 16, bold: true, color: { argb: 'FFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C3AED' } }; // Axis Purple
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Subtitle Block
      sheet.getRow(3).height = 25;
      sheet.mergeCells('B3:AD3');
      const subtitleCell = sheet.getCell('B3');
      subtitleCell.value = 'تقرير تفصيلي لبيانات الكادر البشري العام والرواتب والتفاصيل الشخصية للموظفين';
      subtitleCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: '4C1D95' } };
      subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } };
      subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Cards setup (Row 5 & 6)
      const summaryCardBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'D1D5DB' } },
        bottom: { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'D1D5DB' } },
        left: { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'D1D5DB' } },
        right: { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'D1D5DB' } }
      };

      sheet.getRow(5).height = 20;
      sheet.getRow(6).height = 28;

      // Card 1
      sheet.mergeCells('B5:D5');
      sheet.getCell('B5').value = 'عدد الموظفين المصدّرين';
      sheet.getCell('B5').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '4B5563' } };
      sheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
      sheet.getCell('B5').alignment = { horizontal: 'center', vertical: 'middle' };

      sheet.mergeCells('B6:D6');
      sheet.getCell('B6').value = `${filteredEmployees.length} موظفاً`;
      sheet.getCell('B6').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: '5B21B6' } };
      sheet.getCell('B6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } };
      sheet.getCell('B6').alignment = { horizontal: 'center', vertical: 'middle' };

      // Card 2
      sheet.mergeCells('E5:H5');
      sheet.getCell('E5').value = 'إجمالي الرواتب الأساسية للظاهرين';
      sheet.getCell('E5').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '4B5563' } };
      sheet.getCell('E5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
      sheet.getCell('E5').alignment = { horizontal: 'center', vertical: 'middle' };

      sheet.mergeCells('E6:H6');
      const totalSalaries = filteredEmployees.reduce((acc, emp) => acc + (Number(emp.basicSalary) || 0), 0);
      sheet.getCell('E6').value = `${totalSalaries.toLocaleString('ar-EG')} ج.م`;
      sheet.getCell('E6').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: '065F46' } };
      sheet.getCell('E6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
      sheet.getCell('E6').alignment = { horizontal: 'center', vertical: 'middle' };

      // Set border for B5:H6
      ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
        sheet.getCell(`${col}5`).border = summaryCardBorder;
        sheet.getCell(`${col}6`).border = summaryCardBorder;
      });

      // Headers (Row 8)
      const headers = [
        'كود الموظف',
        'الاسم الرباعي',
        'الصلاحية',
        'الشركة',
        'القسم',
        'المسمى الوظيفي',
        'رقم الهاتف',
        'البريد الإلكتروني',
        'الحالة',
        'المستوى الوظيفي',
        'تاريخ التعيين',
        'تاريخ انتهاء العمل',
        'الراتب الأساسي',
        'الزيادة السنوية',
        'العنوان',
        'الرقم القومي',
        'هاتف العمل',
        'الجنس',
        'الحالة الاجتماعية',
        'المحافظة',
        'تاريخ الميلاد',
        'الجامعة',
        'الكلية',
        'سنة التخرج',
        'المؤهل الدراسي',
        'جهة اتصال الطوارئ',
        'حالة استكمال البيانات',
        'ملاحظات الاستكمال',
        'ملاحظات الراتب'
      ];

      sheet.getRow(8).height = 30;
      cols.forEach((col, idx) => {
        const cell = sheet.getCell(`${col}8`);
        cell.value = headers[idx];
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C3AED' } }; // Axis Purple
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: '5B21B6' } },
          bottom: { style: 'medium', color: { argb: '5B21B6' } },
          left: { style: 'thin', color: { argb: 'D1D5DB' } },
          right: { style: 'thin', color: { argb: 'D1D5DB' } }
        };
      });

      // Rows (Starting at Row 9)
      let currentRow = 9;
      filteredEmployees.forEach((emp, index) => {
        const row = sheet.getRow(currentRow);
        row.height = 24;

        row.getCell('B').value = emp.roleCode || '';
        row.getCell('C').value = emp.fullName || '';
        row.getCell('D').value = emp.role || '';
        row.getCell('E').value = emp.company || '';
        row.getCell('F').value = emp.department || '';
        row.getCell('G').value = emp.jobTitle || '';
        row.getCell('H').value = emp.phone || '';
        row.getCell('I').value = emp.email || '';
        row.getCell('J').value = getStatusLabel(emp.status);
        row.getCell('K').value = emp.level || '';
        row.getCell('L').value = emp.joiningDate || '';
        row.getCell('M').value = emp.terminationDate || '---';
        row.getCell('N').value = emp.basicSalary ? Number(emp.basicSalary) : 0;
        row.getCell('O').value = emp.annualIncrease ? Number(emp.annualIncrease) : 0;
        row.getCell('P').value = emp.address || '---';
        row.getCell('Q').value = emp.idNo || '---';
        row.getCell('R').value = emp.businessPhone || '---';
        row.getCell('S').value = emp.gender || '';
        row.getCell('T').value = emp.maritalStatus || '---';
        row.getCell('U').value = emp.governorate || '---';
        row.getCell('V').value = emp.dateOfBirth || '---';
        row.getCell('W').value = emp.university || '---';
        row.getCell('X').value = emp.college || '---';
        row.getCell('Y').value = emp.graduationYear || '---';
        row.getCell('Z').value = emp.degree || '---';
        row.getCell('AA').value = emp.emergencyContact || '---';
        row.getCell('AB').value = emp.dataCompleted ? 'تم استكمال البيانات' : 'باقي استكمال البيانات';
        row.getCell('AC').value = emp.dataCompletedNotes || '---';
        row.getCell('AD').value = emp.salaryNotes || '---';

        const isEven = index % 2 === 0;
        cols.forEach(col => {
          const cell = row.getCell(col);
          cell.font = { name: 'Segoe UI', size: 10, color: { argb: '1F2937' } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } }
          };
          
          if (isEven) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9FAFB' } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF' } };
          }

          // Specific alignment/formatting
          if (col === 'B') {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '7C3AED' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (col === 'N' || col === 'O') {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.numFmt = '#,##0.00" ج.م"';
          } else if (['H', 'R', 'Q', 'L', 'M', 'V', 'Y'].includes(col)) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (col === 'I') {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else if (col === 'J') {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (emp.status === 'active') {
              cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '065F46' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
            } else if (emp.status === 'pending') {
              cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '92400E' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
            } else {
              cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '991B1B' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
            }
          } else {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });

        currentRow++;
      });

      // Add Totals row
      const totalRow = sheet.getRow(currentRow);
      totalRow.height = 26;
      totalRow.getCell('C').value = 'الإجمالي العام للمجموعة';
      totalRow.getCell('N').value = { formula: `SUM(N9:N${currentRow - 1})` };
      totalRow.getCell('O').value = { formula: `SUM(O9:O${currentRow - 1})` };

      cols.forEach(col => {
        const cell = totalRow.getCell(col);
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '5B21B6' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } };
        cell.border = {
          top: { style: 'medium', color: { argb: '7C3AED' } },
          bottom: { style: 'double', color: { argb: '7C3AED' } },
          left: { style: 'thin', color: { argb: 'D1D5DB' } },
          right: { style: 'thin', color: { argb: 'D1D5DB' } }
        };

        if (col === 'N' || col === 'O') {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.numFmt = '#,##0.00" ج.م"';
        } else if (col === 'C') {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });

      // Write buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `تقرير_بيانات_الموظفين_${new Date().toISOString().split('T')[0]}.xlsx`;
      anchor.click();
      
      window.URL.revokeObjectURL(url);
      
      toast.dismiss('employees-export');
      toast.success(`تم تصدير ملف الـ Excel الفاخر بنجاح لعدد ${filteredEmployees.length} موظفاً!`);
    } catch (error) {
      toast.dismiss('employees-export');
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
          <Shield size={32} />
        </div>
        <h2 className="text-xl font-bold text-red-400">غير مصرح بالوصول</h2>
        <p className="text-sm text-[#A78BFA] mt-2">عذراً، هذه الصفحة مخصصة لمدراء النظام فقط ولا يسمح للموظفين بالاطلاع على بيانات زملائهم أو تفاصيلهم المالية والمالك للشركة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500 text-right font-sans pb-20" dir="rtl">
      <Toaster position="top-center" />

      {/* Modern Top Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white/5 p-8 rounded-[2.5rem] border border-white/5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#7C3AED]/10 blur-[130px] rounded-full -z-10" />
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#7C3AED]/20 border border-[#7C3AED]/30 rounded-xl flex items-center justify-center text-[#C084FC]">
              <Users size={20} />
            </div>
            <h1 className="text-3xl font-black bg-gradient-to-l from-white to-[#A78BFA] bg-clip-text text-transparent">
              إدارة الكادر البشري
            </h1>
          </div>
          <p className="text-sm text-[#A78BFA] leading-relaxed">
            المنصة المركزية المتكاملة لعرض بيانات الكادر المالي والشخصي والمهني، وتوثيق سجلات وتفعيل الموظفين وتعديل صلاحياتهم بنطاق العمل.
          </p>
        </div>

         {/* Tab switch Navigation in top block */}
        <div className="flex bg-white/5 border border-white/10 p-1.5 rounded-2xl self-start lg:self-center gap-1.5">
          <button
            onClick={() => setActiveTab('directory')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap",
              activeTab === 'directory' ? "bg-[#7C3AED] text-white shadow-md shadow-[#7C3AED]/20" : "text-[#A78BFA] hover:text-white"
            )}
          >
            عرض وفهرس البيانات
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-1.5",
              activeTab === 'pending' ? "bg-amber-500 text-black shadow-md shadow-amber-500/20" : "text-[#A78BFA] hover:text-white"
            )}
          >
            <span>قيد الانتظار للتفعيل</span>
            {pendingCount > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-md text-[10px] font-black font-mono",
                activeTab === 'pending' ? "bg-black text-amber-500" : "bg-amber-500/20 text-amber-400"
              )}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab 1: Directory & View List */}
      {activeTab === 'directory' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* Main Action Block: Download Excel Button */}
          <div className="flex justify-end">
            <button
              onClick={exportToExcel}
              className="flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-black text-sm py-4 px-8 rounded-2xl shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <FileSpreadsheet size={20} />
              <span>تصدير ملف الـ Excel الفاخر للموظفين</span>
            </button>
          </div>

          {/* Stats Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 select-none">
            {/* Stat: Total Employees */}
            <div className="bg-[#1E0F33]/85 backdrop-blur-2xl p-6 rounded-[2rem] border border-[#7C3AED]/10 shadow-lg relative flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#A78BFA] block">إجمالي الموظفين</span>
                <span className="text-3xl font-black text-white block">{totalCount}</span>
              </div>
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/50">
                <Users size={22} />
              </div>
            </div>

            {/* Stat: Active Employees */}
            <div className="bg-[#1E0F33]/85 backdrop-blur-2xl p-6 rounded-[2rem] border border-emerald-500/10 shadow-lg relative flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-emerald-400 block">الموظفين النشطين</span>
                <span className="text-3xl font-black text-white block">{activeCount}</span>
              </div>
              <div className="w-12 h-12 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400">
                <CheckCircle2 size={22} />
              </div>
            </div>

            {/* Stat: Pending Activation */}
            <div className="bg-[#1E0F33]/85 backdrop-blur-2xl p-6 rounded-[2rem] border border-amber-500/10 shadow-lg relative flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-amber-400 block">قيد الانتظار للتفعيل</span>
                <span className="text-3xl font-black text-white block">{pendingCount}</span>
              </div>
              <div className="w-12 h-12 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400">
                <Clock size={22} />
              </div>
            </div>

            {/* Stat: Closed / Inactive */}
            <div className="bg-[#1E0F33]/85 backdrop-blur-2xl p-6 rounded-[2rem] border border-rose-500/10 shadow-lg relative flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-rose-400 block">الحسابات المغلقة</span>
                <span className="text-3xl font-black text-white block">{lockedCount}</span>
              </div>
              <div className="w-12 h-12 bg-rose-500/5 border border-rose-500/10 rounded-2xl flex items-center justify-center text-rose-400">
                <Lock size={22} />
              </div>
            </div>
          </div>

          {/* Filters & Control Row */}
          <div className="bg-[#1E0F33]/60 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-[#7C3AED]/10 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {/* Search Box */}
              <div className="space-y-2">
                <label className="text-xs text-[#A78BFA] font-bold px-1">البحث المباشر</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-4 flex items-center text-[#A78BFA]">
                    <Search size={18} />
                  </span>
                  <input
                    type="text"
                    placeholder="ابحث بالاسم، الكود، البريد..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 pr-11 pl-4 text-xs text-white placeholder-[#A78BFA]/45 focus:border-[#C084FC] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Company Filter */}
              <div className="space-y-2">
                <label className="text-xs text-[#A78BFA] font-bold px-1">الشركة التابع لها</label>
                <div className="relative">
                  <select
                    value={companyFilter}
                    onChange={e => setCompanyFilter(e.target.value)}
                    className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-xs text-white focus:border-[#C084FC] outline-none transition-all appearance-none cursor-pointer text-right"
                  >
                    <option value="all">كل الشركات</option>
                    {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span className="absolute inset-y-0 left-4 flex items-center text-[#A78BFA] pointer-events-none">
                    <Building size={16} />
                  </span>
                </div>
              </div>

              {/* Department Filter */}
              <div className="space-y-2">
                <label className="text-xs text-[#A78BFA] font-bold px-1">القسم / الإدارة</label>
                <div className="relative">
                  <select
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                    className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-xs text-white focus:border-[#C084FC] outline-none transition-all appearance-none cursor-pointer text-right"
                  >
                    <option value="all">كل الإدارات</option>
                    {uniqueDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="absolute inset-y-0 left-4 flex items-center text-[#A78BFA] pointer-events-none">
                    <Briefcase size={16} />
                  </span>
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <label className="text-xs text-[#A78BFA] font-bold px-1">حالة الحساب</label>
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-xs text-white focus:border-[#C084FC] outline-none transition-all appearance-none cursor-pointer text-right"
                  >
                    <option value="all">كل الحالات</option>
                    <option value="active">نشط</option>
                    <option value="pending">قيد الانتظار</option>
                    <option value="locked">مغلق</option>
                    <option value="archived">مؤرشف</option>
                  </select>
                  <span className="absolute inset-y-0 left-4 flex items-center text-[#A78BFA] pointer-events-none">
                    <Filter size={16} />
                  </span>
                </div>
              </div>

              {/* Completion Filter */}
              <div className="space-y-2">
                <label className="text-xs text-[#A78BFA] font-bold px-1">استكمال البيانات</label>
                <div className="relative">
                  <select
                    value={completionFilter}
                    onChange={e => setCompletionFilter(e.target.value)}
                    className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-xs text-white focus:border-[#C084FC] outline-none transition-all appearance-none cursor-pointer text-right text-[#C084FC] font-black"
                  >
                    <option value="all">كل الحالات</option>
                    <option value="completed">تم استكمال البيانات</option>
                    <option value="pending">باقي استكمال البيانات</option>
                  </select>
                  <span className="absolute inset-y-0 left-4 flex items-center text-[#A78BFA] pointer-events-none">
                    <FileText size={16} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Directory Listings */}
          <div className="bg-[#1E0F33]/40 backdrop-blur-2xl rounded-[2.5rem] border border-white/5 p-6 overflow-hidden">
            {loading ? (
              <div className="text-center py-20">
                <div className="w-12 h-12 border-4 border-[#7C3AED]/20 border-t-[#C084FC] rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-sm text-[#A78BFA] animate-pulse">جاري تحميل السجلات والبيانات...</p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-20 text-gray-400 font-medium">
                لا توجد سجلات مطابقة لمعايير التصفية الحالية
              </div>
            ) : (
              <div className="overflow-x-auto min-w-full rounded-2xl custom-scrollbar">
                <table className="w-full text-right border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-[#A78BFA] text-xs font-black uppercase tracking-wider">
                      <th className="px-6 py-4">كود الموظف</th>
                      <th className="px-6 py-4">الموظف</th>
                      <th className="px-6 py-4">الشركة والادارة</th>
                      <th className="px-6 py-4">المسمى الوظيفي</th>
                      <th className="px-6 py-4">رقم التواصل والبريد</th>
                      <th className="px-6 py-4">الحالة</th>
                      <th className="px-6 py-4">استكمال البيانات</th>
                      <th className="px-6 py-4 text-center">الخيارات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => (
                      <tr 
                        key={emp.id} 
                        className="bg-white/5 hover:bg-white/[0.08] transition-all duration-300 border border-white/5 rounded-3xl group"
                      >
                        {/* ID Code */}
                        <td className="px-6 py-5 align-middle">
                          {(() => {
                            const isDup = emp.roleCode ? employees.filter(e => e.roleCode && e.roleCode.trim().toLowerCase() === emp.roleCode.trim().toLowerCase()).length > 1 : false;
                            return (
                              <span className={`font-mono text-xs font-extrabold py-1.5 px-3 rounded-xl border transition-all flex items-center gap-1.5 w-fit ${
                                isDup 
                                  ? 'bg-red-500/10 border-red-500/40 text-red-400 animate-pulse' 
                                  : 'bg-white/5 border-white/5 text-white'
                              }`}
                              title={isDup ? "تحذير: كود الموظف مكرر! يرجى تعديله لتجنب الأخطاء" : ""}
                              >
                                {emp.roleCode || 'N/A'}
                                {isDup && <span className="text-[10px] bg-red-500 text-white font-black px-1 rounded animate-bounce">مكرر!</span>}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Employee Name */}
                        <td className="px-6 py-5 align-middle">
                          <div 
                            className="flex items-center gap-3 cursor-pointer group/name"
                            onClick={() => setSelectedEmployee(emp)}
                            title="عرض ملف الموظف الكامل"
                          >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C3AED]/30 to-[#C084FC]/30 flex items-center justify-center text-xs font-black text-white select-none overflow-hidden shrink-0 transition-transform group-hover/name:scale-105">
                              {emp.photoUrl ? (
                                <img src={emp.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                emp.fullName?.charAt(0) || 'E'
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-black text-white group-hover/name:text-[#C084FC] transition-colors">
                                {emp.fullName}
                              </div>
                              <div className="text-[10px] text-[#A78BFA]/70 mt-0.5">
                                المستوى: {emp.level || 'غير محدد'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Company & Department */}
                        <td className="px-6 py-5 align-middle">
                          <div className="text-xs font-bold text-white/90">
                            {emp.company || 'مجموعة أكسس'}
                          </div>
                          <div className="text-[10px] text-[#A78BFA] mt-0.5">
                            {emp.department || 'خدمات عامة'}
                          </div>
                        </td>

                        {/* Job Position */}
                        <td className="px-6 py-5 align-middle">
                          <span className="text-xs font-medium text-white/80">
                            {emp.jobTitle || 'موظف'}
                          </span>
                        </td>

                        {/* Contact info */}
                        <td className="px-6 py-5 align-middle">
                          <div className="text-xs font-mono text-white/90">{emp.phone || '-'}</div>
                          <div className="text-[10px] text-[#A78BFA]/60 font-mono mt-0.5">{emp.email}</div>
                        </td>

                        {/* Status badge */}
                        <td className="px-6 py-5 align-middle">
                          <span className={`inline-flex items-center text-[10px] font-black tracking-widest uppercase border rounded-xl px-2.5 py-1 ${getStatusColor(emp.status)}`}>
                            {getStatusLabel(emp.status)}
                          </span>
                        </td>

                        {/* Completion badge */}
                        <td className="px-6 py-5 align-middle">
                          <span className={`inline-flex items-center text-[10px] font-black tracking-widest border rounded-xl px-2.5 py-1 ${
                            emp.dataCompleted 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                          title={emp.dataCompletedNotes || "لا توجد ملاحظات استكمال"}
                          >
                            {emp.dataCompleted ? "تم الاستكمال" : "باقي استكمال البيانات"}
                          </span>
                        </td>

                        {/* Options: Edit & Archive triggers */}
                        <td className="px-6 py-5 align-middle text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(emp)}
                              className="inline-flex items-center justify-center p-2.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/10 rounded-xl text-blue-400 hover:text-blue-300 transition-all"
                              title="تعديل بيانات الموظف"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleArchive(emp.id, emp.status)}
                              className={cn(
                                "inline-flex items-center justify-center p-2.5 rounded-xl border transition-all",
                                emp.status === 'archived'
                                  ? "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20 text-orange-400 hover:text-orange-300"
                                  : "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/10 text-amber-400 hover:text-amber-300"
                              )}
                              title={emp.status === 'archived' ? "استعادة الموظف من الأرشيف" : "أرشفة الموظف"}
                            >
                              <Archive size={16} />
                            </button>
                            <button
                              onClick={() => setEmployeeToDelete(emp)}
                              className="inline-flex items-center justify-center p-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/10 rounded-xl text-rose-400 hover:text-rose-300 transition-all"
                              title="حذف الموظف نهائياً"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Employees Pending Activation */}
      {activeTab === 'pending' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="bg-[#1E0F33]/60 backdrop-blur-2xl p-10 rounded-[3rem] border border-white/5 relative overflow-hidden shadow-2xl">
            <div className="absolute -top-10 -left-10 w-96 h-96 bg-amber-500/5 blur-[120px] -z-10 rounded-full" />
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8 border-b border-white/5 pb-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 shadow-lg">
                  <Clock size={28} />
                </div>
                <div>
                  <h3 className="text-3xl font-black text-amber-200">طلبات تفعيل الموظفين الجدد</h3>
                  <p className="text-[#A78BFA] text-sm mt-1">الحسابات الجديدة التي سجلت عبر Google وبانتظار تعيين بياناتها وتأكيد عضويتها لبدء العمل</p>
                </div>
              </div>
              <div className="bg-amber-500/10 text-amber-300 font-mono font-black text-sm px-5 py-2 rounded-2xl border border-amber-500/20 shrink-0 shadow-inner">
                قيد الانتظار ({employees.filter(emp => emp.status === 'pending').length})
              </div>
            </div>

            {employees.filter(emp => emp.status === 'pending').length === 0 ? (
              <div className="text-center py-20 bg-white/[0.02] border border-white/5 rounded-3xl">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 mx-auto mb-6 shadow-inner animate-pulse">
                  <CheckCircle size={32} />
                </div>
                <h4 className="text-xl font-black text-white mb-2">لا توجد طلبات تفعيل معلقة حالياً</h4>
                <p className="text-sm text-[#A78BFA]/70 max-w-md mx-auto leading-relaxed">
                  جميع حسابات الموظفين المسجلة عبر جوجل مفعلة بالكامل ونشطة مع تحديد كود التوظيف والموقع الوظيفي.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {employees.filter(emp => emp.status === 'pending').map((emp) => {
                  const draft = pendingForms[emp.id] || {};
                  return (
                    <div key={emp.id} className="p-6 bg-[#12071F]/40 border border-white/5 hover:border-amber-500/20 rounded-3xl grid grid-cols-1 xl:grid-cols-12 gap-6 items-center transition-all duration-300 shadow-md">
                      {/* Info */}
                      <div className="xl:col-span-3 flex items-center gap-4 min-w-0">
                        <div className="w-14 h-14 bg-amber-500/10 text-amber-400 font-black rounded-2xl flex items-center justify-center text-xl shrink-0 border border-amber-500/15 overflow-hidden shadow-inner">
                          {emp.photoUrl ? (
                            <img src={emp.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            emp.fullName.charAt(0)
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-white text-lg block leading-tight truncate">{emp.fullName}</span>
                          <span className="text-xs text-[#A78BFA] block font-mono mt-1 opacity-70 truncate">{emp.email}</span>
                        </div>
                      </div>

                      {/* Inputs */}
                      <div className="xl:col-span-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                        {/* roleCode */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-amber-300 px-1 font-bold">كود الموظف التلقائي</label>
                          <div className="w-full bg-[#12071F]/50 border border-white/5 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono text-center font-bold">
                            {emp.roleCode || getNextEmployeeCode(employees, employees.filter(e => e.status === 'pending').indexOf(emp))}
                          </div>
                        </div>

                        {/* company */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-amber-300 px-1 font-bold">الشركة</label>
                          <select 
                            className="w-full bg-[#12071F]/80 border border-white/10 rounded-xl px-2 py-2 text-xs text-white cursor-pointer outline-none focus:border-[#C084FC] text-right"
                            value={draft.company || emp.company || settings?.companies?.[0] || 'مجموعة أكسس'}
                            onChange={e => updatePendingField(emp.id, 'company', e.target.value)}
                          >
                            {settings?.companies?.map(c => <option key={c} value={c} className="bg-[#1E0F33]">{c}</option>)}
                          </select>
                        </div>

                        {/* department */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-[#A78BFA] px-1 font-bold">القسم</label>
                          <select 
                            className="w-full bg-[#12071F]/80 border border-white/10 rounded-xl px-2 py-2 text-xs text-white cursor-pointer outline-none focus:border-[#C084FC] text-right"
                            value={draft.department || emp.department || settings?.departments?.[0] || ''}
                            onChange={e => updatePendingField(emp.id, 'department', e.target.value)}
                          >
                            {settings?.departments?.map(d => <option key={d} value={d} className="bg-[#1E0F33]">{d}</option>)}
                          </select>
                        </div>

                        {/* jobTitle */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-[#A78BFA] px-1 font-bold">المسمى الوظيفي</label>
                          <select 
                            className="w-full bg-[#12071F]/80 border border-white/10 rounded-xl px-2 py-2 text-xs text-white cursor-pointer outline-none focus:border-[#C084FC] text-right"
                            value={draft.jobTitle || emp.jobTitle || settings?.jobTitles?.[0] || ''}
                            onChange={e => updatePendingField(emp.id, 'jobTitle', e.target.value)}
                          >
                            {settings?.jobTitles?.map(t => <option key={t} value={t} className="bg-[#1E0F33]">{t}</option>)}
                          </select>
                        </div>

                        {/* role */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-[#A78BFA] px-1 font-bold">الحساب</label>
                          <select 
                            className="w-full bg-[#12071F]/80 border border-white/10 rounded-xl px-2 py-2 text-xs text-white cursor-pointer outline-none focus:border-[#C084FC] text-right"
                            value={draft.role || emp.role || 'EMPLOYEE'}
                            onChange={e => updatePendingField(emp.id, 'role', e.target.value)}
                          >
                            <option value="EMPLOYEE" className="bg-[#1E0F33]">MEMBER</option>
                            <option value="HR-MASTER" className="bg-[#1E0F33]">HR MASTER</option>
                            <option value="GM-MASTER" className="bg-[#1E0F33]">TOP MASTER</option>
                          </select>
                        </div>

                        {/* Action Button */}
                        <div className="flex items-end justify-end h-full">
                          <button
                            type="button"
                            onClick={() => handleActivatePending(emp)}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 px-3 rounded-xl font-black text-xs transition-colors shadow-lg active:scale-95 whitespace-nowrap"
                          >
                            تفعيل وتأكيد العضوية
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}



      {/* Expanded Profiles Details Drawer / Dialog Modal (TAB 1 Detail modal) */}
      <AnimatePresence>
        {selectedEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEmployee(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 30, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="w-full max-w-4xl bg-[#1E0F33] border border-[#7C3AED]/30 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-8 border-b border-white/5 bg-[#12071F]/50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#7C3AED]/20 flex items-center justify-center text-[#C084FC] border border-[#7C3AED]/20 overflow-hidden shrink-0">
                    {selectedEmployee.photoUrl ? (
                      <img src={selectedEmployee.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Users size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">{selectedEmployee.fullName}</h3>
                    <p className="text-xs text-[#A78BFA] font-mono mt-0.5">كود الموظف: {selectedEmployee.roleCode || 'غير حدد'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEmployee(null)}
                  className="p-3 hover:bg-white/5 text-gray-400 hover:text-white rounded-2xl transition-colors text-xl"
                >
                  ×
                </button>
              </div>

              <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                {/* Section 1: Job Info */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-[#A78BFA] border-r-2 border-[#7C3AED] pr-2">
                    البيانات المهنية والوظيفية
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">الشركة</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.company || 'مجموعة أكسس'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">القسم والادارة</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.department || 'خدمات عامة'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">المسمى المهني</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.jobTitle || 'موظف'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">المستوى الوظيفي</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.level || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">تاريخ التعيين والالتحاق</span>
                      <strong className="text-sm text-white mt-1 block font-mono">{selectedEmployee.joiningDate || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">تاريخ انتهاء العمل</span>
                      <strong className="text-sm text-white mt-1 block font-mono">{selectedEmployee.terminationDate || 'مستمر'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">رتبة الصلاحية على النظام</span>
                      <strong className="text-sm text-white mt-1 block font-mono">{selectedEmployee.role || 'MEMBER'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">رقم البيزنس / العمل</span>
                      <strong className="text-sm text-white mt-1 block font-mono">{selectedEmployee.businessPhone || '-'}</strong>
                    </div>
                  </div>
                </div>

                {/* Section 2: Contact Info */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-[#A78BFA] border-r-2 border-[#7C3AED] pr-2">
                    بيانات الاتصال والتواصل
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                      <Phone size={18} className="text-[#C084FC]" />
                      <div>
                        <span className="text-[10px] text-[#A78BFA] block">رقم الهاتف الشخصي</span>
                        <strong className="text-sm text-white font-mono mt-0.5 block">{selectedEmployee.phone || '-'}</strong>
                      </div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                      <Mail size={18} className="text-[#C084FC]" />
                      <div>
                        <span className="text-[10px] text-[#A78BFA] block">البريد الإلكتروني الوظيفي</span>
                        <strong className="text-sm text-white font-mono mt-0.5 block break-all">{selectedEmployee.email}</strong>
                      </div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                      <Phone size={18} className="text-emerald-400" />
                      <div>
                        <span className="text-[10px] text-[#A78BFA] block">رقم البيزنس / العمل</span>
                        <strong className="text-sm text-white mt-1 block font-mono">{selectedEmployee.businessPhone || '-'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: Personal ID */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-[#A78BFA] border-r-2 border-[#7C3AED] pr-2">
                    الهوية والبيانات الشخصية
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">الرقم القومي / الهوية</span>
                      <strong className="text-sm text-white font-mono mt-1 block">{selectedEmployee.idNo || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">تاريخ الميلاد</span>
                      <strong className="text-sm text-white font-mono mt-1 block">{selectedEmployee.dateOfBirth || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">الجنس</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.gender || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">الحالة الاجتماعية</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.maritalStatus || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">المحافظة</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.governorate || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">جهة اتصال الطوارئ</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.emergencyContact || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 lg:col-span-3">
                      <span className="text-[10px] text-[#A78BFA] block flex items-center gap-1">
                        <MapPin size={12} />
                        <span>العنوان المقيم به بالتفصيل</span>
                      </span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.address || '-'}</strong>
                    </div>
                  </div>
                </div>

                {/* Section 4: Education */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-[#A78BFA] border-r-2 border-[#7C3AED] pr-2">
                    المؤهلات التعليمية والدراسة
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">المؤهل الدراسي</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.degree || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">الجامعة</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.university || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">الكلية</span>
                      <strong className="text-sm text-white mt-1 block">{selectedEmployee.college || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">سنة التخرج</span>
                      <strong className="text-sm text-white font-mono mt-1 block">{selectedEmployee.graduationYear || '-'}</strong>
                    </div>
                  </div>
                </div>

                {/* Section 5: Financials */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-[#A78BFA] border-r-2 border-[#7C3AED] pr-2">
                    البيانات والرواتب المالية
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-[#10B981]/10 p-4 rounded-2xl border border-emerald-500/10">
                      <span className="text-[10px] text-[#A78BFA] block">الراتب الأساسي</span>
                      <strong className="text-base text-emerald-400 font-mono mt-1 block">{selectedEmployee.basicSalary ? `${selectedEmployee.basicSalary} ج.م` : '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">الزيادة السنوية</span>
                      <strong className="text-sm text-white font-mono mt-1 block">{selectedEmployee.annualIncrease ? `${selectedEmployee.annualIncrease}` : '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">ملاحظات الراتب</span>
                      <strong className="text-sm text-amber-400 mt-1 block">{selectedEmployee.salaryNotes || '-'}</strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-[#A78BFA] block">تاريخ التفعيل بالنظام</span>
                      <strong className="text-sm text-white font-mono mt-1 block">
                        {selectedEmployee.createdAt ? (
                          selectedEmployee.createdAt.toDate ? 
                            selectedEmployee.createdAt.toDate().toLocaleDateString('ar-EG') : 
                            new Date(selectedEmployee.createdAt.seconds * 1000).toLocaleDateString('ar-EG')
                        ) : '-'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Section 6: Data Completion Status */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-[#A78BFA] border-r-2 border-[#7C3AED] pr-2">
                    موقف استكمال البيانات والملاحظات
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className={`p-4 rounded-2xl border ${
                      selectedEmployee.dataCompleted 
                        ? 'bg-[#10B981]/10 border-emerald-500/10' 
                        : 'bg-amber-500/10 border-amber-500/10'
                    }`}>
                      <span className="text-[10px] text-[#A78BFA] block">حالة استكمال المستندات والبيانات</span>
                      <strong className={`text-sm mt-1 block font-black ${
                        selectedEmployee.dataCompleted ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {selectedEmployee.dataCompleted ? "تم استكمال البيانات" : "باقي استكمال البيانات"}
                      </strong>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 md:col-span-2">
                      <span className="text-[10px] text-[#A78BFA] block">الملاحظات وتفاصيل الاستكمال</span>
                      <p className="text-sm text-white mt-1 leading-relaxed font-bold">
                        {selectedEmployee.dataCompletedNotes || "لا توجد ملاحظات أو متطلبات معلقة لهذا الموظف."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-[#12071F]/50 border-t border-white/5 flex items-center justify-end">
                <button
                  onClick={() => setSelectedEmployee(null)}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold text-xs py-3 px-6 rounded-2xl transition-all"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal (Used on Management edit list) */}
      <AnimatePresence>
        {employeeToDelete && (
          <div className="fixed inset-0 bg-[#090312]/85 backdrop-blur-xl z-50 flex items-center justify-center p-4 md:p-10" dir="rtl">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="bg-[#190a2c] border border-rose-500/30 max-w-lg w-full rounded-[2.5rem] shadow-[0_30px_100px_rgba(239,68,68,0.15)] overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 right-0 h-[100px] bg-gradient-to-b from-rose-500/10 to-transparent pointer-events-none" />
              <div className="p-8 space-y-6 text-center">
                <div className="w-16 h-16 bg-rose-500/15 rounded-2xl flex items-center justify-center text-rose-400 mx-auto border border-rose-500/20 shadow-xl">
                  <AlertTriangle size={32} />
                </div>
                <div className="space-y-2">
                  <h4 className="text-2xl font-black text-white">تأكيد حذف الموظف</h4>
                  <p className="text-[#A78BFA] text-sm leading-relaxed">
                    هل أنت متأكد من حذف الموظف <span className="text-white font-bold underline decoration-rose-500/55 underline-offset-4">"{employeeToDelete.fullName}"</span> نهائياً من تطبيق AXIS؟
                  </p>
                  <p className="text-rose-400 text-xs px-4 py-2 bg-rose-500/5 rounded-xl border border-rose-500/10 inline-block mt-2">
                    ⚠️ هذا الإجراء سيوقف صلاحيات الحساب بالكامل ولا يمكن التراجع عنه.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button
                    onClick={handleConfirmDelete}
                    className="bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-rose-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} />
                    <span>نعم، أحذف الموظف</span>
                  </button>
                  <button
                    onClick={() => setEmployeeToDelete(null)}
                    className="bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-black text-sm active:scale-95 transition-all border border-white/5"
                  >
                    إلغاء الأمر
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detailed Employee Editing Modal Drawer (With 4 internal tabs: Job, salary, personal, education) */}
      <AnimatePresence>
        {editingEmployee && (
          <div className="fixed inset-0 bg-[#090312]/90 backdrop-blur-2xl z-50 flex items-center justify-center p-4 md:p-8" dir="rtl">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 50 }}
              className="bg-[#190a2c] border border-white/10 w-full max-w-4xl rounded-[2.5rem] shadow-[0_40px_120px_rgba(124,58,237,0.15)] overflow-hidden flex flex-col my-auto max-h-[92vh]"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-white/5 relative bg-gradient-to-l from-[#7C3AED]/10 to-transparent flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-xs text-[#C084FC]">⚙️</span>
                    تعديل الملف الشامل للموظف
                  </h3>
                  <p className="text-[#A78BFA] text-xs mt-1.5 font-bold">
                    أنت تقوم بتعديل البيانات التفصيلية للموظف: <span className="text-white underline decoration-[#C084FC] underline-offset-4 font-black">{editFormData.fullName}</span>
                  </p>
                </div>
                <button 
                  onClick={() => setEditingEmployee(null)}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 text-white transition-all text-xl"
                  title="إغلاق التعديل"
                >
                  ×
                </button>
              </div>

              {/* Editing Tab Navigation */}
              <div className="flex border-b border-white/5 bg-[#12071F]/40 p-2 overflow-x-auto gap-2">
                <button
                  type="button"
                  onClick={() => setActiveEditTab('job')}
                  className={cn(
                    "px-6 py-3.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 shrink-0 whitespace-nowrap",
                    activeEditTab === 'job' ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30" : "text-[#A78BFA] hover:bg-white/5 hover:text-white"
                  )}
                >
                  💼 البيانات الوظيفية
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEditTab('financial')}
                  className={cn(
                    "px-6 py-3.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 shrink-0 whitespace-nowrap",
                    activeEditTab === 'financial' ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30" : "text-[#A78BFA] hover:bg-white/5 hover:text-white"
                  )}
                >
                  💵 الباقة المالية والراتب
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEditTab('personal')}
                  className={cn(
                    "px-6 py-3.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 shrink-0 whitespace-nowrap",
                    activeEditTab === 'personal' ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30" : "text-[#A78BFA] hover:bg-white/5 hover:text-white"
                  )}
                >
                  👤 البيانات الشخصية والاتصال
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEditTab('education')}
                  className={cn(
                    "px-6 py-3.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 shrink-0 whitespace-nowrap",
                    activeEditTab === 'education' ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30" : "text-[#A78BFA] hover:bg-white/5 hover:text-white"
                  )}
                >
                  🎓 المؤهل والتعليم
                </button>
              </div>

              {/* Scrollable Contents based on active edit tab */}
              <div className="overflow-y-auto p-8 flex-1 bg-[#12071F]/20 space-y-6">
                
                {/* 1. Job Details Tab */}
                {activeEditTab === 'job' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right"
                  >
                    {/* Employee Photo Field */}
                    <div className="md:col-span-2 flex flex-col md:flex-row items-center gap-6 bg-white/5 border border-white/5 p-6 rounded-3xl mb-4">
                      <div className="relative shrink-0">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#C084FC] flex items-center justify-center text-white text-3xl font-black overflow-hidden shadow-xl">
                          {editFormData.photoUrl ? (
                            <img src={editFormData.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            editFormData.fullName?.charAt(0) || 'E'
                          )}
                        </div>
                        <label className="absolute -bottom-2 -left-2 bg-[#7C3AED] hover:bg-[#C084FC] px-2.5 py-1 rounded-xl border-2 border-[#1E0F33] cursor-pointer text-white shadow-lg transition-all flex items-center">
                          <span className="text-[10px] font-black leading-none">تنزيل/رفع</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 2 * 1024 * 1024) {
                                  toast.error("حجم الصورة كبير جداً! الحد الأقصى هو 2 ميجابايت.");
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  if (reader.result) {
                                    setEditFormData({...editFormData, photoUrl: reader.result as string});
                                    toast.success("تم تجهيز صورة الموظف للرفع، يرجى التمرير والضغط على حفظ في الأسفل.");
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                      </div>
                      <div className="space-y-2 flex-1 w-full text-right">
                        <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">رابط الصورة المباشر للموظف</label>
                        <input 
                          type="text"
                          placeholder="https://example.com/photo.jpg"
                          className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white font-mono text-sm focus:border-[#C084FC] outline-none transition-all text-right"
                          value={editFormData.photoUrl || ''}
                          onChange={v => setEditFormData({...editFormData, photoUrl: v.target.value})}
                        />
                      </div>
                    </div>

                    {/* Code */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block font-sans">كود الموظف (roleCode)</label>
                      <input 
                        type="text"
                        placeholder="مثال: AXIS-001"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-amber-400 font-mono font-black text-right focus:border-[#C084FC] outline-none transition-all"
                        value={editFormData.roleCode || ''}
                        onChange={v => setEditFormData({...editFormData, roleCode: v.target.value})}
                      />
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الاسم بالكامل (fullName)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white font-black focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.fullName || ''}
                        onChange={v => setEditFormData({...editFormData, fullName: v.target.value})}
                      />
                    </div>

                    {/* Department list */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">القسم والادارة (department)</label>
                      <select 
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.department || ''}
                        onChange={v => setEditFormData({...editFormData, department: v.target.value})}
                      >
                        {settings?.departments?.map(d => <option key={d} value={d} className="bg-[#1E0F33]">{d}</option>)}
                      </select>
                    </div>

                    {/* Job Title list */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">المسمى المهني (jobTitle)</label>
                      <select 
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.jobTitle || ''}
                        onChange={v => setEditFormData({...editFormData, jobTitle: v.target.value})}
                      >
                        {settings?.jobTitles?.map(t => <option key={t} value={t} className="bg-[#1E0F33]">{t}</option>)}
                      </select>
                    </div>

                    {/* Company */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الشركة التابع لها (company)</label>
                      <select 
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.company || ''}
                        onChange={v => setEditFormData({...editFormData, company: v.target.value})}
                      >
                        {settings?.companies?.map(c => <option key={c} value={c} className="bg-[#1E0F33]">{c}</option>)}
                      </select>
                    </div>

                    {/* Level */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">المستوى الوظيفي (level)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.level || ''}
                        onChange={v => setEditFormData({...editFormData, level: v.target.value})}
                        placeholder="مثال: Senior, Team Lead..."
                      />
                    </div>

                    {/* Joining Date */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">تاريخ التعيين والالتحاق (joiningDate)</label>
                      <input 
                        type="date"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right font-mono"
                        value={editFormData.joiningDate || ''}
                        onChange={v => setEditFormData({...editFormData, joiningDate: v.target.value})}
                      />
                    </div>

                    {/* Termination Date */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">تاريخ انتهاء العمل (terminationDate)</label>
                      <input 
                        type="date"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right font-mono"
                        value={editFormData.terminationDate || ''}
                        onChange={v => setEditFormData({...editFormData, terminationDate: v.target.value})}
                      />
                    </div>

                    {/* Business phone */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">رقم البيزنس / العمل (businessPhone)</label>
                      <input 
                        type="tel"
                        placeholder="أدخل رقم البيزنس الخاص بالموظف..."
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white font-mono focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.businessPhone || ''}
                        onChange={v => setEditFormData({...editFormData, businessPhone: v.target.value})}
                      />
                    </div>

                    {/* Data Completion Status & Notes */}
                    <div className="md:col-span-2 border-t border-white/5 pt-6 mt-4 space-y-4">
                      <h4 className="text-sm font-black text-[#C084FC] flex items-center gap-2">
                        <span>📋</span> حالة استكمال ملف الموظف والملاحظات
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Completion Select */}
                        <div className="space-y-2">
                          <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الموقف من استكمال المستندات</label>
                          <select
                            className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right animate-pulse hover:animate-none"
                            value={editFormData.dataCompleted ? "true" : "false"}
                            onChange={e => setEditFormData({...editFormData, dataCompleted: e.target.value === "true"})}
                          >
                            <option value="false" className="bg-[#1E0F33]">باقي استكمال البيانات (غير مكتمل)</option>
                            <option value="true" className="bg-[#1E0F33]">تم استكمال البيانات (مكتمل بالكامل)</option>
                          </select>
                        </div>
                        
                        {/* Notes */}
                        <div className="space-y-2">
                          <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">ملاحظات الاستكمال والملفات المعلقة</label>
                          <input 
                            type="text"
                            placeholder="اكتب الأوراق أو البيانات المتبقية أو أي ملاحظات عامة..."
                            className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                            value={editFormData.dataCompletedNotes || ''}
                            onChange={v => setEditFormData({...editFormData, dataCompletedNotes: v.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 2. Financial Details Tab */}
                {activeEditTab === 'financial' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right"
                  >
                    {/* Basic salary */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الراتب الأساسي الشهري (basicSalary)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white font-mono focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.basicSalary || ''}
                        onChange={v => setEditFormData({...editFormData, basicSalary: parseFloat(v.target.value) || 0})}
                        placeholder="قيمة الراتب بالجنيه"
                      />
                    </div>

                    {/* Annual Increase */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">قيمة أو نسبة الزيادة السنوية (annualIncrease)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.annualIncrease || ''}
                        onChange={v => setEditFormData({...editFormData, annualIncrease: v.target.value})}
                        placeholder="مثال: 10% أو 1500 جنيه"
                      />
                    </div>

                    {/* Last Salary Update Value */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الراتب السابق قبل آخر تعديل (lastSalaryValueUpdated)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.lastSalaryValueUpdated || ''}
                        onChange={v => setEditFormData({...editFormData, lastSalaryValueUpdated: v.target.value})}
                        placeholder="الراتب قبل الزيادة الأخيرة"
                      />
                    </div>

                    {/* Last Update Date */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">تاريخ آخر تعديل للراتب (lastSalaryDateUpdated)</label>
                      <input 
                        type="date"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.lastSalaryDateUpdated || ''}
                        onChange={v => setEditFormData({...editFormData, lastSalaryDateUpdated: v.target.value})}
                      />
                    </div>

                    {/* Salary Notes */}
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">ملاحظات الراتب (salaryNotes)</label>
                      <input 
                        type="text"
                        placeholder="مثال: زيادة استثنائية، تفاصيل بدلات الانتقال، إلخ..."
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.salaryNotes || ''}
                        onChange={v => setEditFormData({...editFormData, salaryNotes: v.target.value})}
                      />
                    </div>
                  </motion.div>
                )}

                {/* 3. Personal & Contact Details */}
                {activeEditTab === 'personal' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right"
                  >
                    {/* National ID */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الرقم القومي كامل (idNo)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white font-mono focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.idNo || ''}
                        onChange={v => setEditFormData({...editFormData, idNo: v.target.value})}
                        maxLength={14}
                      />
                    </div>

                    {/* Primary Mobile */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">رقم الهاتف الجوال الشخصي (phone)</label>
                      <input 
                        type="tel"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white font-mono focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.phone || ''}
                        onChange={v => setEditFormData({...editFormData, phone: v.target.value})}
                      />
                    </div>

                    {/* Contact Email address preferred */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">البريد المفضل للمراسلة (emailAddressCheck)</label>
                      <input 
                        type="email"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white font-mono focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.emailAddressCheck || ''}
                        onChange={v => setEditFormData({...editFormData, emailAddressCheck: v.target.value})}
                      />
                    </div>

                    {/* Detailed physical Address */}
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">عنوان السكن بالتفصيل (address)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.address || ''}
                        onChange={v => setEditFormData({...editFormData, address: v.target.value})}
                      />
                    </div>

                    {/* Gender select */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الجنس (gender)</label>
                      <select 
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.gender || ''}
                        onChange={v => setEditFormData({...editFormData, gender: v.target.value})}
                      >
                        <option value="" className="bg-[#1E0F33]">اختر الجنس</option>
                        <option value="male" className="bg-[#1E0F33]">ذكر</option>
                        <option value="female" className="bg-[#1E0F33]">أنثى</option>
                      </select>
                    </div>

                    {/* Marital status */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الحالة الاجتماعية (maritalStatus)</label>
                      <select 
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3.5 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.maritalStatus || ''}
                        onChange={v => setEditFormData({...editFormData, maritalStatus: v.target.value})}
                      >
                        <option value="" className="bg-[#1E0F33]">اختر الحالة الاجتماعية</option>
                        <option value="أعزب" className="bg-[#1E0F33]">أعزب</option>
                        <option value="متزوج" className="bg-[#1E0F33]">متزوج</option>
                        <option value="مطلق" className="bg-[#1E0F33]">مطلق</option>
                        <option value="أرمل" className="bg-[#1E0F33]">أرمل</option>
                      </select>
                    </div>

                    {/* Governorate */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">المحافظة (governorate)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.governorate || ''}
                        onChange={v => setEditFormData({...editFormData, governorate: v.target.value})}
                      />
                    </div>

                    {/* Birthdate */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">تاريخ الميلاد (dateOfBirth)</label>
                      <input 
                        type="date"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.dateOfBirth || ''}
                        onChange={v => setEditFormData({...editFormData, dateOfBirth: v.target.value})}
                      />
                    </div>

                    {/* Emergency contact info */}
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">جهة اتصال الطوارئ والقرابة (emergencyContact)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC]/50 outline-none text-right"
                        value={editFormData.emergencyContact || ''}
                        onChange={v => setEditFormData({...editFormData, emergencyContact: v.target.value})}
                        placeholder="الاسم ورقم الجوال"
                      />
                    </div>
                  </motion.div>
                )}

                {/* 4. Education and Background */}
                {activeEditTab === 'education' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right"
                  >
                    {/* Degree */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">المؤهل الدراسي والدرجة (degree)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.degree || ''}
                        onChange={v => setEditFormData({...editFormData, degree: v.target.value})}
                        placeholder="بكالوريوس، ليسانس، دبلوم..."
                      />
                    </div>

                    {/* University */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الجامعة (university)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.university || ''}
                        onChange={v => setEditFormData({...editFormData, university: v.target.value})}
                        placeholder="اسم الجامعة تخرج منها"
                      />
                    </div>

                    {/* College */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">الكلية او المعهد (college)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.college || ''}
                        onChange={v => setEditFormData({...editFormData, college: v.target.value})}
                        placeholder="الكلية أو التخصص العلمي الرئيسي"
                      />
                    </div>

                    {/* Graduation year */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A78BFA] font-black uppercase tracking-widest block">سنة التخرج (graduationYear)</label>
                      <input 
                        type="text"
                        className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-3 px-5 text-white font-mono focus:border-[#C084FC] outline-none transition-all text-right"
                        value={editFormData.graduationYear || ''}
                        onChange={v => setEditFormData({...editFormData, graduationYear: v.target.value})}
                        placeholder="مثال: 2020"
                      />
                    </div>
                  </motion.div>
                )}

              </div>

              {/* Modal Actions Footer */}
              <div className="p-8 border-t border-white/5 bg-[#12071F]/50 flex items-center justify-between">
                <button
                  onClick={() => saveEdit(editFormData.id!)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm py-4 px-10 rounded-2xl transition-all shadow-xl shadow-emerald-500/10 hover:scale-[1.02] active:scale-[0.98]"
                >
                  حفظ وتثبيت التغييرات النهائية
                </button>
                <button
                  onClick={() => setEditingEmployee(null)}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold text-xs py-4 px-8 rounded-2xl transition-all"
                >
                  إلغاء التعديل
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
