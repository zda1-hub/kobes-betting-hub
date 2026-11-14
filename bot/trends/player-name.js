'use strict';

// Sports feeds disagree on accents and spacing in display names. Keep the
// complete name requirement; only fold presentation differences.
function playerNameKey(name) {
  return String(name || '').normalize('NFKD').replace(/\p{M}/gu, '')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

module.exports = { playerNameKey };
