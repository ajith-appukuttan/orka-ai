/**
 * Orka Extension — Popup Script
 */

const statusDot = document.getElementById('statusDot')!;
const statusText = document.getElementById('statusText')!;
const inspectBtn = document.getElementById('inspectBtn')! as HTMLButtonElement;

let inspectMode = false;

// Check if Orka UI tab is open
async function checkConnection() {
  const tabs = await chrome.tabs.query({ url: 'http://localhost:5173/*' });
  if (tabs.length > 0) {
    statusDot.className = 'dot connected';
    statusText.textContent = 'Connected to Orka UI';
  } else {
    statusDot.className = 'dot disconnected';
    statusText.textContent = 'Orka UI not found — open localhost:5173';
  }
}

// Get current inspect state
chrome.runtime.sendMessage({ type: 'orka_get_state' }, (response) => {
  if (response?.inspectMode) {
    inspectMode = true;
    updateButton();
  }
});

function updateButton() {
  if (inspectMode) {
    inspectBtn.textContent = 'Disable Inspect Mode';
    inspectBtn.classList.add('active');
  } else {
    inspectBtn.textContent = 'Enable Inspect Mode';
    inspectBtn.classList.remove('active');
  }
}

inspectBtn.addEventListener('click', () => {
  inspectMode = !inspectMode;
  updateButton();
  chrome.runtime.sendMessage({
    type: 'orka_inspect_toggled',
    enabled: inspectMode,
  });
});

checkConnection();
