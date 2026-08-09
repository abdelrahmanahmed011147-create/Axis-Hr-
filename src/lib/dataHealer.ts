import { collection, getDocs, doc, writeBatch, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { calculateDeduction, formatCairoTime, formatCairoDate } from './utils';

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
      const normalStartTime = effectiveSettings.workStartTime || "09:00";
      let permissionApplied = false;

      if (activePermission) {
        const permFrom = activePermission.fromTime || "09:00";
        const permTo = activePermission.toTime || "11:00";

        // If the permission starts at or before normal workStartTime, it's a morning permission
        if (permFrom <= normalStartTime) {
          effectiveSettings.workStartTime = permTo;
          permissionApplied = true;
        }
      }

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
 * Finds all attendance records with a roleCode that does not match their owner's
 * current profile roleCode and updates them in a batch. This is the safest way
 * to repair historical data drift.
 * @returns A report of the operations performed.
 */
export async function syncAttendanceRoleCodes(): Promise<{ scanned: number; updated: number; errors: string[] }> {
  const report = { scanned: 0, updated: 0, errors: [] as string[] };
  try {
    // 1. Create a source-of-truth map from userId -> correct roleCode
    const employeesMap = new Map<string, string>();
    const empSnap = await getDocs(collection(db, 'employees'));
    empSnap.forEach(doc => {
      const data = doc.data();
      if (data.roleCode) {
        employeesMap.set(doc.id, data.roleCode.trim()); // Use trimmed code as the source of truth
      }
    });

    // 2. Iterate through all attendance records
    const attSnap = await getDocs(collection(db, 'attendance'));
    report.scanned = attSnap.docs.length;
    const batch = writeBatch(db);
    let updatesInBatch = 0;

    for (const attDoc of attSnap.docs) {
      const attData = attDoc.data();
      const { userId, roleCode } = attData;

      if (!userId || !employeesMap.has(userId)) continue; // Skip orphans or employees without a roleCode

      const correctRoleCode = employeesMap.get(userId);

      if (roleCode !== correctRoleCode) {
        batch.update(attDoc.ref, { roleCode: correctRoleCode });
        updatesInBatch++;
      }
    }

    if (updatesInBatch > 0) {
      await batch.commit();
      report.updated = updatesInBatch;
    }
  } catch (err: any) {
    report.errors.push(err.message);
  }
  return report;
}
