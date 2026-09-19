const REFERRAL_CARD_MARKER = 'KBH referral-program-v1';

function secureUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS.`);
  return url.toString();
}

function referralCardPayload(config) {
  const loginUrl = secureUrl(config.login_url, 'Referral login URL');
  const dashboardUrl = secureUrl(config.dashboard_url, 'Referral dashboard URL');
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: '💸 Member Referral Program',
      description: '**REFER. THEY JOIN. YOU EARN.**\n\nShare your personal Hub link. After a new member completes their first $32.99 membership payment, the referral enters a seven-day review. Each eligible referral earns **$10 cash**.',
      fields: [
        { name: '1 · GET YOUR LINK', value: 'Connect your Discord account and copy your personal referral link.' },
        { name: '2 · SHARE IT', value: 'Your friend must be a new member and join through that exact link.' },
        { name: '3 · GET PAID', value: 'Eligible rewards clear after the seven-day review and are paid through Stripe.' },
        { name: 'BUILT-IN PROTECTION', value: 'Self-referrals, duplicate accounts, reused qualifying payments, refunds, disputes and fraudulent activity do not qualify.' }
      ],
      footer: { text: `${REFERRAL_CARD_MARKER} · One qualifying purchase can earn one reward.` }
    }],
    components: [{ type: 1, components: [
      { type: 2, style: 5, label: 'Get my referral link', url: loginUrl },
      { type: 2, style: 5, label: 'Check earnings', url: dashboardUrl }
    ] }]
  };
}

module.exports = { REFERRAL_CARD_MARKER, referralCardPayload };
