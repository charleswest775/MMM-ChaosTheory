/* Serves the repo for dev/preview.html:
 *   node dev/serve.js [port]     (default 8765)
 * then open http://localhost:8765/dev/preview.html
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const port = Number(process.argv[2]) || 8765;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

http.createServer((req, res) => {
	const file = path.join(root, path.normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)));
	if (!file.startsWith(root)) return res.writeHead(403).end();
	fs.readFile(file, (err, data) => {
		if (err) return res.writeHead(404).end();
		res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" }).end(data);
	});
}).listen(port, () => console.log(`http://localhost:${port}/dev/preview.html`));
