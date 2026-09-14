// Add this file to the SAME Google Apps Script project that already sends
// Kobe's daily email. It adds only inbound Trends handling; it does not alter
// the daily-picks email or automatically publish anything.
const TRENDS_LABEL = 'Kobe Trends';
const TRENDS_QUEUED_LABEL = 'Kobe Trends/Queued';
const TRENDS_QUEUE_SECRET_KEY = 'TRENDS_QUEUE_SECRET';
const TRENDS_EMAIL_START_KEY = 'TRENDS_EMAIL_START_AT';
const TRENDS_SENDER = 'kobedirwin@gmail.com';

function installKobeTrendsInbox() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'queueKobeTrendEmails') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('queueKobeTrendEmails').timeBased().everyMinutes(5).create();
  return 'Kobe Trends inbox checks every five minutes. Create the Gmail label “Kobe Trends” and add TRENDS_QUEUE_SECRET in Script Properties.';
}

function queueKobeTrendEmails() {
  const sourceLabel = GmailApp.getUserLabelByName(TRENDS_LABEL);
  if (!sourceLabel) throw new Error('Create the Gmail label “' + TRENDS_LABEL + '” first.');
  const queuedLabel = GmailApp.getUserLabelByName(TRENDS_QUEUED_LABEL) || GmailApp.createLabel(TRENDS_QUEUED_LABEL);
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty(TRENDS_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + TRENDS_QUEUE_SECRET_KEY + ' in Apps Script Project Settings first.');
  const startAt = properties.getProperty(TRENDS_EMAIL_START_KEY);
  if (!startAt || isNaN(Date.parse(startAt))) throw new Error('Set ' + TRENDS_EMAIL_START_KEY + ' to the activation ISO timestamp first.');
  const startMs = Date.parse(startAt);
  const threads = GmailApp.search('label:"' + TRENDS_LABEL + '" -label:"' + TRENDS_QUEUED_LABEL + '"', 0, 50);
  let queued = 0;
  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      if (message.getDate().getTime() < startMs) return;
      const sender = emailAddress_(message.getFrom()).toLowerCase();
      if (sender !== TRENDS_SENDER) return;
      const league = trendLeague_(message.getSubject());
      if (!league) return;
      const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/trends', {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + secret },
        payload: JSON.stringify({
          id: 'gmail-' + message.getId(), sender: sender, league: league,
          subject: message.getSubject(), body: message.getPlainBody(), receivedAt: message.getDate().toISOString()
        }),
        muteHttpExceptions: true
      });
      const status = response.getResponseCode();
      if (status !== 201 && status !== 409) throw new Error('Trends queue request failed (' + status + '): ' + response.getContentText());
      queued += status === 201 ? 1 : 0;
    });
    thread.addLabel(queuedLabel);
  });
  return queued + ' Kobe Trends email(s) queued for private Discord approval.';
}

function testTrendsQueueConnection() {
  const secret = PropertiesService.getScriptProperties().getProperty(TRENDS_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + TRENDS_QUEUE_SECRET_KEY + ' in Apps Script Project Settings first.');
  const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/trends?limit=1', {
    method: 'get', headers: { Authorization: 'Bearer ' + secret }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Trends queue connection failed (' + response.getResponseCode() + ').');
  return 'Trends queue connection is ready. No email or Discord post was created.';
}

function trendLeague_(subject) {
  const value = String(subject || '').toLowerCase();
  if (/\b(nfl|football)\b/.test(value)) return 'nfl';
  if (/\b(mlb|baseball)\b/.test(value)) return 'mlb';
  return '';
}

function emailAddress_(from) {
  const match = String(from || '').match(/<([^>]+)>/) || String(from || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? String(match[1] || match[0]).trim() : '';
}
