const MARKER = 'KBH expert-trend-review-reminder';
const TIME_ZONE = 'America/Phoenix';

function arizonaClock(instant) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function createExpertTrendReminder({ channelFor, now = () => Date.now() }) {
  let notifiedDate = null;
  return async function notifyIfDue(receipt) {
    if (!receipt?.messageId) return { status: 'NO_REVIEW_CARD' };
    const { date, time } = arizonaClock(now());
    if (time < '07:00') return { status: 'BEFORE_MORNING_WINDOW' };
    if (notifiedDate === date) return { status: 'ALREADY_NOTIFIED' };

    const channel = await channelFor();
    const ownerId = channel.guild?.ownerId;
    if (!ownerId) throw new Error('Expert trend reminder needs the server owner ID.');
    const marker = `${MARKER} · ${date}`;
    const recent = await channel.messages.fetch({ limit: 100 });
    if ([...recent.values()].some((message) => message.embeds?.some((embed) => embed.footer?.text === marker))) {
      notifiedDate = date;
      return { status: 'ALREADY_NOTIFIED' };
    }

    const card = await channel.messages.fetch(receipt.messageId);
    if (!card) throw new Error('Expert trend review card is missing; no reminder was sent.');
    const pending = Number(card.content?.match(/(\d+) pending/)?.[1]);
    const count = Number.isFinite(pending) ? pending : receipt.expertCount;
    const link = `https://discord.com/channels/${channel.guild.id}/${channel.id}/${card.id}`;
    const message = await channel.send({
      content: `<@${ownerId}> Today’s expert trends are ready for review: ${count} pending. Use Approve All or the individual controls on the private sheet: ${link}`,
      allowedMentions: { parse: [], users: [ownerId] },
      embeds: [{ color: 0x3498db, title: 'Expert trends ready for review',
        description: 'The sheet has refreshed with verified records. Only Kobe-approved experts appear in VIP.',
        footer: { text: marker } }]
    });
    notifiedDate = date;
    return { status: 'NOTIFIED', date, messageId: message.id, reviewMessageId: card.id, pending: count };
  };
}

module.exports = { arizonaClock, createExpertTrendReminder };
