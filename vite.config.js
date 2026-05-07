import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    server: {
        https: {
            key: './key.pem',
            cert: './cert.pem'
        },
        host: '0.0.0.0',
        port: 5173
    },
    plugins: [
        {
            name: 'capture-server',
            apply: 'serve',
            configureServer(server) {
                const capturesDir = path.join(__dirname, 'captures');
                
                // Ensure captures directory exists
                if (!fs.existsSync(capturesDir)) {
                    fs.mkdirSync(capturesDir, { recursive: true });
                }

                server.middlewares.use((req, res, next) => {
                    // Handle dashboard file serving
                    if (req.url === '/dashboard') {
                        const dashboardPath = path.join(__dirname, 'dashboard.html');
                        try {
                            const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
                            res.setHeader('Content-Type', 'text/html');
                            res.end(dashboardContent);
                        } catch (err) {
                            console.error('❌ [ERROR] Failed to serve dashboard:', err.message);
                            res.statusCode = 500;
                            res.end('Failed to load dashboard');
                        }
                        return;
                    }
                    
                    // Handle save-capture endpoint
                    if (req.url === '/save-capture' && req.method === 'POST') {
                        let data = '';
                        req.on('data', (chunk) => {
                            data += chunk;
                        });
                        req.on('end', () => {
                            try {
                                console.log('🔍 [DEBUG] Request body length:', data.length);
                                console.log('🔍 [DEBUG] Request body preview:', data.substring(0, 100));
                                
                                if (!data || data.trim().length === 0) {
                                    console.error('❌ [ERROR] Empty request body received');
                                    res.statusCode = 400;
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ error: 'Empty request body' }));
                                    return;
                                }
                                
                                const body = JSON.parse(data);
                                console.log('✅ [DEBUG] Parsed body keys:', Object.keys(body));
                                
                                fs.mkdirSync(capturesDir, { recursive: true });
                                const filename = `${body.name}.png`;
                                const filepath = path.join(capturesDir, filename);
                                const base64 = body.dataUrl.replace(/^data:image\/png;base64,/, '');
                                fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ ok: true, file: `captures/${filename}` }));
                            } catch (e) {
                                console.error('❌ [ERROR] JSON parsing failed:', e.message);
                                console.error('❌ [ERROR] Error details:', e);
                                console.error('❌ [ERROR] Problematic data:', data.substring(0, 200));
                                res.statusCode = 400;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'Invalid JSON', details: e.message }));
                            }
                        });
                        return;
                    }
                    
                    // Handle downloads endpoint (list files)
                    if (req.url === '/downloads' && req.method === 'GET') {
                        try {
                            const files = fs.readdirSync(capturesDir)
                                .filter(f => f.endsWith('.png') && !f.startsWith('.'))
                                .map(f => ({
                                    name: f,
                                    url: `/downloads/${f}`,
                                    size: fs.statSync(path.join(capturesDir, f)).size,
                                    modified: fs.statSync(path.join(capturesDir, f)).mtime
                                }));
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ files }));
                        } catch (err) {
                            console.error('❌ [ERROR] Failed to list files:', err.message);
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: 'Failed to list files' }));
                        }
                        return;
                    }
                    
                    // Handle file download
                    if (req.url.startsWith('/downloads/') && req.method === 'GET') {
                        const filename = req.url.replace('/downloads/', '');
                        const filePath = path.join(capturesDir, filename);
                        
                        try {
                            if (!fs.existsSync(filePath)) {
                                res.statusCode = 404;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'File not found' }));
                                return;
                            }
                            const fileContent = fs.readFileSync(filePath);
                            res.setHeader('Content-Type', 'image/png');
                            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                            res.end(fileContent);
                        } catch (err) {
                            console.error('❌ [ERROR] Failed to download file:', err.message);
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: 'Failed to download file' }));
                        }
                        return;
                    }
                    
                    // Handle file deletion
                    if (req.url.startsWith('/downloads/') && req.method === 'DELETE') {
                        const filename = req.url.replace('/downloads/', '');
                        const filePath = path.join(capturesDir, filename);
                        
                        try {
                            if (!fs.existsSync(filePath)) {
                                res.statusCode = 404;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'File not found' }));
                                return;
                            }
                            fs.unlinkSync(filePath);
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ success: true }));
                        } catch (err) {
                            console.error('❌ [ERROR] Failed to delete file:', err.message);
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: 'Failed to delete file' }));
                        }
                        return;
                    }
                    
                    next();
                });
            }
        }
    ]
});
