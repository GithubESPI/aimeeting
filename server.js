// server.js
// Serveur Next.js custom pour augmenter la limite des headers

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

console.log(`🚀 Starting server in ${dev ? 'development' : 'production'} mode`);
console.log(`📍 Port: ${port}`);

// ✅ Créer l'app Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    // ✅ Créer le serveur HTTP avec maxHeaderSize augmenté
    const server = createServer({
        maxHeaderSize: 32768, // 32KB au lieu de 8KB
    }, async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('❌ Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    server.listen(port, (err) => {
        if (err) throw err;
        console.log(`✅ Ready on http://${hostname}:${port}`);
        console.log(`📊 Max header size: 32KB`);
    });
});