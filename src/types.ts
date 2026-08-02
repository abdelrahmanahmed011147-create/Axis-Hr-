export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE' | 'HR-MASTER' | 'GM-MASTER';

export interface Employee {
  id: string; // Firebase Auth UID
  roleCode: string;
  fullName: string;
  role: UserRole;
  company: string;
  department: string;
  jobTitle: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive' | 'pending' | 'locked' | 'archived' | 'deleted';
  mustChangePassword?: boolean;
  createdAt: any;
  createdBy?: string;
  lastLogin?: any;
  uid?: string;
  
  // Detailed HR Fields
  fingerprint?: string;
  level?: string;
  joiningDate?: string;
  terminationDate?: string;
  period?: string;
  basicSalary?: number | string;
  commissionEnabled?: boolean | string;
  commissionValue?: number | string;
  lastSalaryDateUpdated?: string;
  lastSalaryValueUpdated?: number | string;
  salaryNotes?: string;
  annualIncrease?: number | string;
  address?: string;
  idNo?: string;
  businessPhone?: string;
  gender?: string;
  maritalStatus?: string;
  governorate?: string;
  dateOfBirth?: string;
  university?: string;
  college?: string;
  graduationYear?: string;
  degree?: string;
  emailAddressCheck?: string;
  emergencyContact?: string;
  degreeRelated?: string;
  photoUrl?: string;
  dataCompleted?: boolean;
  dataCompletedNotes?: string;
  activeShift?: string;
}

export interface Attendance {
  id?: string;
  userId?: string;
  roleCode: string;
  date: string; // YYYY-MM-DD
  checkInTime: any;
  checkOutTime?: any;
  delayMinutes: number;
  deductionValue: number;
  deductionReason: string;
  status: string;
  createdAt: any;
  shift?: string;
}

export interface LeaveRequest {
  id?: string;
  userId?: string;
  roleCode: string;
  type: 'permission' | 'vacation_regular' | 'vacation_sick' | 'remote';
  date: string;
  fromDate?: string;
  toDate?: string;
  fromTime?: string;
  toTime?: string;
  hours?: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  adminComment?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface Settings {
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  graceMinutes: number;
  monthlyPermissionHours: number;
  permissionOverLimit: number;
  companies: string[];
  departments: string[];
  jobTitles: string[];
  evaluationAccess?: string[];
  evaluationAccessDepts?: { [empId: string]: string[] };
  morningStartTime?: string;
  morningEndTime?: string;
  eveningStartTime?: string;
  eveningEndTime?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  timestamp: string; // ISO String
  isRead: boolean;
  type: 'request' | 'employee';
  meta?: any;
}

export interface KPICriterion {
  category: 'Tech' | 'HR';
  name: string;
  weight: number; // weight out of 100
}

export interface DepartmentKPINext {
  id: string; // departmentName
  departmentName: string;
  criteria: KPICriterion[];
  updatedAt?: any;
}

export interface EvaluationEditLog {
  updatedBy: string;
  updatedByUid: string;
  updatedAt: string; // ISO String or date
  previousScores: { [criterionName: string]: number };
  previousTotalScore: number;
  newScores: { [criterionName: string]: number };
  newTotalScore: number;
}

export interface EmployeeEvaluation {
  id?: string;
  employeeId: string;
  employeeName: string;
  roleCode: string;
  department: string;
  jobTitle: string;
  month: string; // e.g. "2026-05"
  scores: { [criterionName: string]: number }; // actual values evaluated (e.g. 0 to 100)
  totalScore: number; // final weighted score out of 100
  evaluatedBy: string; // Evaluator name/email
  evaluatedByUid: string;
  createdAt: any;
  status: 'Done' | 'Pending';
  editHistory?: EvaluationEditLog[];
  techNotes?: string;
  hrNotes?: string;
  showToEmployee?: boolean;
}


