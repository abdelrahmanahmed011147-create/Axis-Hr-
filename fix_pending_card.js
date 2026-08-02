import fs from 'fs';

let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

// The pending card regex
const pendingCardRegex = /\s*\{\/\* Stat: Pending Activation \*\/\}\s*<div className="bg-\[#1E0F33\]\/85 backdrop-blur-2xl p-6 rounded-\[2rem\] border border-amber-500\/10 shadow-lg relative flex items-center justify-between">[\s\S]*?<\/div>\s*<\/div>/;
code = code.replace(pendingCardRegex, "");

// Replace grid-cols-4 with grid-cols-3 since we removed a card
code = code.replace(/<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 select-none">/, '<div className="grid grid-cols-1 md:grid-cols-3 gap-6 select-none">');

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
