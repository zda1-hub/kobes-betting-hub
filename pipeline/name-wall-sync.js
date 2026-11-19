'use strict';
const { Pool } = require('pg');

const API = '/api/admin/truck/';
const valid = env => env.NAME_WALL_ENABLED === 'true';
const base = env => String(env.TRUCK_PUBLISHER_URL || '').replace(/\/$/, '') + API;
async function api(env, action, body, fetchImpl = fetch) {
  const response = await fetchImpl(base(env) + action, { method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${env.ROAD_TO_TRUCK_SECRET}`, ...(body ? { 'content-type':'application/json' } : {}) },
    ...(body ? { body:JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Wall ${action}: ${response.status} ${data.error || ''}`);
  return data;
}
async function sourceRows(pool, startedAt) {
  // Both tables are written only after signed Stripe webhooks. No account or
  // referral before activation can enter the wall, even if a later invoice pays.
  const referrals = await pool.query(`SELECT r.referred_stripe_customer_id AS "customerId",
      r.referred_subscription_id AS "subscriptionId", r.referrer_discord_user_id AS "referrerId",
      r.created_at AS "createdAt", r.first_paid_at AS "firstPaidAt",r.status_reason AS "statusReason",
      p.contact_email AS "referrerEmail", mc.discord_user_id AS "referredDiscordId",
      wo.recipient AS "referredEmail",
      ms.status, ms.cancel_at_period_end AS "cancelAtPeriodEnd", ms.entitlement_blocked AS "blocked",
      r.status AS "rewardStatus",
      (SELECT MIN(b.occurred_at) FROM membership_billing_events b
        WHERE b.stripe_subscription_id=r.referred_subscription_id AND b.event_type='invoice_paid'
        AND b.amount_cents>0 AND b.stripe_invoice_id<>r.first_paid_invoice_id) AS "secondPaidAt",
      EXISTS(SELECT 1 FROM membership_billing_events b WHERE b.stripe_subscription_id=r.referred_subscription_id
        AND b.event_type IN ('refund','dispute')) AS "refunded"
    FROM referral_rewards r JOIN membership_subscriptions ms
      ON ms.stripe_subscription_id=r.referred_subscription_id
    LEFT JOIN referral_profiles p ON p.discord_user_id=r.referrer_discord_user_id
    LEFT JOIN membership_customers mc ON mc.stripe_customer_id=r.referred_stripe_customer_id
    LEFT JOIN member_welcome_outbox wo ON wo.stripe_subscription_id=r.referred_subscription_id
    WHERE r.created_at >= $1 AND r.referrer_discord_user_id IS NOT NULL
    ORDER BY r.created_at, r.referred_stripe_customer_id LIMIT 2000`,[startedAt]);
  if (referrals.rows.length === 2000) throw new Error('Truck wall referral scan reached its 2000-row limit; pagination is required before syncing further.');
  const spots = await pool.query(`SELECT COUNT(DISTINCT ms.stripe_customer_id)::int AS n
    FROM membership_subscriptions ms JOIN membership_billing_events b
      ON b.stripe_subscription_id=ms.stripe_subscription_id AND b.event_type='invoice_paid'
      AND b.amount_cents>0 AND b.occurred_at >= $1
    WHERE ms.status='active' AND ms.cancel_at_period_end=false AND ms.entitlement_blocked=false
      AND ms.created_at >= $1
      AND NOT EXISTS(SELECT 1 FROM membership_billing_events x WHERE x.stripe_subscription_id=ms.stripe_subscription_id
        AND x.event_type IN ('refund','dispute'))`,[startedAt]);
  return { referrals:referrals.rows, activePaidSpots:spots.rows[0]?.n || 0 };
}
async function sync({ env=process.env, database=null, fetchImpl=fetch, discordMember=null }={}) {
  if (!valid(env)) return {status:'disabled',writes:0};
  if (!env.DATABASE_URL && !database) throw new Error('DATABASE_URL required for webhook-backed wall sync');
  const state = await api(env,'state',null,fetchImpl);
  if (!state.startedAt) return {status:'not_activated',writes:0};
  const pool = database || new Pool({connectionString:env.DATABASE_URL,max:1});
  try {
    const data = await sourceRows(pool,state.startedAt);
    const recent = new Map();
    const alerts=[];
    const byReferrer=new Map();
    for (const row of data.referrals) {
      const referrerId = row.referrerId;
      let member = recent.get(referrerId);
      if (!member) {
        member = discordMember ? await discordMember(referrerId) : await fetchImpl(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${referrerId}`,{
          headers:{authorization:`Bot ${env.DISCORD_TOKEN}`}}).then(r=>r.ok?r.json():null);
        recent.set(referrerId,member || {});
      }
      row.displayName = String(member?.nick || member?.user?.global_name || member?.user?.username || 'Rider')
        .replace(/[<>@\r\n]/g,'').slice(0,20);
      const joinedAt=Date.parse(member?.joined_at || '');
      const eligibleAge=Number.isFinite(joinedAt)&&joinedAt<=Date.parse(row.createdAt)-7*86400000;
      const sameAccount=row.referredDiscordId&&row.referredDiscordId===referrerId;
      const refDomain=String(row.referrerEmail||'').split('@')[1]?.toLowerCase();
      const referredDomain=String(row.referredEmail||'').split('@')[1]?.toLowerCase();
      const generic=new Set(['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','aol.com','proton.me','protonmail.com']);
      const age= row.referredDiscordId&&/^\d{17,20}$/.test(row.referredDiscordId)
        ? Date.parse(row.createdAt)-(Number(BigInt(row.referredDiscordId)>>22n)+1420070400000):Infinity;
      const possible=[];
      if(sameAccount) possible.push('self_referral');
      if (/SHARED_CARD|SAME_CARD|FINGERPRINT/i.test(row.statusReason||'')) possible.push('shared_payment_fingerprint');
      if (refDomain&&refDomain===referredDomain&&!generic.has(refDomain)) possible.push('matching_email_domain');
      if (age<7*86400000) possible.push('new_referred_account');
      const timestamps=byReferrer.get(referrerId)||[];
      timestamps.push(Date.parse(row.createdAt));byReferrer.set(referrerId,timestamps);
      if(timestamps.filter(t=>Date.parse(row.createdAt)-t<=3600000).length>=3) possible.push('rapid_referrals');
      for(const reason of possible) {
        const id=`${reason}:${referrerId}:${row.customerId}`;
        const flag=await api(env,'flag',{id,referrerId,customerId:row.customerId,reason},fetchImpl);
        if(flag.created) alerts.push({referrerId,customerId:row.customerId,reason});
      }
      row.active = row.status === 'active' && !row.cancelAtPeriodEnd && !row.blocked &&
        !['VOID','REVIEW_REQUIRED'].includes(row.rewardStatus) && eligibleAge && !sameAccount;
      row.canceled = !row.active;
      delete row.referrerEmail; // never send contact details to D1
      delete row.referredEmail;delete row.statusReason;
      delete row.referredDiscordId;
      delete row.status; delete row.rewardStatus; delete row.blocked; delete row.cancelAtPeriodEnd;
    }
    const outcome = await api(env,'sync',data,fetchImpl);
    return {status:'synced',referrals:data.referrals.length,spot:outcome.spot,tierEvents:outcome.tierEvents,alerts};
  } finally { if (!database) await pool.end(); }
}
module.exports={sync,sourceRows,api,valid};
