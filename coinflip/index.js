// DOM Element References
const coin = document.getElementById('coin');
const coinStage = document.getElementById('coinStage');
const coinShadow = document.getElementById('coinShadow');
const flipBtn = document.getElementById('flipBtn');
const resetBtn = document.getElementById('resetBtn');
const resultBadge = document.getElementById('resultBadge');

const headsCountEl = document.getElementById('headsCount');
const tailsCountEl = document.getElementById('tailsCount');
const totalCountEl = document.getElementById('totalCount');

// State Tracking
let headsCount = 0;
let tailsCount = 0;
let totalCount = 0;
let currentRotation = 0;
let isFlipping = false;

// Web Audio API Synthesizer (Realistic Clink & Catch)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playCoinSound(frequency = 1200, duration = 0.15) {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + duration);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Graceful fallback for restricted environments
  }
}

// Flip Execution
function flipCoin() {
  if (isFlipping) return;
  isFlipping = true;
  flipBtn.disabled = true;

  playCoinSound(1400, 0.2);
  resultBadge.textContent = "Flipping...";
  resultBadge.style.opacity = '0.6';

  // Random outcome: 0 = Heads, 1 = Tails
  const outcome = Math.random() < 0.5 ? 0 : 1; // 0: heads, 1: tails
  const fullRotations = 5 + Math.floor(Math.random() * 3); // 5 to 7 full 360 turns
  const targetOffset = outcome === 0 ? 0 : 180;

  // Calculate forward rotation angle
  const baseTarget = currentRotation + (fullRotations * 360);
  const normalizedBase = baseTarget - (baseTarget % 360);
  currentRotation = normalizedBase + targetOffset;

  // Visual Animation Dynamics
  const duration = 2200; // ms
  coin.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.25, 1)`;
  coin.style.transform = `translateY(-60px) rotateY(${currentRotation}deg) scale(1.15)`;
  
  coinShadow.style.transform = 'scale(0.65)';
  coinShadow.style.opacity = '0.2';

  // Landing Phase
  setTimeout(() => {
    coin.style.transform = `translateY(0) rotateY(${currentRotation}deg) scale(1)`;
    coinShadow.style.transform = 'scale(1)';
    coinShadow.style.opacity = '0.4';
  }, duration - 400);

  // Result Resolution
  setTimeout(() => {
    playCoinSound(800, 0.1); // Landing clink

    if (outcome === 0) {
      headsCount++;
      headsCountEl.textContent = headsCount;
      resultBadge.textContent = "Result: Heads 🦅";
    } else {
      tailsCount++;
      tailsCountEl.textContent = tailsCount;
      resultBadge.textContent = "Result: Tails 👑";
    }

    totalCount++;
    totalCountEl.textContent = totalCount;

    resultBadge.style.opacity = '1';
    flipBtn.disabled = false;
    isFlipping = false;
  }, duration);
}

// Reset Stats
function resetStats() {
  if (isFlipping) return;
  headsCount = 0;
  tailsCount = 0;
  totalCount = 0;
  currentRotation = 0;

  headsCountEl.textContent = '0';
  tailsCountEl.textContent = '0';
  totalCountEl.textContent = '0';
  resultBadge.textContent = "Ready to Flip";

  coin.style.transition = 'transform 0.4s ease';
  coin.style.transform = 'rotateY(0deg)';
}

// Event Listeners
flipBtn.addEventListener('click', flipCoin);
coinStage.addEventListener('click', flipCoin);
resetBtn.addEventListener('click', resetStats);

// Spacebar Trigger
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target !== resetBtn) {
    e.preventDefault();
    flipCoin();
  }
});
