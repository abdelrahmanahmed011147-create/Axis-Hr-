import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');
code = code.replace(/PowerOff\n  UserPlus/g, "PowerOff,\n  UserPlus");
fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
