import { collection, getDocs, doc, writeBatch, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { calculateDeduction, formatCairoTime, formatCairoDate, resolveEffectiveWorkStart, calculatePermissionHours } from './utils';
import { recalculateAttendanceForUserAndDate } from './attendanceUtils';

const getCheckInDate = (checkInTime: any) => {
  if (!checkInTime) return null;
  if (typeof checkInTime.toDate === 'function') return checkInTime.toDate();
  if (checkInTime.seconds) return new Date(checkInTime.seconds * 1000);
  if (checkInTime instanceof Date) return checkInTime;
  return new Date(checkInTime);
};

export const standardizeCode = (code: string | undefined): string => {
  if (!code) return '';
  const trimmed = code.trim();
  // If it is just a number (e.g., 5, 10, 11)
  if (/^\d+$/.test(trimmed)) {
    return `AXIS-${trimmed.padStart(3, '0')}`;
  }
  // If it is AXIS followed by numbers (like AXIS01)
  const matchAxisNoHyphen = trimmed.match(/^AXIS(\d+)$/i);
  if (matchAxisNoHyphen) {
    return `AXIS-${matchAxisNoHyphen[1].padStart(3, '0')}`;
  }
  // If it matches AXIS-X or AXIS-XX (e.g. AXIS-5, AXIS-10)
  const matchAxisHyphenShort = trimmed.match(/^AXIS-(\d+)$/i);
  if (matchAxisHyphenShort) {
    const numStr = matchAxisHyphenShort[1];
    if (numStr.length < 3) {
      return `AXIS-${numStr.padStart(3, '0')}`;
    }
  }
  return trimmed; // leave custom text codes as they are
};

export interface HealReport {
  employeesScanned: number;
  employeesUpdated: number;
  attendanceLinked: number;
  requestsLinked: number;
  kpiLinked: number;
  attendanceRecalculated: number;
  details: string[];
}

/**
 * Standardizes employee codes across all documents and heals missing link fields.
 */
export async function standardizeAndHealEmployeeData(): Promise<HealReport> {
  const report: HealReport = {
    employeesScanned: 0,
    employeesUpdated: 0,
    attendanceLinked: 0,
    requestsLinked: 0,
    kpiLinked: 0,
    attendanceRecalculated: 0,
    details: []
  };

  try {
    // 1. Fetch all employees
    const empSnap = await getDocs(collection(db, 'employees'));
    const employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    report.employeesScanned = employees.length;

    // 2. Map old codes to new codes and update employee profiles
    const codeMap: { [oldCode: string]: string } = {}; // oldCode -> newCode
    const idToNewCodeMap: { [userId: string]: string } = {}; // userId -> newCode
    const idToNameMap: { [userId: string]: string } = {}; // userId -> fullName

    const empBatch = writeBatch(db);
    let empUpdateCount = 0;

    for (const emp of employees) {
      idToNameMap[emp.id] = emp.fullName;
      const currentCode = emp.roleCode || '';
      const correctCode = standardizeCode(currentCode);

      idToNewCodeMap[emp.id] = correctCode;

      if (currentCode && correctCode && currentCode.toLowerCase() !== correctCode.toLowerCase()) {
        codeMap[currentCode.toLowerCase()] = correctCode;
        
        const empRef = doc(db, 'employees', emp.id);
        empBatch.update(empRef, { roleCode: correctCode });
        empUpdateCount++;
        report.details.push(`تحديث كود الموظف ${emp.fullName} من [${currentCode}] إلى [${correctCode}]`);
      }
    }

    if (empUpdateCount > 0) {
      await empBatch.commit();
      report.employeesUpdated = empUpdateCount;
    }

    // 3. Update attendance records (standardize roleCode + heal missing userId)
    const attSnap = await getDocs(collection(db, 'attendance'));
    const attBatch = writeBatch(db);
    let attUpdatedCount = 0;

    for (const attDoc of attSnap.docs) {
      const attData = attDoc.data() as any;
      let needsUpdate = false;
      const updatePayload: any = {};

      const currentRoleCode = attData.roleCode || '';
      const currentUserId = attData.userId || '';

      // Standardize roleCode in log if it matches an old one or needs format correction
      let targetRoleCode = currentRoleCode;
      if (currentRoleCode && codeMap[currentRoleCode.toLowerCase()]) {
        targetRoleCode = codeMap[currentRoleCode.toLowerCase()];
        updatePayload.roleCode = targetRoleCode;
        needsUpdate = true;
      } else {
        const standardLogCode = standardizeCode(currentRoleCode);
        if (currentRoleCode !== standardLogCode) {
          targetRoleCode = standardLogCode;
          updatePayload.roleCode = targetRoleCode;
          needsUpdate = true;
        }
      }

      // Heal missing userId
      let targetUserId = currentUserId;
      if (!currentUserId && targetRoleCode) {
        const foundEmp = employees.find(e => e.roleCode && e.roleCode.toLowerCase() === targetRoleCode.toLowerCase());
        if (foundEmp) {
          targetUserId = foundEmp.id;
          updatePayload.userId = targetUserId;
          needsUpdate = true;
          report.details.push(`ربط سجل حضور غير معرف بالمعرف [${foundEmp.fullName}]`);
        }
      }

      // Sync roleCode from employee ID if missing
      if (currentUserId && !targetRoleCode) {
        const correctEmpCode = idToNewCodeMap[currentUserId];
        if (correctEmpCode) {
          updatePayload.roleCode = correctEmpCode;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        attBatch.update(attDoc.ref, updatePayload);
        attUpdatedCount++;
      }
    }

    if (attUpdatedCount > 0) {
      await attBatch.commit();
      report.attendanceLinked = attUpdatedCount;
    }

    // 4. Update requests records (standardize roleCode + heal missing userId)
    const reqSnap = await getDocs(collection(db, 'requests'));
    const reqBatch = writeBatch(db);
    let reqUpdatedCount = 0;

    for (const reqDoc of reqSnap.docs) {
      const reqData = reqDoc.data() as any;
      let needsUpdate = false;
      const updatePayload: any = {};

      const currentRoleCode = reqData.roleCode || '';
      const currentUserId = reqData.userId || '';

      // Standardize roleCode in request
      let targetRoleCode = currentRoleCode;
      if (currentRoleCode && codeMap[currentRoleCode.toLowerCase()]) {
        targetRoleCode = codeMap[currentRoleCode.toLowerCase()];
        updatePayload.roleCode = targetRoleCode;
        needsUpdate = true;
      } else {
        const standardReqCode = standardizeCode(currentRoleCode);
        if (currentRoleCode !== standardReqCode) {
          targetRoleCode = standardReqCode;
          updatePayload.roleCode = targetRoleCode;
          needsUpdate = true;
        }
      }

      // Heal missing userId
      let targetUserId = currentUserId;
      if (!currentUserId && targetRoleCode) {
        const foundEmp = employees.find(e => e.roleCode && e.roleCode.toLowerCase() === targetRoleCode.toLowerCase());
        if (foundEmp) {
          targetUserId = foundEmp.id;
          updatePayload.userId = targetUserId;
          needsUpdate = true;
          report.details.push(`ربط طلب إجازة/إذن بالموظف [${foundEmp.fullName}]`);
        }
      }

      // Sync roleCode from employee ID if missing
      if (currentUserId && !targetRoleCode) {
        const correctEmpCode = idToNewCodeMap[currentUserId];
        if (correctEmpCode) {
          updatePayload.roleCode = correctEmpCode;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        reqBatch.update(reqDoc.ref, updatePayload);
        reqUpdatedCount++;
      }
    }

    if (reqUpdatedCount > 0) {
      await reqBatch.commit();
      report.requestsLinked = reqUpdatedCount;
    }

    // 5. Update kpiEvaluations records
    const kpiSnap = await getDocs(collection(db, 'kpiEvaluations'));
    const kpiBatch = writeBatch(db);
    let kpiUpdatedCount = 0;

    for (const kpiDoc of kpiSnap.docs) {
      const kpiData = kpiDoc.data() as any;
      let needsUpdate = false;
      const updatePayload: any = {};

      const currentRoleCode = kpiData.roleCode || '';
      const currentEmployeeId = kpiData.employeeId || kpiData.userId || '';

      // Standardize roleCode in evaluation
      let targetRoleCode = currentRoleCode;
      if (currentRoleCode && codeMap[currentRoleCode.toLowerCase()]) {
        targetRoleCode = codeMap[currentRoleCode.toLowerCase()];
        updatePayload.roleCode = targetRoleCode;
        needsUpdate = true;
      } else {
        const standardKpiCode = standardizeCode(currentRoleCode);
        if (currentRoleCode !== standardKpiCode) {
          targetRoleCode = standardKpiCode;
          updatePayload.roleCode = targetRoleCode;
          needsUpdate = true;
        }
      }

      // Heal missing employeeId
      let targetEmpId = currentEmployeeId;
      if (!currentEmployeeId && targetRoleCode) {
        const foundEmp = employees.find(e => e.roleCode && e.roleCode.toLowerCase() === targetRoleCode.toLowerCase());
        if (foundEmp) {
          targetEmpId = foundEmp.id;
          updatePayload.employeeId = targetEmpId;
          needsUpdate = true;
        }
      }

      // Sync roleCode from employee ID if missing
      if (currentEmployeeId && !targetRoleCode) {
        const correctEmpCode = idToNewCodeMap[currentEmployeeId];
        if (correctEmpCode) {
          updatePayload.roleCode = correctEmpCode;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        kpiBatch.update(kpiDoc.ref, updatePayload);
        kpiUpdatedCount++;
      }
    }

    if (kpiUpdatedCount > 0) {
      await kpiBatch.commit();
      report.kpiLinked = kpiUpdatedCount;
    }

    report.details.push('اكتملت عملية المعالجة وتحديث الأكواد وربط المعرفات بنجاح! 🟢');

  } catch (err: any) {
    console.error('Error in standardizeAndHealEmployeeData:', err);
    report.details.push(`فشل المعالجة: ${err.message || String(err)}`);
  }

  return report;
}

/**
 * Re-runs delay and deduction calculations across all past attendance logs,
 * incorporating whether the employee had a permission request (Approved or Pending) on that date.
 */
export async function recalculateAllAttendanceLogs(): Promise<number> {
  let updatedCount = 0;

  try {
    // 1. Fetch system settings config
    const settingsSnap = await getDoc(doc(db, 'settings', 'system_config'));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};

    // 2. Fetch all permission requests (Approved or Pending)
    const reqSnap = await getDocs(collection(db, 'requests'));
    const allPermissions = reqSnap.docs
      .map(d => ({ id: d.id, ...d.ref, ...d.data() as any }))
      .filter(r => r.type === 'permission' && (r.status === 'Approved' || r.status === 'Pending'));

    // 3. Fetch all attendance logs
    const attSnap = await getDocs(collection(db, 'attendance'));
    const attBatch = writeBatch(db);

    for (const attDoc of attSnap.docs) {
      const attData = attDoc.data() as any;
      const checkInDate = getCheckInDate(attData.checkInTime);
      if (!checkInDate) continue;

      const userId = attData.userId;
      const roleCode = attData.roleCode;
      const dateStr = attData.date; // "yyyy-MM-dd"

      if (!userId && !roleCode) continue;

      // Find if there was an active permission for this user on this specific day
      const activePermission = allPermissions.find(p => {
        const matchUser = (userId && p.userId && p.userId === userId) || 
                          (roleCode && p.roleCode && p.roleCode.toLowerCase() === roleCode.toLowerCase());
        const matchDate = p.date === dateStr;
        return matchUser && matchDate;
      });

      let effectiveSettings = { ...settings };
      // Use the employee's actual shift start time (morning/evening), same as
      // attendanceUtils.ts and EmployeePortal.tsx. The previous version of
      // this function fell back to a generic `settings.workStartTime` field
      // that the Settings screen never actually persists (it only saves
      // `morningStartTime`/`eveningStartTime`), so it was silently always
      // using the "09:00" fallback here regardless of shift - out of sync
      // with the other two recalculation paths.
      const currentShift = attData.shift || 'morning';
      const normalStartTime = currentShift === 'evening'
        ? (effectiveSettings.eveningStartTime || "12:00")
        : (effectiveSettings.morningStartTime || "09:00");

      const { workStartTime, permissionApplied } = resolveEffectiveWorkStart(
        normalStartTime,
        activePermission ? { fromTime: activePermission.fromTime, toTime: activePermission.toTime } : null
      );
      effectiveSettings.workStartTime = workStartTime;

      const timeStr = formatCairoTime(checkInDate, 'HH:mm');
      const { delayMinutes, deduction, reason } = calculateDeduction(timeStr, effectiveSettings);

      let deductionReason = reason;
      if (permissionApplied && activePermission) {
        if (activePermission.status === 'Approved') {
          deductionReason = `إذن صباحي معتمد: ${reason}`;
        } else {
          deductionReason = `إذن صباحي معلق (مؤقت): ${reason}`;
        }
      }

      // Check if values have actually changed before updating to prevent redundant writes
      const currentDelay = attData.delayMinutes ?? -1;
      const currentDeduction = attData.deductionValue ?? -1;
      const currentReason = attData.deductionReason ?? '';

      if (currentDelay !== delayMinutes || currentDeduction !== deduction || currentReason !== deductionReason) {
        attBatch.update(attDoc.ref, {
          delayMinutes,
          deductionValue: deduction,
          deductionReason,
        });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      await attBatch.commit();
    }

  } catch (err) {
    console.error('Error in recalculateAllAttendanceLogs:', err);
  }

  return updatedCount;
}

/**
 * Finds all employee documents marked as 'migrated' and ensures their related data
 * (attendance, requests, evaluations) is correctly pointing to the new user ID.
 * This is a safe, idempotent operation that can be run multiple times to fix orphaned data.
 */
export async function healMigratedUserReferences(): Promise<{ report: string[] }> {
  const report: string[] = [];
  try {
    // 1. Find all employee profiles that have been migrated.
    const migratedQuery = query(collection(db, 'employees'), where('migrated', '==', true));
    const migratedSnap = await getDocs(migratedQuery);

    if (migratedSnap.empty) {
      report.push("No migrated employee profiles found to heal. System is clean.");
      return { report };
    }

    report.push(`Found ${migratedSnap.size} migrated profiles to check for healing.`);

    for (const migratedDoc of migratedSnap.docs) {
      const oldData = migratedDoc.data();
      const oldUid = migratedDoc.id;
      const newUid = oldData.migratedTo;

      if (!newUid) {
        report.push(`[SKIPPED] Migrated doc ${oldUid} is missing the 'migratedTo' field.`);
        continue;
      }

      report.push(`Healing references from OLD [${oldUid}] to NEW [${newUid}] for ${oldData.fullName}...`);
      const batch = writeBatch(db);
      let updatedCount = 0;

      // 2. Heal 'attendance' collection
      const attQuery = query(collection(db, 'attendance'), where('userId', '==', oldUid));
      const attSnap = await getDocs(attQuery);
      if (!attSnap.empty) {
        attSnap.forEach(doc => {
          batch.update(doc.ref, { userId: newUid });
          updatedCount++;
        });
        report.push(`  - Found and queued ${attSnap.size} attendance records for update.`);
      }

      // You can add other collections like 'requests' and 'kpiEvaluations' here as well

      if (updatedCount > 0) {
        await batch.commit();
        report.push(`  - SUCCESS: Committed ${updatedCount} document updates for ${oldData.fullName}.`);
      } else {
        report.push(`  - No dangling references found for ${oldData.fullName}.`);
      }
    }

    report.push("Healing process completed successfully! 🟢");

  } catch (err: any) {
    console.error('Error during healing migrated user references:', err);
    report.push(`HEALING FAILED: ${err.message || String(err)}`);
    throw err;
  }

  return { report };
}

/**
 * Specifically heals or activates attendance records for Nada Nashaat (AXIS-011) and Zahra (AXIS-008) for today.
 * If they don't have attendance records for today, we create them marked as present.
 */
export async function healSpecificAttendanceForNadaAndZahra(): Promise<{ success: boolean; message: string }> {
  try {
    const empSnap = await getDocs(collection(db, 'employees'));
    const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

    const nada = emps.find(e => e.roleCode === 'AXIS-011' || e.fullName.toLowerCase().includes('nada'));
    const zahra = emps.find(e => e.roleCode === 'AXIS-008' || e.fullName.includes('زهراء'));

    if (!nada && !zahra) {
      return { success: false, message: "لم يتم العثور على حساب الموظفتين ندى وزهراء بقاعدة البيانات." };
    }

    const todayStr = formatCairoDate(new Date()); // e.g., "2026-06-24"
    const attSnap = await getDocs(collection(db, 'attendance'));
    const existingAtts = attSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() as any }));

    const batch = writeBatch(db);
    let updatedCount = 0;
    let createdCount = 0;

    const targets = [
      { emp: nada, roleCode: 'AXIS-011' },
      { emp: zahra, roleCode: 'AXIS-008' }
    ];

    for (const target of targets) {
      if (!target.emp) continue;
      
      const todayRecord = existingAtts.find(a => {
        const matchId = a.userId === target.emp.id;
        const matchCode = a.roleCode && a.roleCode.trim().toLowerCase() === target.roleCode.toLowerCase();
        return (matchId || matchCode) && a.date === todayStr;
      });

      if (todayRecord) {
        if (todayRecord.status !== ' حاضر' && todayRecord.status !== 'حاضر') {
          batch.update(todayRecord.ref, {
            status: ' حاضر',
            delayMinutes: 0,
            deductionValue: 0,
            deductionReason: 'حضور معتمد من الإدارة اليوم'
          });
          updatedCount++;
        }
      } else {
        const cairoTime = new Date(); // current time
        const newRecordRef = doc(collection(db, 'attendance'));
        batch.set(newRecordRef, {
          userId: target.emp.id,
          roleCode: target.roleCode,
          date: todayStr,
          checkInTime: cairoTime,
          delayMinutes: 0,
          deductionValue: 0,
          deductionReason: 'حضور معتمد من الإدارة اليوم',
          status: ' حاضر',
          createdAt: cairoTime
        });
        createdCount++;
      }
    }

    await batch.commit();
    return {
      success: true,
      message: `تم تفعيل وتصحيح حضور الموظفتين بنجاح! 🟢\nتم تحديث ${updatedCount} سجل، وتم إنشاء ${createdCount} سجل حضور جديد بالكامل لتاريخ اليوم (${todayStr}).`
    };
  } catch (err: any) {
    console.error(err);
    return { success: false, message: `فشل التعديل: ${err.message || String(err)}` };
  }
}

/**
 * A permission request ("إذن") flagged as suspicious by
 * auditSuspiciousPermissionRequests - almost always caused by an AM/PM entry
 * mistake (e.g. "1:00 AM" saved instead of "1:00 PM").
 */
export interface SuspiciousPermissionRequest {
  id: string;
  userId?: string;
  roleCode?: string;
  date?: string;
  fromTime: string;
  toTime: string;
  hours: number;
  /**
   * A same-day permission longer than this is treated as implausible.
   * Kept in sync with the MAX_REASONABLE_PERMISSION_HOURS guard in
   * EmployeePortal.tsx's request form.
   */
  suggestedToTime: string | null;
}

const MAX_REASONABLE_PERMISSION_HOURS = 8;

/**
 * Scans every 'permission' request in the 'requests' collection and flags
 * any whose computed duration (calculatePermissionHours(fromTime, toTime))
 * is longer than a same-day permission can reasonably be. This is a
 * read-only audit - it does NOT change any data. Use it to find existing
 * records affected by the AM/PM entry bug described in EmployeePortal.tsx's
 * TimeOfDayPicker, so they can be reviewed and fixed one by one with
 * fixPermissionRequestToTime below.
 *
 * For each flagged request, `suggestedToTime` is a best-guess correction:
 * if simply adding 12 hours to `toTime` would bring the duration back under
 * the threshold, that's suggested (the classic "AM instead of PM" case).
 * Otherwise `suggestedToTime` is null and the record needs manual review -
 * this function never guesses blindly and never writes anything.
 */
export async function auditSuspiciousPermissionRequests(): Promise<SuspiciousPermissionRequest[]> {
  const reqSnap = await getDocs(collection(db, 'requests'));
  const flagged: SuspiciousPermissionRequest[] = [];

  reqSnap.docs.forEach(d => {
    const data = d.data() as any;
    if (data.type !== 'permission') return;

    const fromTime = data.fromTime || '09:00';
    const toTime = data.toTime || '11:00';
    const hours = calculatePermissionHours(fromTime, toTime);

    if (hours > MAX_REASONABLE_PERMISSION_HOURS) {
      // Try the "+12 hours" AM/PM-flip correction and see if it lands in a
      // sane range. E.g. fromTime "09:00", toTime "01:00" (meant "13:00"):
      // shifting toTime's hour by 12 gives "13:00", duration 4h - sane.
      const [toH, toM] = toTime.split(':').map(Number);
      let suggestedToTime: string | null = null;
      if (!isNaN(toH) && !isNaN(toM) && toH < 12) {
        const candidate = `${String(toH + 12).padStart(2, '0')}:${String(toM).padStart(2, '0')}`;
        const candidateHours = calculatePermissionHours(fromTime, candidate);
        if (candidateHours > 0 && candidateHours <= MAX_REASONABLE_PERMISSION_HOURS) {
          suggestedToTime = candidate;
        }
      }

      flagged.push({
        id: d.id,
        userId: data.userId,
        roleCode: data.roleCode,
        date: data.date,
        fromTime,
        toTime,
        hours,
        suggestedToTime,
      });
    }
  });

  return flagged;
}

/**
 * Applies a corrected `toTime` to a single permission request (typically one
 * returned by auditSuspiciousPermissionRequests), updates its stored `hours`
 * field to match, and triggers a recalculation of that user's attendance for
 * that date so delayMinutes/deductionValue on the attendance record are
 * fixed too. This intentionally fixes ONE record at a time rather than
 * bulk-rewriting payroll-affecting data automatically - review each
 * suggestion before applying it.
 */
export async function fixPermissionRequestToTime(
  requestId: string,
  correctedToTime: string
): Promise<{ success: boolean; message: string }> {
  try {
    const reqRef = doc(db, 'requests', requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) {
      return { success: false, message: 'لم يتم العثور على طلب الإذن.' };
    }
    const data = reqSnap.data() as any;
    if (data.type !== 'permission') {
      return { success: false, message: 'هذا الطلب ليس طلب إذن.' };
    }

    const fromTime = data.fromTime || '09:00';
    const newHours = calculatePermissionHours(fromTime, correctedToTime);

    await updateDoc(reqRef, {
      toTime: correctedToTime,
      hours: newHours,
    });

    if (data.userId && data.date) {
      await recalculateAttendanceForUserAndDate(data.userId, data.date);
    }

    return {
      success: true,
      message: `تم تصحيح وقت الانتهاء إلى ${correctedToTime} (${newHours} ساعة) وإعادة حساب الحضور بنجاح.`,
    };
  } catch (err: any) {
    console.error('Error in fixPermissionRequestToTime:', err);
    return { success: false, message: `فشل التصحيح: ${err.message || String(err)}` };
  }
}