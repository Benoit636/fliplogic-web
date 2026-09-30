import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { aiEnabled } from './ai/client.js';
import { startWorker } from './services/worker.js';

openDb();
startWorker(config.schedulerIntervalSeconds);

createApp().listen(config.port, () => {
  console.log(`Dealer Social Tool running on http://localhost:${config.port}`);
  console.log(aiEnabled() ? `AI bot: ${config.aiModel}` : 'AI bot: off (set ANTHROPIC_API_KEY to enable) — using templates');
});
