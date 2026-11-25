'use strict';
const {findArbitrage}=require('../bot/lib/arbitrage-paper-monitor');

// Local, historical/illustrative fixtures only. This script makes no network
// calls and never queues an approval card or posts to VIP.
const now=new Date('2026-11-24T18:00:00Z');
function sample(id, awayPrice, homePrice, updatedAt='2026-11-24T17:59:30Z') {
  return {id,sport_key:'americanfootball_nfl',away_team:'Philadelphia Eagles',home_team:'Dallas Cowboys',
    commence_time:'2026-11-25T01:00:00Z',bookmakers:[
      {key:'book-a',title:'Book A',markets:[{key:'h2h',last_update:updatedAt,outcomes:[
        {name:'Philadelphia Eagles',price:awayPrice},{name:'Dallas Cowboys',price:1.1}]}]},
      {key:'book-b',title:'Book B',markets:[{key:'h2h',last_update:updatedAt,outcomes:[
        {name:'Philadelphia Eagles',price:1.1},{name:'Dallas Cowboys',price:homePrice}]}]}
    ]};
}
const incident=sample('nov24-eagles-cowboys-2_88',4.9,2.88);
const stale=sample('stale-quote',2.05,2.05,'2026-11-24T17:58:59Z');
const highEdge=sample('edge-above-five',2.11,2.11);
const overround=sample('implied-above-102',1.9,1.9);
const wrongMarket=sample('alt-market',2.05,2.05);
wrongMarket.bookmakers[1].markets[0].outcomes[1].name='Dallas Cowboys -3.5';
const live=sample('already-live',2.05,2.05);
live.commence_time='2026-11-24T17:00:00Z';
console.log('Arbitrage guard dry run — historical/illustrative fixtures; no feed or Discord calls');
console.log('Incident input: Dallas 2.88 was reported wrong; the reported actual -475 equals about 1.2105 decimal.');
for (const fixture of [incident,stale,highEdge,overround,wrongMarket,live]) {
  const rejections=[];
  const accepted=findArbitrage([fixture],{now,freshOnly:true,minimumEdgePercent:0,rejections});
  console.log(`${fixture.id}: ${accepted.length?'ACCEPTED':'REJECTED'} — ${rejections[0]?.reason||'no qualifying arb'}${rejections[0]?.detail?` — ${rejections[0].detail}`:''}`);
}
