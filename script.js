// ============================================
// 1. КОНСТАНТЫ
// ============================================
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎'];
const PAYOUTS = { '🍒': 10, '🍋': 12, '🍊': 15, '🍇': 20, '⭐': 30, '💎': 50 };
const BET = 10;
const START_BALANCE = 100;
const ADMIN_PASSWORD = 'admin123';   // ⚠️ ПОМЕНЯЙ НА СВОЙ!

// ============================================
// 2. FIREBASE — ВСТАВЬ СВОЙ КОНФИГ ИЗ ШАГА 1.3
// ============================================
const firebaseConfig = {

  apiKey: "AIzaSyBkHQ3H91-I-CDovPYKHKq_z2XOhcltzTk",
  authDomain: "machin72tmn.firebaseapp.com",
  databaseURL: "https://machin72tmn-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "machin72tmn",
  storageBucket: "machin72tmn.firebasestorage.app",
  messagingSenderId: "414266767648",
  appId: "1:414266767648:web:3d4a8bef0499687d703f45"

};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ============================================
// 3. СОСТОЯНИЕ
// ============================================
let balance = 0;
let isSpinning = false;
let isMuted = localStorage.getItem('slotMuted') === 'true';
let userId = localStorage.getItem('slotUserId');
let userName = null;
let balanceRef = null;

// ============================================
// 4. ЭЛЕМЕНТЫ
// ============================================
const loginScreen = document.getElementById('loginScreen');
const gameScreen = document.getElementById('gameScreen');
const adminScreen = document.getElementById('adminScreen');
const nameInput = document.getElementById('nameInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const playerNameEl = document.getElementById('playerName');
const usersListEl = document.getElementById('usersList');
const adminToggleBtn = document.getElementById('adminToggleBtn');
const closeAdminBtn = document.getElementById('closeAdminBtn');
const muteBtn = document.getElementById('muteBtn');
const col1 = document.getElementById('col1');
const col2 = document.getElementById('col2');
const col3 = document.getElementById('col3');
const spinBtn = document.getElementById('spinBtn');
const balanceEl = document.getElementById('balance');
const resultEl = document.getElementById('result');
const machineEl = document.querySelector('.machine');

// ============================================
// 5. ЗВУК
// ============================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(frequency, duration, type = 'sine', volume = 0.1) {
  if (isMuted) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playClick() { playTone(800, 0.05, 'square', 0.06); }
function playTick() { playTone(1400, 0.03, 'square', 0.03); }
function playWin() {
  playTone(523, 0.15, 'sine', 0.12);
  setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 100);
  setTimeout(() => playTone(784, 0.35, 'sine', 0.12), 200);
}
function playJackpot() {
  [523, 659, 784, 1047, 1319].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.22, 'triangle', 0.15), i * 110);
  });
}

function updateMuteButton() {
  muteBtn.textContent = isMuted ? '🔇' : '🔊';
}

muteBtn.onclick = () => {
  isMuted = !isMuted;
  localStorage.setItem('slotMuted', isMuted);
  updateMuteButton();
  if (!isMuted) playClick();
};

// ============================================
// 6. ЭКРАНЫ
// ============================================
function showScreen(name) {
  loginScreen.style.display = name === 'login' ? 'flex' : 'none';
  gameScreen.style.display = name === 'game' ? 'flex' : 'none';
  adminScreen.style.display = name === 'admin' ? 'flex' : 'none';
}

// ============================================
// 7. ЛОГИН / РЕГИСТРАЦИЯ
// ============================================
async function tryAutoLogin() {
  if (!userId) return false;
  try {
    const snap = await db.ref('users/' + userId).once('value');
    if (snap.exists()) {
      userName = snap.val().name;
      return true;
    }
  } catch (e) {
    console.error('Auto-login error:', e);
  }
  return false;
}

async function loginWithName(name) {
  name = name.trim();
  if (name.length < 2) {
    loginError.textContent = 'Имя слишком короткое (минимум 2 символа)';
    return;
  }

  loginBtn.disabled = true;
  loginError.textContent = '';

  try {
    userId = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('slotUserId', userId);

    await db.ref('users/' + userId).set({
      name: name,
      balance: START_BALANCE,
      createdAt: Date.now()
    });

    userName = name;
    enterGame();
  } catch (e) {
    console.error(e);
    loginError.textContent = 'Ошибка подключения. Проверь интернет.';
    loginBtn.disabled = false;
  }
}

function enterGame() {
  showScreen('game');
  playerNameEl.textContent = userName;

  // Слушаем изменения баланса в реальном времени
  if (balanceRef) balanceRef.off();
  balanceRef = db.ref('users/' + userId + '/balance');
  balanceRef.on('value', (snap) => {
    balance = snap.val() || 0;
    balanceEl.textContent = balance;
  });
}

