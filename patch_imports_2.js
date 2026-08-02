import fs from 'fs';
let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

// The file still has duplicate imports because the previous regex failed to catch them
code = code.replace(/import \{\n([^}]+)\} from 'lucide-react';/s, (match, p1) => {
    let imports = p1.split(/,\n|\n/).map(s => s.trim()).filter(s => s !== '');
    // remove duplicates
    imports = [...new Set(imports)];
    // Add KeyRound, PowerOff, Power if they don't exist
    if (!imports.includes('KeyRound')) imports.push('KeyRound');
    if (!imports.includes('PowerOff')) imports.push('PowerOff');
    if (!imports.includes('Power')) imports.push('Power');
    // Remove PowerOffAlert if it exists
    imports = imports.filter(i => i !== 'PowerOffAlert');
    
    return "import {\n  " + imports.join(",\n  ") + "\n} from 'lucide-react';";
});

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
