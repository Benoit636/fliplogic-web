// Configuration check, run at startup and with `npm run check`.
// Errors stop the server in production; warnings are printed so they get fixed before the pilot.
import fs from 'node:fs';
import path from 'node:path';
import { config, isProduction } from './config.js';

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
    return true;
  } catch {
    return false;
  }
}

export function checkConfig() {
  const errors = [];
  const warnings = [];
  const notes = [];
  if (isProduction) {
    if (config.appSecret === 'dev-insecure-secret-change-me') errors.push("APP_SECRET is not set (it encrypts stored tokens and must never change after launch).");
    else if (config.appSecret.length < 32) errors.push('APP_SECRET is too short: use at least 32 random characters.');
    if (!/^https:\/\//.test(config.appUrl)) warnings.push(`APP_URL is ${config.appUrl}: use the public https:// address (invite and reset links use it).`);
    if (config.allowSignup) warnings.push('ALLOW_SIGNUP is on: anyone can create a dealership. Leave it unset for the pilot.');
  }
  if (config.databasePath !== ':memory:' && !writable(path.dirname(path.resolve(config.databasePath)))) errors.push(`Can't write the database folder for DATABASE_PATH=${config.databasePath}.`);
  if (!writable(config.mediaDir)) errors.push(`Can't write MEDIA_DIR=${config.mediaDir} (photos and post images are stored there).`);
  if (!writable(config.backupDir)) warnings.push(`Can't write BACKUP_DIR=${config.backupDir}: nightly backups will fail.`);
  if (isProduction && !path.resolve(config.databasePath).startsWith('/data/') && config.databasePath !== ':memory:')
    warnings.push(`DATABASE_PATH=${config.databasePath} is not on the /data disk: make sure it is on persistent storage, or data is lost on redeploy.`);
  if (!config.superadminEmails.length) warnings.push('SUPERADMIN_EMAILS is empty: nobody can open the /admin console.');
  if (!config.resendApiKey) notes.push('Email is off (RESEND_API_KEY): invite links are shown on screen to copy, and password-reset emails are not sent.');
  if (!config.anthropicApiKey) notes.push('AI is off (ANTHROPIC_API_KEY): captions come from the built-in English/French templates.');
  notes.push(config.pilotMode ? 'Pilot mode is ON: no social connections, no inbox, AI chat, autopilot or billing.' : 'Pilot mode is off (set PILOT_MODE=1 for the pilot).');
  notes.push(`Sessions end after ${config.sessionIdleHours} hours without activity.`);
  return { errors, warnings, notes };
}

export function printConfigReport({ errors, warnings, notes }, log = console.log) {
  for (const e of errors) log(`✖ ${e}`);
  for (const w of warnings) log(`⚠ ${w}`);
  for (const n of notes) log(`• ${n}`);
  if (!errors.length && !warnings.length) log('✔ Configuration looks good.');
}

// `npm run check`
if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  const report = checkConfig();
  printConfigReport(report);
  process.exit(report.errors.length ? 1 : 0);
}
