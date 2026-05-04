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
            configureServer(server) {
                server.middlewares.use((req, res, next) => {
                    if (req.url === '/save-capture' && req.method === 'POST') {
                        let data = '';
                        req.on('data', (chunk) => {
                            data += chunk;
                        });
                        req.on('end', () => {
                            try {
                                const body = JSON.parse(data);
                                const capturesDir = path.join(__dirname, 'captures');
                                fs.mkdirSync(capturesDir, { recursive: true });
                                const filename = `${body.name}.png`;
                                const filepath = path.join(capturesDir, filename);
                                const base64 = body.dataUrl.replace(/^data:image\/png;base64,/, '');
                                fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ ok: true, file: `captures/${filename}` }));
                            } catch (e) {
                                res.statusCode = 400;
                                res.end('Bad Request');
                            }
                        });
                    } else {
                        next();
                    }
                });
            }
        }
    ]
});
