const signupForm = document.querySelector('[data-email-signup]');
if (signupForm) signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = signupForm.querySelector('[data-email-signup-status]');
  const button = signupForm.querySelector('button[type="submit"]');
  const fields = new FormData(signupForm);
  if (!signupForm.reportValidity()) return;
  button.disabled = true;
  status.textContent = 'Adding you to the list…';
  try {
    const response = await fetch('https://bettinghub-publisher.kobedirwin.workers.dev/api/email/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fields.get('email'), legalAge: fields.get('legalAge') === 'on', consent: fields.get('consent') === 'on', website: fields.get('website') })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Please try again.');
    status.textContent = result.message || 'You’re on the list. Check your email.';
    signupForm.reset();
  } catch (error) {
    status.textContent = error.message || 'We couldn’t add you right now. Please try again.';
  } finally { button.disabled = false; }
});
