'use strict';

// A list of props that won in past games is research, even when every row
// looks like a valid future wager. Do not turn it into a capper's picks.
function isRetrospectivePropsList(text) {
  return /\b(?:props?|bets?|plays?)\s+that\s+(?:(?:have|has)\s+)?(?:cashed|hit)\s+in\s+every\s+(?:single\s+)?game\s+this\s+season\b/i
    .test(String(text || ''));
}

module.exports = { isRetrospectivePropsList };
