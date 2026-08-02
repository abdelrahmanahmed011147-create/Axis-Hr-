import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

code = code.replace(/      \{\/\* Tab 3: Employees Pending Activation \*\/\}\n\s*<\/div>\n\s*\)\}\n\s*<\/div>\n\s*<\/div>\n\s*\)\}/, "");

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
