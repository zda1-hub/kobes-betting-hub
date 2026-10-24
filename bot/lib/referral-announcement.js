const COMMUNITY_REFERRAL_ANNOUNCEMENT_MARKER = 'KBH community-referral-walkthrough-20261024';

function communityReferralAnnouncementPayload(url) {
  if (new URL(url).protocol !== 'https:') throw new Error('Referral page must use HTTPS.');
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: '💸 Free members can get a referral link',
      description: 'You do **not** need to buy VIP to share KBH. Free Discord members who have been here at least 7 days, and current VIPs, can get one personal link. US residents age 21+ only.',
      fields: [
        { name: '1 · Get your link', value: 'Open the referral page, confirm US/21+, and tap **Connect Discord & get my link**. Sign in with the Discord account you use here, then copy your personal link.' },
        { name: '2 · Share it', value: 'Send the exact link to a friend who is new to KBH. On an Instagram Story, add it as a **link sticker** so people can tap it directly.' },
        { name: '3 · Set up payouts', value: 'On the referral page, choose **Set up payouts through Stripe**. Enter your payout method directly with Stripe; KBH does not ask for it in Discord.' },
        { name: '4 · When $20 is earned', value: 'Your friend gets 2 days free, then $32.99/month unless canceled. A reward requires their first $32.99 paid month, followed by a 7-day hold and eligibility checks. Clicks and trial starts alone do not earn cash.' }
      ],
      footer: { text: `${COMMUNITY_REFERRAL_ANNOUNCEMENT_MARKER} · Full rules on the referral page. No self-referrals, refunded or disputed purchases.` }
    }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Get my referral link', url }] }]
  };
}

module.exports = { COMMUNITY_REFERRAL_ANNOUNCEMENT_MARKER, communityReferralAnnouncementPayload };
