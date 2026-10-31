const VIP_TRIAL_NOTICE_MARKER = 'KBH vip-trial-join-vip-20261031';

function vipTrialNoticePayload() {
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: 'Want to see the full VIP card?',
      description: 'VIP is **2 days free, then $32.99/mo until canceled. Card required.** Cancel before the trial ends to avoid the first charge.\n\nYou get expert plays with writeups and arbitrage alerts. Connect Discord, then confirm the trial in Stripe. The free Discord stays free.\n\n21+ where permitted. Picks aren\'t guarantees.',
      footer: { text: VIP_TRIAL_NOTICE_MARKER }
    }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Start 2 days free', url: 'https://kobesbettinghub.com/join' }] }]
  };
}

module.exports = { VIP_TRIAL_NOTICE_MARKER, vipTrialNoticePayload };
