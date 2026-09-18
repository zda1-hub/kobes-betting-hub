import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {TelegramClient,Api}=require('teleproto');
const {StringSession}=require('teleproto/sessions');
const {telegramConfig,saveTelegramSession,loadTelegramSession}=require('../bot/lib/telegram-session');
const {Logger}=require('teleproto/extensions/Logger');
const {telegramLoginError}=require('../bot/lib/telegram-login-error');

// The account holder types directly into Render Web Shell. Never echo phone,
// login code, password or session; never store credentials in command history.
function privateQuestion(prompt) {
  if(!process.stdin.isTTY)throw new Error('Interactive Render terminal required.');
  process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve,reject)=>{
    let value='';
    const finish=(error)=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value.trim());};
    const read=chunk=>{for(const char of chunk.toString('utf8')){
      if(char==='\u0003'){finish(new Error('Login cancelled.'));return;}
      if(char==='\r'||char==='\n'){finish();return;}
      if(char==='\u007f'||char==='\b')value=value.slice(0,-1);
      else if(char>=' '&&char<='~')value+=char;
    }};
    process.stdin.on('data',read);
  });
}
const config=telegramConfig();
const log=new Logger('none');
const client=new TelegramClient(new StringSession(await loadTelegramSession(config)||''),config.apiId,config.apiHash,
  {connectionRetries:2,baseLogger:log,deviceModel:'KBH cloud read-only approvals',appVersion:'1.0.0'});
try {
  console.log('Authorize only your existing account. Input is hidden. No Telegram messages will be sent.');
  await client.start({phoneNumber:()=>privateQuestion('Telegram phone number (include country code): '),
    phoneCode:()=>privateQuestion('Telegram login code: '),password:()=>privateQuestion('Telegram 2FA password (if enabled): '),
    firstAndLastNames:()=>{throw new Error('New account registration is not allowed.');},
    onError:(error)=>{const diagnosis=telegramLoginError(error);console.error(diagnosis.message);return diagnosis.stop;}});
  const invite=await client.invoke(new Api.messages.CheckChatInvite({hash:'MSjz78jJJoQ5NzRi'}));
  if(String(invite.chat?.id)!==config.channelId || !invite.chat?.broadcast || !invite.chat?.accessHash)throw new Error('Already-joined CAPPERS FREE channel could not be verified.');
  await saveTelegramSession(config,client.session.save());
  await fs.writeFile(path.join(config.root,'channel-peer.json'),JSON.stringify({channelId:config.channelId,accessHash:String(invite.chat.accessHash)}),{mode:0o600});
  console.log('Telegram session saved encrypted on the Render persistent disk. The reader can start without your laptop.');
} catch { console.error('Telegram authorization did not complete. No session value was printed.');process.exitCode=1; }
finally {await client.disconnect();process.stdin.pause();}
