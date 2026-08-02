import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

code = code.replace(/  Power\n  KeyRound,/g, `  Power,
  KeyRound,`);

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
