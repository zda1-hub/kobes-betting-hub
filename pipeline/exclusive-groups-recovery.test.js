const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('group recovery is private-only, cross-feed deduplicated, resumable and holds uncertain sends', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kbh-exclusive-groups-test-'));
  try {
    const code = `
      const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
      const {recoverAuditedExclusive}=require('./pipeline/collect-x');
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      let sent=[];global.fetch=async(url,init={})=>{
        assert.ok(String(url).startsWith('https://discord.com/api/v10/channels/'));
        if(init.method==='POST'){
          assert.equal(String(url),'https://discord.com/api/v10/channels/private-approvals/messages');
          const body=JSON.parse(init.body);assert.equal(body.components[0].components[0].disabled,true);
          sent.push(body);return new Response(JSON.stringify({id:'receipt-'+sent.length}),{status:200,headers:{'content-type':'application/json'}});
        }
        return new Response(JSON.stringify({name:'exclusives'}),{status:200});
      };
      (async()=>{
        const dir=path.join(process.env.X_REVIEW_QUEUE_PATH,date);await fs.mkdir(dir,{recursive:true});
        await fs.writeFile(path.join(dir,date.replaceAll('-','')+'-010.json'),JSON.stringify({source:{},discord_review_message_id:'existing',analysis:{extraction:{source_capper_name:'BankrollBill',plays:[{selection:'Twins/Angels under 8 -130 (1.5U)'}]}}}));
        const row={source_handle:'BettingBuddyy',external_post_id:'2100726544016486400',posted_at:new Date().toISOString(),raw_text:'BANKROLL BILL\\nTwins/Angels under 8 -130 (1.5U)\\nTexas Rangers ML +102 (1U)\\n─────────\\nTROY WEST\\nLions +5.5 (-110)\\n─────────\\nTCC\\nKC @ HOU'};
        const first=await recoverAuditedExclusive(row);assert.equal(sent.length,2);assert.equal(first.groups[2].status,'HELD');
        assert.equal(sent[0].embeds[0].description,'BANKROLL BILL\\n• Texas Rangers ML +102 (1U)');
        assert.equal(sent[1].embeds[0].description,'TROY WEST\\n• Lions +5.5 (-110)');
        await recoverAuditedExclusive(row);assert.equal(sent.length,2);
        const files=await fs.readdir(dir);assert.ok(files.includes(date.replaceAll('-','')+'-011.json'));assert.ok(files.includes(date.replaceAll('-','')+'-012.json'));
        const reserved=path.join(dir,date.replaceAll('-','')+'-012.json'),packet=JSON.parse(await fs.readFile(reserved,'utf8'));
        delete packet.discord_review_message_id;packet.status='RECOVERY_SEND_UNCERTAIN';await fs.writeFile(reserved,JSON.stringify(packet));
        await assert.rejects(recoverAuditedExclusive(row),/reconciliation/);assert.equal(sent.length,2);
        await assert.rejects(recoverAuditedExclusive({...row,posted_at:'2020-01-01T12:00:00Z'}),/today/);
      })().catch(e=>{console.error(e);process.exitCode=1;});
    `;
    const result = spawnSync(process.execPath, ['-e', code], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 10000,
      env: { ...process.env, DATABASE_URL: '', AUDIT_DATABASE_REQUIRED: 'false', X_REVIEW_QUEUE_PATH: root,
        PICK_APPROVAL_CHANNEL_ID: 'private-approvals', DISCORD_TOKEN: 'test-only-token', FREE_PICK_CHANNEL_ID: 'free', EXCLUSIVES_CHANNEL_ID: 'paid' }
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
