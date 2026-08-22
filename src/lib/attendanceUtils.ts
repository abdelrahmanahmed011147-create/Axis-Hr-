import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { formatCairoTime, formatCairoDate, calculateDeduction, calculatePermissionHours, resolveEffectiveWorkStart } from './utils';
import { Employee, Attendance, LeaveRequest } from '../types';

const getCheckInDate = (checkInTime: any) => {
  if (!checkInTime) return null;
  if (typeof checkInTime.toDate === 'function') return checkInTime.toDate();
  if (checkInTime.seconds) return new Date(checkInTime.seconds * 1000);
  if (checkInTime instanceof Date) return checkInTime;
  return new Date(checkInTime);
};

/**
 * Recalculates delay minutes and deductions for all attendance logs in a user's month,
 * applying permission consumption and over-limit penalties.
 */
export async function recalculateMonthlyAttendance(userId: string, yearMonthStr: string) {
  try {
    // 1. Fetch system config settings
    const settingsSnap = await getDoc(doc(db, 'settings', 'system_config'));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};

    // 2. Fetch all permission requests for this user in this month
    const reqQuery = query(
      collection(db, 'requests'),
      where('userId', '==', userId),
      where('type', '==', 'permission')
    );
    const reqSnap = await getDocs(reqQuery);
    const allPermissions = reqSnap.docs
      .map(d => ({ id: d.id, ...d.data() as any }))
      .filter((r: any) => r.date && r.date.startsWith(yearMonthStr));

    // Filter approved permissions and sort chronologically for cumulative sum
    const approvedPermissions = allPermissions.filter((r: any) => r.status === 'Approved');
    approvedPermissions.sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Keep running sum of approved hours
    let runningSum = 0;
    const approvedPermissionMap: { [date: string]: { 
      fromTime: string, 
      toTime: string, 
      hours: number,
      extraDeduction: number 
    }[] } = {};

    for (const p of approvedPermissions) {
      const h = calculatePermissionHours(p.fromTime, p.toTime);
      const prevSum = runningSum;
      runningSum += h;

      let extraDeduction = 0;
      if (runningSum > 5) {
        const overHours = prevSum >= 5 ? h : (runningSum - 5);
        extraDeduction = Number((overHours * 0.25).toFixed(2));
      }

      if (!approvedPermissionMap[p.date]) {
        approvedPermissionMap[p.date] = [];
      }
      approvedPermissionMap[p.date].push({
        fromTime: p.fromTime || "09:00",
        toTime: p.toTime || "11:00",
        hours: h,
        extraDeduction
      });
    }

    // Also get pending permissions mapped by date to adjust arrival times temporarily
    const pendingPermissions = allPermissions.filter((r: any) => r.status === 'Pending');
    const pendingPermissionMap: { [date: string]: any } = {};
    for (const p of pendingPermissions) {
      pendingPermissionMap[p.date] = p;
    }

    // 3. Fetch all attendance documents for this user
    const attQuery = query(
      collection(db, 'attendance'),
      where('userId', '==', userId)
    );
    const attSnap = await getDocs(attQuery);
    const monthlyAttDocs = attSnap.docs.filter(d => d.data().date && d.data().date.startsWith(yearMonthStr));

    // 4. Recalculate each attendance document
    for (const attDoc of monthlyAttDocs) {
      const attData = attDoc.data();
      const dateStr = attData.date;
      const checkInDate = getCheckInDate(attData.checkInTime);
      if (!checkInDate) continue;

      let effectiveSettings = { ...settings };
      const currentShift = attData.shift || 'morning';
      const normalStartTime = currentShift === 'evening'
        ? (effectiveSettings.eveningStartTime || "12:00")
        : (effectiveSettings.morningStartTime || "09:00");

      // Check if there is an approved or pending permission for arrival time adjustment
      const dayApproved = approvedPermissionMap[dateStr] || [];
      const dayPending = pendingPermissionMap[dateStr];

      let activePermStatus = '';
      let activePermission: { fromTime: string; toTime: string } | null = null;

      if (dayApproved.length > 0) {
        activePermStatus = 'Approved';
        activePermission = { fromTime: dayApproved[0].fromTime, toTime: dayApproved[0].toTime };
      } else if (dayPending) {
        activePermStatus = 'Pending';
        activePermission = { fromTime: dayPending.fromTime || "09:00", toTime: dayPending.toTime || "11:00" };
      }

      // effective work start = permission end time, but ONLY for a "morning
      // permission" (one that starts at or before the normal shift start).
      // See resolveEffectiveWorkStart in lib/utils.ts - this is the single
      // source of truth for that rule, shared with dataHealer.ts and
      // EmployeePortal.tsx so all recalculation paths agree.
      const { workStartTime, permissionApplied } = resolveEffectiveWorkStart(normalStartTime, activePermission);
      effectiveSettings.workStartTime = workStartTime;

      // checkInDate is derived from the attendance record's own Firestore
      // checkInTime timestamp (never from "now"), so this correctly reflects
      // the actual historical check-in time even when recalculating a past
      // date.
      const timeStr = formatCairoTime(checkInDate, 'HH:mm');
      const { delayMinutes, deduction, reason } = calculateDeduction(timeStr, effectiveSettings);

      let totalDeduction = deduction;
      let deductionReason = reason;

      if (permissionApplied) {
        if (activePermStatus === 'Approved') {
          deductionReason = `إذن صباحي معتمد: ${reason}`;
        } else {
          deductionReason = `إذن صباحي معلق (مؤقت): ${reason}`;
        }
      }

      // Add overlimit deduction
      let dayExtraDeduction = 0;
      for (const dp of dayApproved) {
        if (dp.extraDeduction > 0) {
          dayExtraDeduction += dp.extraDeduction;
        }
      }

      if (dayExtraDeduction > 0) {
        totalDeduction += dayExtraDeduction;
        const extraReason = `خصم تجاوز رصيد الأذونات (${dayExtraDeduction} يوم)`;
        if (deductionReason === "In Time" || !deductionReason) {
          deductionReason = extraReason;
        } else {
          deductionReason = `${deductionReason} + ${extraReason}`;
        }
      }

      // Update attendance document
      await updateDoc(doc(db, 'attendance', attDoc.id), {
        delayMinutes,
        deductionValue: Number(totalDeduction.toFixed(2)),
        deductionReason,
      });
    }

  } catch (err) {
    console.error("Error in recalculateMonthlyAttendance:", err);
  }
}

