import fs from 'fs';

let code = fs.readFileSync('src/views/EmployeesDirectoryView.tsx', 'utf8');

// The active tab state
code = code.replace(/const \[activeTab, setActiveTab\] = useState\<'directory' \| 'pending'\>\('directory'\);/, "const [activeTab, setActiveTab] = useState<'directory'>('directory');");

// The navigation buttons for tabs
code = code.replace(/\{?\/\* Tab switch Navigation in top block \*\/\}?[\s\S]*?<\/button>\s*<\/div>/, "");

// Remove the whole pending tab block
const pendingTabRegex = /\{activeTab === 'pending' && \([\s\S]*?\}\s*\)\}/;
code = code.replace(pendingTabRegex, "");

fs.writeFileSync('src/views/EmployeesDirectoryView.tsx', code);
