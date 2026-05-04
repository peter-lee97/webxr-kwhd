import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        {
            name: 'capture-server',
            configureServer(server) {
                server.middlewares.use('/save-capture', async (req, res) => {
                    if (req.method !== 'POST') {
                        res.statusCode = 405;
                        res.end('Method Not Allowed');
                        return;
                    }

                    const chunks = [];
                    for await (const chunk of req) {
                        chunks.push(chunk);
                    }

                    let body;
                    try {
                        body = JSON.parse(Buffer.concat(chunks).toString());
                    } catch {
                        res.statusCode = 400;
                        res.end('Bad Request');
                        return;
                    }

                    const capturesDir = path.join(__dirname, 'captures');
                    fs.mkdirSync(capturesDir, { recursive: true });

                    const filename = `${body.name}.png`;
                    const filepath = path.join(capturesDir, filename);
                    const base64 = body.dataUrl.replace(/^data:image\/png;base64,/, '');
                    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));

                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true, file: `captures/${filename}` }));
                });
            }
        }
    ]
});
