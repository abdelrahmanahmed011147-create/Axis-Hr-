import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

code = code.replace(/} from 'lucide-react';/, `  KeyRound,
  PowerOff
} from 'lucide-react';`);

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
