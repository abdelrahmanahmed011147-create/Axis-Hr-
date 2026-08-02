import fs from 'fs';
let code = fs.readFileSync('src/views/AddEmployeeModal.tsx', 'utf8');

code = code.replace(
  /interface AddEmployeeModalProps \{/,
  "interface AddEmployeeModalProps {\n  profile?: Employee | null;"
);

code = code.replace(
  /export const AddEmployeeModal: React\.FC<AddEmployeeModalProps> = \(\{/,
  "export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({"
);

code = code.replace(
  /isOpen, onClose, settings, employees, getNextEmployeeCode\n\}\) => \{/,
  "isOpen, onClose, settings, employees, getNextEmployeeCode, profile\n}) => {"
);

const handleAddRegex = /const handleAdd = async \(e: React\.FormEvent\) => \{[\s\S]*?\} finally \{/g;
const newHandleAdd = `const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      toast.error('الرجاء إدخال البريد الإلكتروني وكلمة المرور والاسم بالكامل');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/createEmployee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          company,
          department,
          jobTitle,
          employeeCode: getNextEmployeeCode(employees, 0),
          role: 'EMPLOYEE',
          createdBy: profile?.email || 'SYSTEM'
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'فشل في إضافة الموظف');
      }

      toast.success('تمت إضافة الموظف بنجاح');
      onClose();
      setEmail('');
      setPassword('');
      setFullName('');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'حدث خطأ أثناء إضافة الموظف');
    } finally {`;
code = code.replace(handleAddRegex, newHandleAdd);

// Remove the import for secondaryApp
code = code.replace(/import \{ getApps, initializeApp \} from 'firebase\/app';\nimport \{ getAuth, createUserWithEmailAndPassword \} from 'firebase\/auth';\nimport firebaseConfig from '\.\.\/\.\.\/firebase-applet-config\.json';\n/, "");

fs.writeFileSync('src/views/AddEmployeeModal.tsx', code);
