import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

// fix imports
code = code.replace(/Shield,\n  KeyRound,\n  PowerOffAlert,\n/g, '');
code = code.replace(/Shield,\n  KeyRound,\n  PowerOff\n/g, 'Shield,\n  KeyRound,\n  PowerOff,\n  Power\n');

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
