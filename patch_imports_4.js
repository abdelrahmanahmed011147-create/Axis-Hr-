import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

// Just inject them cleanly at the end of the imports
code = code.replace(/import \{\n([^}]+)\} from 'lucide-react';/s, (match, p1) => {
    return `import {
${p1},
KeyRound,
PowerOff,
Power
} from 'lucide-react';`;
});

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