loginBtn.onclick = () => loginWithName(nameInput.value);
nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

// ============================================
// 8. ИГРОВАЯ ЛОГИКА
// ============================================
function getRandomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function setColumn(columnEl, finalSymbol) {
  const cells = columnEl.querySelectorAll('.reel');
  cells[0].textContent = getRandomSymbol();
  cells[1].textContent = getRandomSymbol();
  cells[2].textContent = finalSymbol;
  cells[3].textContent = getRandomSymbol();
  cells[4].textContent = getRandomSymbol();
}

spinBtn.onclick = () => {
  if (isSpinning) return;
  if (balance < BET) {
    resultEl.textContent = 'Недостаточно монет! Попроси админа 💸';
    return;
  }

  playClick();
  balance = balance - BET;
  balanceEl.textContent = balance;
  db.ref('users/' + userId + '/balance').set(balance);

  resultEl.textContent = '';
  resultEl.classList.remove('jackpot');
  isSpinning = true;

  const sym1 = getRandomSymbol();
  const sym2 = getRandomSymbol();
  const sym3 = getRandomSymbol();

  [col1, col2, col3].forEach(col => col.classList.add('spinning'));

  const blurInterval = setInterval(() => {
    document.querySelectorAll('.reel-column.spinning .reel').forEach(cell => {
      cell.textContent = getRandomSymbol();
    });
    if (Math.random() < 0.15) playTick();
  }, 60);

  setTimeout(() => {
    col1.classList.remove('spinning');
    setColumn(col1, sym1);
    setTimeout(() => {
      col2.classList.remove('spinning');
      setColumn(col2, sym2);
      setTimeout(() => {
        col3.classList.remove('spinning');
        setColumn(col3, sym3);
        clearInterval(blurInterval);
        isSpinning = false;
        checkWin(sym1, sym2, sym3);
      }, 400);
    }, 400);
  }, 900);
};

function checkWin(sym1, sym2, sym3) {
  if (sym1 === sym2 && sym2 === sym3) {
    const multiplier = PAYOUTS[sym1];
    const winAmount = BET * multiplier;
    balance = balance + winAmount;
    balanceEl.textContent = balance;
    db.ref('users/' + userId + '/balance').set(balance);

    const isJackpot = multiplier >= 30;
    if (isJackpot) {
      resultEl.textContent = `💎 ДЖЕКПОТ! ${sym1} × ${multiplier} = +${winAmount} 💎`;
      resultEl.classList.add('jackpot');
      machineEl.classList.add('jackpot');
      playJackpot();
      setTimeout(() => machineEl.classList.remove('jackpot'), 2500);
    } else {
      resultEl.textContent = `Победа! ${sym1} × ${multiplier} = +${winAmount} 🎉`;
      machineEl.classList.add('win');
      playWin();
      setTimeout(() => machineEl.classList.remove('win'), 2000);
    }
  } else {
    resultEl.textContent = 'Попробуй ещё';
  }
}

// ============================================
// 9. АДМИН-ПАНЕЛЬ
// ============================================
adminToggleBtn.onclick = () => {
  const password = prompt('Пароль администратора:');
  if (password === null) return;
  if (password !== ADMIN_PASSWORD) {
    alert('Неверный пароль');
    return;
  }
  showScreen('admin');
  loadUsersList();
};

closeAdminBtn.onclick = () => {
  showScreen(userName ? 'game' : 'login');
};

function loadUsersList() {
  db.ref('users').on('value', (snapshot) => {
    usersListEl.innerHTML = '';

    if (!snapshot.exists()) {
      usersListEl.innerHTML = '<p style="color:#aaa;">Пока нет игроков</p>';
      return;
    }

    const users = [];
    snapshot.forEach(child => {
      users.push({ id: child.key, ...child.val() });
    });
    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    users.forEach(user => {
      const row = document.createElement('div');
      row.className = 'user-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'user-name';
      nameEl.textContent = user.name || '—';

      const balEl = document.createElement('span');
      balEl.className = 'user-balance';
      balEl.textContent = (user.balance || 0) + ' 💰';

      const addBtn = document.createElement('button');
      addBtn.className = 'user-add-btn';
      addBtn.textContent = '+100';
      addBtn.onclick = () => {
        db.ref('users/' + user.id + '/balance').transaction(current => (current || 0) + 100);
      };

      row.appendChild(nameEl);
      row.appendChild(balEl);
      row.appendChild(addBtn);
      usersListEl.appendChild(row);
    });
  });
}

// ============================================
// 10. ИНИЦИАЛИЗАЦИЯ
// ============================================
async function init() {
  updateMuteButton();
  const loggedIn = await tryAutoLogin();
  if (loggedIn) enterGame();
  else showScreen('login');
}

init();