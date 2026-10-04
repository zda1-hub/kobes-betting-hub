(() => {
const FREE_PICK_ENDPOINT = ['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname) ? '/preview-api/free-pick/current' : 'https://bettinghub-publisher.kobedirwin.workers.dev/api/free-pick/current';
const dateNode = document.querySelector('[data-free-pick-date]');
const captionNode = document.querySelector('[data-free-pick-caption]');
const statusNode = document.querySelector('[data-free-pick-status]');
const imageNode = document.querySelector('[data-free-pick-image]');
const textCardNode = document.querySelector('[data-free-pick-text-card]');
const selectionNode = document.querySelector('[data-free-pick-selection]');
const lineNode = document.querySelector('[data-free-pick-line]');
const eventNode = document.querySelector('[data-free-pick-event]');
const reasonNode = document.querySelector('[data-free-pick-reason]');
const placeholderNode = document.querySelector('[data-free-pick-placeholder]');

function formatDate(value) {
  const date = new Date(`${value}T12:00:00-07:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Phoenix' }).format(date);
}

async function loadFreePick() {
  try {
    const response = await fetch(FREE_PICK_ENDPOINT, { cache: 'no-store' });
    if (response.status === 404) {
      statusNode.textContent = 'NOT POSTED';
      captionNode.textContent = 'Today’s free pick has not been posted yet.';
      return;
    }
    if (!response.ok) throw new Error(`Free pick request failed: ${response.status}`);
    const pick = await response.json();
    if (!pick?.publishedDate) throw new Error('Free pick response is incomplete');

    dateNode.textContent = `${formatDate(pick.publishedDate)} · MST`;
    captionNode.textContent = 'Today’s approved free pick is live.';
    const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    statusNode.textContent = pick.publishedDate === currentDate ? 'LIVE' : `LATEST · ${formatDate(pick.publishedDate)}`;
    if (pick.publishedDate !== currentDate) captionNode.textContent = `Today’s pick has not been posted yet. Latest published pick: ${formatDate(pick.publishedDate)}. `;
    if (pick.imageUrl) {
      imageNode.src = pick.imageUrl;
      imageNode.hidden = false;
    } else {
      const details = pick.details || {};
      selectionNode.textContent = details.selection || details.pick || 'Approved free play';
      lineNode.textContent = [details.line, details.odds ? `(${details.odds})` : '', details.units ? `${details.units}u` : ''].filter(Boolean).join(' ');
      eventNode.textContent = [details.sport, details.event].filter(Boolean).join(' • ');
      reasonNode.textContent = details.reason || 'Published from the approved Discord pick.';
      textCardNode.hidden = false;
    }
    placeholderNode.hidden = true;
  } catch (error) {
    statusNode.textContent = 'UPDATING';
    captionNode.textContent = 'The free-pick service is temporarily updating. Please check back shortly.';
    console.warn('Unable to load today’s free pick.', error);
  }
}

loadFreePick();

})();
