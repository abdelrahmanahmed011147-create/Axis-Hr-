import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A "disabled" employee account state. This is an EXPLICIT, HR-driven
 * account-control concept (lock / archive / soft-delete) and is completely
 * separate from login/HR-approval, which is now determined purely by the
 * existence of the employees/{uid} document (see AuthContext.tsx).
 *
 * `status` is optional on Employee going forward. A document with no
 * `status` field at all (or the legacy 'active' / 'pending' values) is
 * always treated as a normal, enabled employee — only these explicit
 * values disable an employee from normal listings/counters.
 */
const DISABLED_EMPLOYEE_STATUSES = new Set(['locked', 'inactive', 'archived', 'deleted']);

export function isEmployeeEnabled(emp: { status?: string } | null | undefined): boolean {
  if (!emp || !emp.status) return true;
  return !DISABLED_EMPLOYEE_STATUSES.has(emp.status);
}

const CAIRO_TZ = 'Africa/Cairo';

export function getCairoOffset(date: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    
    const cairoLocal = Date.UTC(
      Number(partMap.year),
      Number(partMap.month) - 1,
      Number(partMap.day),
      Number(partMap.hour),
      Number(partMap.minute),
      Number(partMap.second)
    );
    return Math.round((cairoLocal - date.getTime()) / 60000);
  } catch (e) {
    return 180; // Fallback to UTC+3 (Cairo summer time)
  }
}

export function getCairoNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })
  );
}

export function formatCairoDate(date: Date, pattern: string = 'yyyy-MM-dd') {
  const offset = getCairoOffset(date);
  const localOffset = date.getTimezoneOffset();
  const cairoDate = new Date(date.getTime() + (offset + localOffset) * 60000);
  return format(cairoDate, pattern);
}

export function formatCairoTime(date: Date, pattern: string = 'HH:mm:ss') {
  const offset = getCairoOffset(date);
  const localOffset = date.getTimezoneOffset();
  const cairoDate = new Date(date.getTime() + (offset + localOffset) * 60000);
  return format(cairoDate, pattern);
}

export function formatTimeTo12Hour(date: Date | null | undefined): string {
  if (!date) return '--:--';
  const offset = getCairoOffset(date);
  const localOffset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() + (offset + localOffset) * 60000);
  const hours24 = localDate.getHours();
  const minutes = localDate.getMinutes();
  const minsStr = String(minutes).padStart(2, '0');
  
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  
  let period = 'صباحًا';
  if (hours24 === 12) {
    period = minutes === 0 ? 'ظهرًا' : 'مساءً';
  } else if (hours24 > 12) {
    period = 'مساءً';
  } else if (hours24 === 0) {
    period = minutes === 0 ? 'منتصف الليل' : 'صباحًا';
  } else {
    period = 'صباحًا';
  }
  
  return `${hours12}:${minsStr} ${period}`;
}

export function formatStringTimeTo12Hour(timeStr: string | null | undefined): string {
  if (!timeStr) return '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours24 = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (isNaN(hours24) || isNaN(minutes)) return timeStr;
  
  const minsStr = String(minutes).padStart(2, '0');
  
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  
  let period = 'صباحًا';
  if (hours24 === 12) {
    period = minutes === 0 ? 'ظهرًا' : 'مساءً';
  } else if (hours24 > 12) {
    period = 'مساءً';
  } else if (hours24 === 0) {
    period = minutes === 0 ? 'منتصف الليل' : 'صباحًا';
  } else {
    period = 'صباحًا';
  }
  
  return `${hours12}:${minsStr} ${period}`;
}

export function formatDelayToArabic(minutes: number | null | undefined): string {
  if (!minutes) return '0 دقيقة';
  
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  let hrsStr = '';
  if (hrs > 0) {
    if (hrs === 1) {
      hrsStr = 'ساعة';
    } else if (hrs === 2) {
      hrsStr = 'ساعتين';
    } else if (hrs >= 3 && hrs <= 10) {
      hrsStr = `${hrs} ساعات`;
    } else {
      hrsStr = `${hrs} ساعة`;
    }
  }
  
  let minsStr = '';
  if (mins > 0) {
    if (mins === 1) {
      minsStr = 'دقيقة واحدة';
    } else if (mins === 2) {
      minsStr = 'دقيقتين';
    } else if (mins >= 3 && mins <= 10) {
      minsStr = `${mins} دقائق`;
    } else {
      minsStr = `${mins} دقيقة`;
    }
  }
  
  if (hrs > 0 && mins > 0) {
    return `${hrsStr} و${minsStr}`;
  } else if (hrs > 0) {
    return hrsStr;
  } else {
    return minsStr;
  }
}

