const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const TELEGRAM_CHANNEL_ID = '3593544389';
function telegramConfig(env = process.env) {
  const apiId = Number(env.TELEGRAM_API_ID || 0), apiHash = String(env.TELEGRAM_API_HASH || '');
  const root = env.TELEGRAM_DATA_ROOT || '/var/data/telegram';
  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !/^[a-f0-9]{32}$/i.test(apiHash)) throw new Error('Telegram API configuration missing.');
  if (env.RENDER === 'true' && !root.startsWith('/var/data/')) throw new Error('Telegram state must use the persistent disk.');
  return { apiId, apiHash, root, sessionFile: path.join(root, 'account-session.enc.json'),
    channelId: TELEGRAM_CHANNEL_ID, enabled: env.TELEGRAM_READER_ENABLED === 'true' };
}
function sessionKey(apiHash) { return crypto.scryptSync(apiHash, 'kbh-telegram-session-v1', 32); }
function encryptSession(session, apiHash) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', sessionKey(apiHash), iv);
  const data = Buffer.concat([cipher.update(session,'utf8'),cipher.final()]);
  return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
function decryptSession(value, apiHash) {
  if (value?.version !== 1) throw new Error('Unknown encrypted session format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm',sessionKey(apiHash),Buffer.from(value.iv,'base64'));
  decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8');
}
async function saveTelegramSession(config, session) {
  await fs.mkdir(config.root,{recursive:true,mode:0o700});
  await fs.chmod(config.root,0o700);
  const temp=`${config.sessionFile}.tmp`;
  await fs.writeFile(temp,JSON.stringify(encryptSession(session,config.apiHash)),{mode:0o600});
  await fs.chmod(temp,0o600); await fs.rename(temp,config.sessionFile);
}
async function loadTelegramSession(config) {
  try {
    const stat=await fs.lstat(config.sessionFile);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Unsafe Telegram session file permissions.');
    return decryptSession(JSON.parse(await fs.readFile(config.sessionFile,'utf8')),config.apiHash);
  } catch(error) { if(error.code==='ENOENT')return null;throw error; }
}
module.exports={TELEGRAM_CHANNEL_ID,telegramConfig,encryptSession,decryptSession,saveTelegramSession,loadTelegramSession};
