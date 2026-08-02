import fs from 'fs';

let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

// Add UserPlus to lucide-react imports if not there
if (!code.includes('UserPlus')) {
    code = code.replace(/} from 'lucide-react';/, "  UserPlus,\n} from 'lucide-react';");
}

// Add AddEmployeeModal import
code = code.replace(
  /import \{ cn \} from '\.\.\/lib\/utils';/,
  "import { cn } from '../lib/utils';\nimport { AddEmployeeModal } from './AddEmployeeModal';"
);

// Add state
code = code.replace(
  /const \[employees, setEmployees\] = useState<Employee\[\]>\(\[\]\);/,
  "const [employees, setEmployees] = useState<Employee[]>([]);\n  const [showAddModal, setShowAddModal] = useState(false);"
);

// Modify the button row
code = code.replace(
  /<div className="flex justify-end">\s*<button\s*onClick=\{exportToExcel\}/s,
  `<div className="flex justify-end gap-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-black text-sm py-4 px-8 rounded-2xl shadow-xl shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <UserPlus size={20} />
              <span>إضافة موظف جديد</span>
            </button>
            <button
              onClick={exportToExcel}`
);

// Add the modal component at the end of the return statement before the final closing tag
// Find the last </div>  );
code = code.replace(
  /<\/div>\n\s*\);\n\};/,
  `      <AddEmployeeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        settings={settings}
        employees={employees}
        getNextEmployeeCode={getNextEmployeeCode}
      />
    </div>
  );
};`
);

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
