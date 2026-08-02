import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

// Replace the duplicate insertion of handleToggleActive inside handleArchive
code = code.replace(/  const handleArchive = async \(id: string, currentStatus: string\) => {\n  const handleToggleActive = async \(id: string, currentStatus: string\) => {([\s\S]*?)  const handleResetPassword = async \(email: string\) => {([\s\S]*?)  };\n    const nextStatus = currentStatus === 'archived' \? 'active' : 'archived';/g, 
`  const handleToggleActive = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    try {
      await updateDoc(doc(db, 'employees', id), { status: nextStatus });
      toast.success(nextStatus === 'inactive' ? 'تم تعطيل حساب الموظف' : 'تم تفعيل حساب الموظف بنجاح');
    } catch (e) {
      toast.error('فشل تحديث حالة الموظف');
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      if (!email) {
        toast.error('لا يوجد بريد إلكتروني مسجل لهذا الموظف');
        return;
      }
      await sendPasswordResetEmail(auth, email);
      toast.success(\`تم إرسال رابط إعادة تعيين كلمة المرور إلى \${email}\`);
    } catch (e) {
      toast.error('فشل إرسال رابط إعادة تعيين كلمة المرور');
    }
  };

  const handleArchive = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'archived' ? 'active' : 'archived';`);

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
