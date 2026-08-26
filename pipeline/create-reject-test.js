require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { reviewButtons } = require('../bot/lib/source-review');

const ROOT = path.join(__dirname, '..');
const REVIEW_QUEUE_ROOT = path.join(ROOT, 'data', 'monitoring', 'x', 'review-queue');

function pacificDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function main() {
  if (!process.env.PICK_APPROVAL_CHANNEL_ID || !process.env.DISCORD_TOKEN) {
    throw new Error('PICK_APPROVAL_CHANNEL_ID and DISCORD_TOKEN must be configured.');
  }

  const pickId = `REJECT-TEST-${Date.now()}`;
  const packet = {
    pick_id: pickId,
    test_only: true,
    status: 'TEST_ONLY',
    approval: { approver: 'Kobe', decision: null, destination_sport: null, decided_at: null },
    source: { platform: 'Internal safety test' }
  };
  const directory = path.join(REVIEW_QUEUE_ROOT, pacificDate());
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${pickId}.json`), `${JSON.stringify(packet, null, 2)}\n`);

  const response = await fetch(`https://discord.com/api/v10/channels/${process.env.PICK_APPROVAL_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        color: 0x6B7280,
        title: '🧪 Kobe approval test — Reject only',
        description: 'This is a private safety test. Press **Reject** to confirm Kobe’s approval control works. It cannot publish anywhere.',
        footer: { text: 'No X post, AI analysis, or member-facing content is involved.' },
        timestamp: new Date().toISOString()
      }],
      components: reviewButtons(pickId, { testOnly: true })
    })
  });
  if (!response.ok) throw new Error(`Discord reject-test upload failed (${response.status}).`);
  console.log('Reject-only test card sent to #pick-approvals.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
