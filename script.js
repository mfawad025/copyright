// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  // Reveal-on-scroll for stamp/card elements
  const revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  initOrderForm();
});

// ---------------- PayFast hosted-checkout flow ----------------
// Point this at your deployed backend (see /server/README.md).
// Use http://localhost:4242 while testing locally.
const PAYFAST_BACKEND_URL = 'https://your-payfast-backend.example.com';

function initOrderForm() {
  const form = document.getElementById('order-form');
  if (!form) return;

  const statusEl = document.getElementById('payfast-status');
  const submitBtn = document.getElementById('payfast-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const select = form.querySelector('#plan-select');
    const plan = select.value;
    const amount = select.selectedOptions[0]?.dataset.amount || '0';
    const name = form.querySelector('#full-name').value.trim();
    const email = form.querySelector('#email').value.trim();
    const mobile = form.querySelector('#mobile').value.trim();

    if (!name || !email || !mobile) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Connecting to PayFast…';
    if (statusEl) statusEl.textContent = '';

    try {
      const res = await fetch(`${PAYFAST_BACKEND_URL}/api/payfast/initiate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, amount, name, email, mobile }),
      });

      if (!res.ok) throw new Error('Checkout could not be started');
      const { checkoutUrl, basketId, payload } = await res.json();

      const resultPanel = document.getElementById('order-result');
      if (resultPanel) {
        document.getElementById('ref-code-value').textContent = basketId;
        document.getElementById('order-summary').textContent = `${plan} — redirecting to PayFast…`;
        resultPanel.classList.remove('hidden');
      }

      // Build and auto-submit the hidden form that redirects to PayFast
      const redirectForm = document.getElementById('payfast-redirect-form');
      redirectForm.action = checkoutUrl;
      redirectForm.innerHTML = '';
      Object.entries(payload).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        redirectForm.appendChild(input);
      });
      redirectForm.submit();
    } catch (err) {
      console.error('PayFast checkout error:', err);
      if (statusEl) {
        statusEl.textContent = 'Could not reach the payment server. Please try again in a moment.';
        statusEl.style.color = '#E7B0A8';
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Pay Securely with PayFast';
    }
  });
}
