import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, addMinutes, differenceInMinutes, isWithinInterval, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export function getCairoNow() {
  const now = new Date();
  const offset = getCairoOffset(now);
  const localOffset = now.getTimezoneOffset();
  return new Date(now.getTime() + (offset + localOffset) * 60000);
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

export function calculateDeduction(checkInTime: string, settings: any) {
  // checkInTime is "HH:mm"
  const [h, m] = checkInTime.split(':').map(Number);
  const now = getCairoNow();
  const checkIn = new Date(now);
  checkIn.setHours(h, m, 0, 0);

  const startStr = settings.workStartTime || "09:00";
  const [sh, sm] = startStr.split(':').map(Number);
  const startTime = new Date(now);
  startTime.setHours(sh, sm, 0, 0);

  const diff = differenceInMinutes(checkIn, startTime);

  if (diff <= (settings.graceMinutes || 15)) {
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

