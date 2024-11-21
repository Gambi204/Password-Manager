import { Keychain } from './password-manager.js';

let keychain;

// Initialize the Keychain
(async () => {
  keychain = await Keychain.init('default-password');
})();

// Password Strength Validation
const passwordInput = document.getElementById('password-value');
const strengthLabel = document.getElementById('strength-label');

passwordInput.addEventListener('input', () => {
  const password = passwordInput.value.trim();
  const strength = evaluatePasswordStrength(password);
  strengthLabel.textContent = strength;
});

// Evaluate Password Strength
function evaluatePasswordStrength(password) {
  if (password.length < 6) return 'Weak';
  if (/^[a-zA-Z]+$/.test(password)) return 'Moderate';
  if (/[A-Za-z0-9!@#$%^&*()_+=\-]/.test(password)) return 'Strong';
  return 'None';
}

// Set Password
document.getElementById('set-password-btn').addEventListener('click', async () => {
  const service = document.getElementById('service-name').value.trim();
  const password = document.getElementById('password-value').value.trim();

  if (service && password) {
    await keychain.set(service, password);
    alert(`Password for "${service}" has been set!`);
  } else {
    alert('Please fill in both fields.');
  }
});

// Retrieve Password
document.getElementById('retrieve-password-btn').addEventListener('click', async () => {
  const service = document.getElementById('retrieve-service-name').value.trim();

  if (service) {
    const password = await keychain.get(service);
    if (password) {
      document.getElementById('retrieve-result').innerText = `Password: ${password}`;
    } else {
      document.getElementById('retrieve-result').innerText = 'No password found for this service.';
    }
  } else {
    alert('Please enter the service name.');
  }
});

// Remove Password
document.getElementById('remove-password-btn').addEventListener('click', async () => {
  const service = document.getElementById('remove-service-name').value.trim();

  if (service) {
    const removed = await keychain.remove(service);
    if (removed) {
      document.getElementById('remove-result').innerText = `Password for "${service}" has been removed.`;
    } else {
      document.getElementById('remove-result').innerText = 'No password found for this service.';
    }
  } else {
    alert('Please enter the service name.');
  }
});

// Export Data
document.getElementById('export-data-btn').addEventListener('click', async () => {
  const [contents] = await keychain.dump();
  const blob = new Blob([contents], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'passwords.json';
  link.click();
});

// Dark Mode Toggle
document.getElementById('dark-mode-switch').addEventListener('change', (event) => {
  document.body.classList.toggle('dark-mode', event.target.checked);
});
