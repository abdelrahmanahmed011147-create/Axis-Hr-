import fs from 'fs';

let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

// Remove pendingCount line
code = code.replace(/const pendingCount = employees\.filter\(e => e\.status === 'pending'\)\.length;\n/g, "");

// Remove pending filter from Completion Filter
code = code.replace(/<option value="pending">باقي استكمال البيانات<\/option>\n/g, "");
code = code.replace(/<option value="pending">قيد الانتظار<\/option>\n/g, "");
code = code.replace(/\(completionFilter === 'pending' && emp\.dataCompleted !== true\);/g, "false;");

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
