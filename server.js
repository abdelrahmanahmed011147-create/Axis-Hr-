import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory paths in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Hostinger passes the port dynamically via process.env.PORT
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Serve built static assets from 'dist' directory
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback routing: redirect all unknown requests to index.html for React SPA Router
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server is successfully running on http://${HOST}:${PORT}`);
});
