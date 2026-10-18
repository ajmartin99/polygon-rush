import { loadConfig } from './config.ts';
import { createServer, VERSION } from './index.ts';

const cfg = loadConfig();
const server = createServer(cfg);
const port = await server.listen();
console.log(`Polygon Rush community server ${VERSION} on :${port} (${cfg.production ? 'production' : 'development'})`);
if (!cfg.adminToken) console.log('Moderation API disabled: set ADMIN_TOKEN (24+ characters) to enable it.');
if (!cfg.freeChat) console.log('Free Chat is off (set FREE_CHAT=true to turn it on).');
else if (!cfg.smtpUrl) console.log(cfg.production ? 'WARNING: SMTP_URL is not set, so Free Chat sign-up is unavailable.' : 'No SMTP_URL: verification codes are printed here (development only).');

const stop = () => {
  console.log('Shutting down…');
  void server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
