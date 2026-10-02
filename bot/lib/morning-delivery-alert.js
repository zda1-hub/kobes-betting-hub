const { arizonaClock } = require('./expert-trend-reminder');

const MARKER = 'KBH morning-delivery-alert';

function createMorningDeliveryAlert({ channelFor, statusFor, now = () => Date.now() }) {
  let notifiedDate = null;
  return async function checkMorningDelivery() {
    const { date, time } = arizonaClock(now());
    if (time < '07:30') return { status: 'BEFORE_DEADLINE' };
    if (notifiedDate === date) return { status: 'ALREADY_CHECKED' };
    const issues = await statusFor(date);
    if (!issues.length) return { status: 'HEALTHY', date };
    const channel = await channelFor();
    const ownerId = channel.guild?.ownerId;
    if (!ownerId) throw new Error('Morning delivery alert needs the server owner ID.');
    const marker = `${MARKER} · ${date}`;
    const recent = await channel.messages.fetch({ limit: 100 });
    if ([...recent.values()].some((message) => message.embeds?.some((embed) => embed.footer?.text === marker))) {
      notifiedDate = date;
      return { status: 'ALREADY_NOTIFIED', date };
    }
    const message = await channel.send({
      content: `<@${ownerId}> Morning delivery needs attention for ${date}.`,
      allowedMentions: { parse: [], users: [ownerId] },
      embeds: [{ color: 0xd35400, title: '7:30 AM delivery check',
        description: issues.map((issue) => `• ${issue}`).join('\n').slice(0, 3800),
        footer: { text: marker } }]
    });
    notifiedDate = date;
    return { status: 'ALERTED', date, messageId: message.id, issues };
  };
}

module.exports = { createMorningDeliveryAlert };
