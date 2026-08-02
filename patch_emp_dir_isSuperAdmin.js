import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

code = code.replace(
  /const \{ isAdmin, loading: authLoading \} = useAuth\(\);/,
  "const { isAdmin, isSuperAdmin, loading: authLoading, profile } = useAuth();"
);

// Add Employee Button
const addBtnRegex = /<button\s*onClick=\{\(\) => setShowAddModal\(true\)\}\s*className="flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-black text-sm py-4 px-8 rounded-2xl shadow-xl shadow-blue-500\/10 hover:shadow-blue-500\/20 hover:scale-\[1\.02\] active:scale-\[0\.98\] transition-all"\s*>\s*<UserPlus size=\{20\} \/>\s*<span>إضافة موظف جديد<\/span>\s*<\/button>/;
code = code.replace(addBtnRegex, `{isSuperAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-black text-sm py-4 px-8 rounded-2xl shadow-xl shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <UserPlus size={20} />
              <span>إضافة موظف جديد</span>
            </button>
)}`);

// Edit buttons column header
code = code.replace(
  /<th className="px-6 py-4 text-center">إجراءات<\/th>/,
  "{isSuperAdmin && <th className=\"px-6 py-4 text-center\">إجراءات</th>}"
);

// The Edit buttons
const actionButtonsRegex = /<td className="px-6 py-5 align-middle text-center">\s*<div className="flex items-center justify-center gap-2">[\s\S]*?<\/div>\s*<\/td>/;
code = code.replace(actionButtonsRegex, `{isSuperAdmin && (
  <td className="px-6 py-5 align-middle text-center">
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={() => handleEdit(emp)}
        className="inline-flex items-center justify-center p-2.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/10 rounded-xl text-blue-400 hover:text-blue-300 transition-all"
        title="تعديل"
      >
        <Edit size={16} />
      </button>
      <button
        onClick={() => handleResetPassword(emp.email)}
        className="inline-flex items-center justify-center p-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/10 rounded-xl text-yellow-400 hover:text-yellow-300 transition-all"
        title="إعادة تعيين كلمة المرور"
      >
        <KeyRound size={16} />
      </button>
      <button
        onClick={() => handleToggleActive(emp.id, emp.status)}
        className={cn(
          "inline-flex items-center justify-center p-2.5 border rounded-xl transition-all",
          emp.status === 'active' 
            ? "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/10 text-amber-400 hover:text-amber-300"
            : "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/10 text-emerald-400 hover:text-emerald-300"
        )}
        title={emp.status === 'active' ? "تعطيل الحساب" : "تفعيل الحساب"}
      >
        {emp.status === 'active' ? <PowerOff size={16} /> : <Power size={16} />}
      </button>
      <button
        onClick={() => setEmployeeToDelete(emp)}
        className="inline-flex items-center justify-center p-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/10 rounded-xl text-rose-400 hover:text-rose-300 transition-all"
        title="حذف الموظف"
      >
        <Trash2 size={16} />
      </button>
    </div>
  </td>
)}`);

// Update add employee modal to hit backend
// Pass current user to add employee modal to log 'createdBy'
code = code.replace(
  /<AddEmployeeModal\s*isOpen=\{showAddModal\}/,
  "<AddEmployeeModal\n        isOpen={showAddModal}\n        profile={profile}"
);

// We need to add audit logging for deleting, toggling, resetting password.
// Adding audit log imports
if (!code.includes("collection, doc, getDocs")) {
    code = code.replace(
        /import \{ collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, deleteDoc, getDocs, writeBatch \} from 'firebase\/firestore';/,
        "import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, deleteDoc, getDocs, writeBatch, setDoc } from 'firebase/firestore';"
    );
}
// Delete audit log
const deleteConfirmRegex = /await deleteDoc\(doc\(db, 'employees', employeeToDelete\.id\)\);\n\s*toast\.success\('تم حذف الموظف بنجاح'\);/;
code = code.replace(deleteConfirmRegex, `await deleteDoc(doc(db, 'employees', employeeToDelete.id));
      await setDoc(doc(collection(db, 'audit_logs')), {
        action: 'DELETE_EMPLOYEE',
        targetUserEmail: employeeToDelete.email,
        performedBy: profile?.email || 'SYSTEM',
        timestamp: serverTimestamp()
      });
      toast.success('تم حذف الموظف بنجاح');`);

// Toggle status audit log
const toggleStatusRegex = /await updateDoc\(doc\(db, 'employees', empId\), \{\n\s*status: newStatus\n\s*\}\);/;
code = code.replace(toggleStatusRegex, `await updateDoc(doc(db, 'employees', empId), {
        status: newStatus
      });
      const empEmail = employees.find(e => e.id === empId)?.email;
      await setDoc(doc(collection(db, 'audit_logs')), {
        action: newStatus === 'active' ? 'ENABLE_EMPLOYEE' : 'DISABLE_EMPLOYEE',
        targetUserEmail: empEmail,
        performedBy: profile?.email || 'SYSTEM',
        timestamp: serverTimestamp()
      });`);

// Change password audit log
const resetPasswordRegex = /await sendPasswordResetEmail\(auth, email\);\n\s*toast\.success\('تم إرسال رابط إعادة تعيين كلمة المرور'\);/;
code = code.replace(resetPasswordRegex, `await sendPasswordResetEmail(auth, email);
      await setDoc(doc(collection(db, 'audit_logs')), {
        action: 'RESET_PASSWORD',
        targetUserEmail: email,
        performedBy: profile?.email || 'SYSTEM',
        timestamp: serverTimestamp()
      });
      toast.success('تم إرسال رابط إعادة تعيين كلمة المرور بنجاح');`);

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
