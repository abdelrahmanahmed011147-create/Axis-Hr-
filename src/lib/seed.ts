import { collection, doc, setDoc, query, where, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export async function seedInitialData() {
  const batch = writeBatch(db);

  // 1. Initial Settings
  const settingsRef = doc(db, 'settings', 'system_config');
  const settingsData = {
    workStartTime: "09:00",
    workEndTime: "17:00",
    breakStartTime: "13:00",
    breakEndTime: "14:00",
    graceMinutes: 15,
    monthlyPermissionHours: 5,
    permissionOverLimit: 7,
    companies: ["مجموعة أكسس", "شركة مدار", "شركة جذور", "الأكاديمي"],
    departments: ["IT", "HR", "Sales", "Operations", "Finance"],
    jobTitles: ["Frontend Developer", "HR Manager", "Sales Representative", "Finance Analyst"]
  };
  batch.set(settingsRef, settingsData);

  // Note: We can't seed users easily without Auth, so we'll provide a button to "Seed Demo Employees"
  // but those might need linked Auth IDs. 
  // For the demo function, we'll just focus on settings and maybe some global data.
  
  await batch.commit();
  console.log("Initial settings seeded.");
}

export async function seedDemoData(currentUserId: string) {
  // This would populate some attendance and requests for the current user
  const batch = writeBatch(db);
  const employeeRef = doc(db, 'employees', currentUserId);
  const employeeSnap = await getDocs(query(collection(db, 'employees'), where('employeeCode', '==', 'EMP001')));
  
  // If we want to add random employees, we could but they won't be able to log in.
  // Instead, let's seed records for the current user if they want to see data.
}
