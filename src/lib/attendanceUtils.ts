import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { formatCairoTime, calculateDeduction, calculatePermissionHours } from './utils';

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
      effectiveSettings.workStartTime = normalStartTime;

      // Check if there is an approved or pending permission for arrival time adjustment
      const dayApproved = approvedPermissionMap[dateStr] || [];
      const dayPending = pendingPermissionMap[dateStr];
      
      let permissionApplied = false;
      let activePermStatus = '';
      let activePermFrom = '';
      let activePermTo = '';

      if (dayApproved.length > 0) {
        activePermStatus = 'Approved';
        activePermFrom = dayApproved[0].fromTime;
        activePermTo = dayApproved[0].toTime;
      } else if (dayPending) {
        activePermStatus = 'Pending';
        activePermFrom = dayPending.fromTime || "09:00";
        activePermTo = dayPending.toTime || "11:00";
      }

      if (activePermStatus) {
        if (activePermFrom <= normalStartTime) {
          effectiveSettings.workStartTime = activePermTo;
          permissionApplied = true;
        }
      }

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