/**
 * Converts an "HH:mm" time-of-day string into minutes since midnight.
 *
 * All delay/permission/effective-start-time math in this file is done with
 * this function instead of Date objects. Two "HH:mm" strings compared or
 * subtracted as Date objects (via setHours/differenceInMinutes) are exposed
 * to the runtime's local timezone and DST rules through the base Date they
 * are applied to; reasoning in plain minutes-since-midnight integers instead
 * removes that class of bug entirely, since a pure "HH:mm" time-of-day value
 * has no timezone or date component to get confused about.
 */
export function timeStrToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Given an employee's normal (shift-based) work start time and an active
 * permission request (Approved or Pending) for that day, returns the
 * effective work start time to use for delay calculation.
 *
 * A permission only shifts the effective start time when it is a "morning
 * permission" - i.e. it starts at or before the normal shift start (so the
 * permission covers the employee's usual arrival window). This is the
 * single source of truth for that rule: attendanceUtils.ts, dataHealer.ts,
 * and EmployeePortal.tsx all call this helper instead of each re-implementing
 * the same check, so the logic can't silently diverge between recalculation
 * paths.
 */
export function resolveEffectiveWorkStart(
  normalStartTime: string,
  permission?: { fromTime?: string; toTime?: string } | null
): { workStartTime: string; permissionApplied: boolean } {
  if (!permission) {
    return { workStartTime: normalStartTime, permissionApplied: false };
  }
  const permFrom = permission.fromTime || "09:00";
  const permTo = permission.toTime || "11:00";

  if (timeStrToMinutes(permFrom) <= timeStrToMinutes(normalStartTime)) {
    return { workStartTime: permTo, permissionApplied: true };
  }
  return { workStartTime: normalStartTime, permissionApplied: false };
}

export function calculateDeduction(checkInTime: string, settings: any) {
  // checkInTime and settings.workStartTime are both "HH:mm" time-of-day
  // strings in Cairo local time (checkInTime is produced by formatCairoTime,
  // which already handles the UTC -> Cairo conversion). We reason purely in
  // minutes-since-midnight (see timeStrToMinutes above) so this calculation
  // can never be affected by the runtime's local timezone, DST, or by which
  // calendar date happens to be "today" when this runs - it only depends on
  // the two time-of-day values themselves. This also makes the historical
  // ("attendance date != today") case automatically correct: the caller is
  // responsible for deriving checkInTime from the attendance record's own
  // check-in timestamp (via formatCairoTime), never from the current time.
  const checkInMinutes = timeStrToMinutes(checkInTime);

  const startStr = settings.workStartTime || "09:00";
  const startMinutes = timeStrToMinutes(startStr);

  const diff = checkInMinutes - startMinutes;

  if (diff <= (settings.graceMinutes ?? 15)) {
    return { delayMinutes: Math.max(0, diff), deduction: 0, reason: "In Time" };
  } else if (diff <= 30) {
    return { delayMinutes: diff, deduction: 0.25, reason: "ربع يوم خصم" };
  } else if (diff <= 60) {
    return { delayMinutes: diff, deduction: 0.5, reason: "نصف يوم خصم" };
  } else {
    return { delayMinutes: diff, deduction: 1, reason: "خصم يوم كامل" };
  }
}

export function calculatePermissionHours(fromTime?: string, toTime?: string): number {
  if (!fromTime || !toTime) return 2; // Default to 2 hours if missing
  const [fromH, fromM] = fromTime.split(':').map(Number);
  const [toH, toM] = toTime.split(':').map(Number);
  if (isNaN(fromH) || isNaN(fromM) || isNaN(toH) || isNaN(toM)) return 2;
  
  const fromMin = fromH * 60 + fromM;
  let toMin = toH * 60 + toM;
  
  if (toMin < fromMin) {
    toMin += 24 * 60; // handle overnight
  }
  
  const diffMin = toMin - fromMin;
  return Number((diffMin / 60).toFixed(2));
}