/**
 * Recalculates delay minutes and deductions for a given user and date,
 * considering whether they have any active (Approved or Pending) permission.
 * Now operates at the monthly level to ensure correctness.
 */
export async function recalculateAttendanceForUserAndDate(userId: string, dateStr: string) {
  const yearMonth = dateStr.substring(0, 7); // e.g. "2026-06"
  await recalculateMonthlyAttendance(userId, yearMonth);
}

/**
 * Resolves what a single calendar date means for one employee: present/late
 * (an actual logged attendance document always wins first), approved
 * vacation, an approved/pending permission, weekend, admin exemption
 * (GM-MASTER/HR-MASTER), or - only once every one of those is ruled out for
 * a date that has already passed - "غائب" (absent). Today gets "لم يحضر بعد"
 * and future dates get "لم يبدأ الدوام بعد" instead of a true absence label,
 * since those days haven't actually been missed yet.
 *
 * This is the single shared resolver for "what happened on date X for
 * employee Y" - used by EmployeePortal's attendance history and by
 * Admin/HR's daily logs and per-employee detail view, so "absent" means the
 * exact same thing everywhere in the app.
 */
export function getEmployeeDailyStatus(
  emp: Employee,
  date: string,
  attendanceLogs: Attendance[],
  requests: LeaveRequest[]
) {
  const log = attendanceLogs.find(a => {
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
}

/**
 * Returns every "YYYY-MM-DD" calendar date from start to end (inclusive).
 * Does all arithmetic in a fixed UTC frame (Date.UTC + getUTC* accessors)
 * instead of local Date getters, so the result never shifts by a day
 * depending on the browser/server's local timezone - "2026-08-17" in,
 * "2026-08-17" out, always.
 */
export function getDateRangeArray(start: string, end: string): string[] {
  if (!start || !end) return [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if ([sy, sm, sd, ey, em, ed].some(n => isNaN(n))) return [];

  const dates: string[] = [];
  let cursor = Date.UTC(sy, sm - 1, sd);
  const endTime = Date.UTC(ey, em - 1, ed);
  while (cursor <= endTime) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
    cursor += 24 * 60 * 60 * 1000;
  }
  return dates;
}