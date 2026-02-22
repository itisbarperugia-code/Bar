import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDoc, onSnapshot, orderBy, query, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signOut,
  reload
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJV2s6Vuba11NlZEUwIrLZ1kgHnypt8xo",
  authDomain: "itis-bar-2515a.firebaseapp.com",
  projectId: "itis-bar-2515a",
  storageBucket: "itis-bar-2515a.firebasestorage.app",
  messagingSenderId: "314349221050",
  appId: "1:314349221050:web:42f1decd78fd703550fe83",
  measurementId: "G-C18DGBFJHP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let prodotti = [];
let cart = [];
let orariDisponibili = [];
let authMode = "register";
let userIsVerified = false;
let userIsBanned = false;

const EMOJIS = ["🥪", "🥙", "🌮", "🥐", "🍕", "🥗", "🧆", "🌯"];

const authGate = document.getElementById("authGate");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authConfirm = document.getElementById("authConfirm");
const authConfirmWrap = document.getElementById("authConfirmWrap");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authToggleModeBtn = document.getElementById("authToggleModeBtn");
const authVerifyBox = document.getElementById("authVerifyBox");
const authVerifyText = document.getElementById("authVerifyText");
const resendVerifyBtn = document.getElementById("resendVerifyBtn");
const checkVerifyBtn = document.getElementById("checkVerifyBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authBadge = document.getElementById("authBadge");
const logoutHeaderBtn = document.getElementById("logoutHeaderBtn");

const cartBtn = document.getElementById("cartBtn");
const overlay = document.getElementById("overlay");
const drawer = document.getElementById("drawer");
const paymentModal = document.getElementById("paymentModal");
const payPickupBtn = document.getElementById("payPickupBtn");
const payNowBtn = document.getElementById("payNowBtn");
const closePaymentBtn = document.getElementById("closePaymentBtn");

const menuQuery = query(collection(db, "prodotti"), orderBy("nome"));
onSnapshot(menuQuery, (snapshot) => {
  prodotti = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.disponibile !== false);
  renderMenu();
});

onSnapshot(doc(db, "impostazioni", "orari"), (snap) => {
  orariDisponibili = snap.exists() ? [...(snap.data().lista || [])].sort() : [];
  renderCart();
});

function showToast(message, type = "info", timeout = 3500) {
  showToastInStack("toastStack", message, type, timeout);
}

function showToastRight(message, type = "info", timeout = 3500) {
  showToastInStack("toastStackRight", message, type, timeout);
}

function showToastInStack(stackId, message, type = "info", timeout = 3500) {
  const stack = document.getElementById(stackId);
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  stack.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, timeout);
}

function sanitize(str) {
  const div = document.createElement("div");
  div.textContent = String(str || "");
  return div.innerHTML;
}

function isVerifiedUser() {
  return !!auth.currentUser && !!auth.currentUser.emailVerified;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function bannedDocId(email) {
  return normalizeEmail(email);
}

async function checkCurrentUserBan() {
  if (!auth.currentUser?.email) {
    userIsBanned = false;
    return false;
  }
  try {
    const snap = await getDoc(doc(db, "banned", bannedDocId(auth.currentUser.email)));
    userIsBanned = snap.exists();
    return userIsBanned;
  } catch (err) {
    console.error(err);
    userIsBanned = false;
    return false;
  }
}

function setAuthBadge(text, tone = "off") {
  if (!authBadge) return;
  authBadge.textContent = text;
  authBadge.classList.remove("ok", "warn", "off");
  authBadge.classList.add(tone);
}

function updateAuthUi() {
  if (!auth.currentUser) {
    setAuthBadge("Non autenticato", "off");
    if (logoutHeaderBtn) logoutHeaderBtn.hidden = true;
    return;
  }

  if (userIsBanned) {
    setAuthBadge(`Account bloccato: ${auth.currentUser.email}`, "warn");
    if (logoutHeaderBtn) logoutHeaderBtn.hidden = false;
    return;
  }

  if (isVerifiedUser()) {
    setAuthBadge(`Connesso: ${auth.currentUser.email}`, "ok");
  } else {
    setAuthBadge(`Email da verificare: ${auth.currentUser.email}`, "warn");
  }

  if (logoutHeaderBtn) logoutHeaderBtn.hidden = false;
}

function openAuthGate() {
  authGate.classList.add("open");
  document.body.classList.add("auth-locked");
}

function closeAuthGate() {
  authGate.classList.remove("open");
  document.body.classList.remove("auth-locked");
  // Reset cards for next open
  const cardMain = document.getElementById("authCardMain");
  const cardVerify = document.getElementById("authCardVerify");
  if (cardMain) cardMain.hidden = false;
  if (cardVerify) cardVerify.hidden = true;
}

function requireVerifiedUser(message = "Devi accedere e verificare l'email prima di ordinare.") {
  if (isVerifiedUser()) return true;
  openAuthGate();
  showToast(message, "warning");
  return false;
}

function requireNotBanned() {
  if (!userIsBanned) return true;
  closePaymentModal();
  closeCart();
  showBannedState();
  showToast("Il tuo account e stato bloccato. Contatta il barista.", "error", 4500);
  return false;
}

function updateOrderUiState() {
  const locked = !isVerifiedUser() || userIsBanned;
  cartBtn.classList.toggle("locked", locked);
  updateAuthUi();
  renderMenu();
}

function setAuthMode(mode) {
  authMode = mode;
  const registerMode = authMode === "register";

  authTitle.textContent = registerMode ? "Registrazione richiesta" : "Accedi al tuo account";
  authSubtitle.textContent = registerMode
    ? "Per effettuare ordini devi registrarti e confermare la tua email."
    : "Accedi con il tuo account per continuare.";

  authSubmitBtn.textContent = registerMode ? "Registrati" : "Accedi";
  authToggleModeBtn.textContent = registerMode ? "Ho gia un account" : "Non ho un account";
  authConfirmWrap.hidden = !registerMode;
  authConfirm.required = registerMode;
  authForm.style.display = "flex";
  if (resendVerifyBtn) resendVerifyBtn.style.display = "block";
  if (checkVerifyBtn) checkVerifyBtn.style.display = "block";
  if (logoutBtn) logoutBtn.style.display = "none";

  authVerifyBox.hidden = true;
}

function showVerifyState(user) {
  const cardMain = document.getElementById("authCardMain");
  const cardVerify = document.getElementById("authCardVerify");
  const verifyText = document.getElementById("authVerifyText");
  if (verifyText) verifyText.textContent = `Abbiamo inviato un link di verifica a ${user.email}. Clicca il link e poi premi "Ho verificato".`;
  if (cardMain) cardMain.hidden = true;
  if (cardVerify) cardVerify.hidden = false;
  authVerifyBox.hidden = false;
}

function showBannedState() {
  const bannedEmail = auth.currentUser?.email || "questo account";
  const cardMain = document.getElementById("authCardMain");
  const cardVerify = document.getElementById("authCardVerify");
  // Show verify card with banned message
  if (cardMain) cardMain.hidden = true;
  if (cardVerify) {
    cardVerify.hidden = false;
    const icon = cardVerify.querySelector(".verify-icon");
    if (icon) icon.textContent = "🚫";
    const h2 = cardVerify.querySelector("h2");
    if (h2) h2.textContent = "Account bloccato";
  }
  const verifyText = document.getElementById("authVerifyText");
  if (verifyText) verifyText.textContent = `L'email ${bannedEmail} è stata bannata dal barista. Contatta il bar per assistenza.`;
  authVerifyBox.hidden = false;
  if (resendVerifyBtn) resendVerifyBtn.style.display = "none";
  if (checkVerifyBtn) checkVerifyBtn.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "block";
  openAuthGate();
}

async function refreshVerificationState() {
  if (!auth.currentUser) return false;
  await reload(auth.currentUser);
  return !!auth.currentUser.emailVerified;
}

async function ensureVerifiedSession() {
  try {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    if (!auth.currentUser.emailVerified) return false;
    await auth.currentUser.getIdToken(true);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function renderMenu() {
  const list = document.getElementById("menuList");
  if (!prodotti.length) {
    list.innerHTML = '<div class="loading">Nessun prodotto disponibile al momento.</div>';
    return;
  }

  const canOrder = isVerifiedUser();
  const canOrderUnlocked = canOrder && !userIsBanned;

  list.innerHTML = prodotti
    .map(
      (p, i) => `
      <div class="panino-card">
        <div class="panino-emoji">${EMOJIS[i % EMOJIS.length]}</div>
        <div class="panino-body">
          <div class="panino-tag">${sanitize(p.tag) || "Panino"}</div>
          <div class="panino-name">${sanitize(p.nome)}</div>
          <div class="panino-desc">${sanitize(p.descrizione) || ""}</div>
        </div>
        <div class="panino-right">
          <div class="panino-price">${Number(p.prezzo || 0).toFixed(2).replace(".", ",")} <span>EUR</span></div>
          <button class="add-btn ${canOrderUnlocked ? "" : "is-locked"}" data-name="${sanitize(p.nome)}" data-price="${Number(p.prezzo || 0)}" ${canOrderUnlocked ? "" : "disabled"}>+</button>
        </div>
      </div>`
    )
    .join("");

  document.querySelectorAll(".add-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!requireVerifiedUser()) return;
      if (!requireNotBanned()) return;

      const name = btn.dataset.name;
      const price = parseFloat(btn.dataset.price);
      const item = cart.find((i) => i.name === name);
      if (item) item.qty += 1;
      else cart.push({ name, price, qty: 1 });

      renderCart();

      btn.textContent = "✓";
      btn.style.background = "#4caf50";
      setTimeout(() => {
        btn.textContent = "+";
        btn.style.background = "";
      }, 700);

      cartBtn.style.transform = "scale(1.15)";
      setTimeout(() => {
        cartBtn.style.transform = "";
      }, 200);
    });
  });
}

function renderCart() {
  document.getElementById("cartCount").textContent = cart.reduce((s, i) => s + i.qty, 0);
  const el = document.getElementById("drawerItems");
  const bot = document.getElementById("drawerBottom");
  if (!el || !bot) return;

  if (!cart.length) {
    el.innerHTML = '<div class="drawer-empty">Nessun panino selezionato</div>';
    bot.style.display = "none";
    return;
  }

  bot.style.display = "block";

  const sel = document.getElementById("inputOrario");
  if (sel) {
    const prevVal = sel.value;
    sel.innerHTML =
      '<option value="">Seleziona orario...</option>' +
      orariDisponibili.map((o) => {
        const safe = sanitize(o);
        return `<option value="${safe}" ${o === prevVal ? "selected" : ""}>${safe}</option>`;
      }).join("");
  }

  el.innerHTML = cart
    .map(
      (item, idx) => `
      <div class="drawer-item">
        <div>
          <div class="drawer-item-name">${sanitize(item.name)}</div>
          <div class="drawer-item-price">EUR ${item.price.toFixed(2)} cad.</div>
        </div>
        <div class="drawer-controls">
          <button class="q-btn" data-idx="${idx}" data-delta="-1">-</button>
          <span class="qty-num">${item.qty}</span>
          <button class="q-btn" data-idx="${idx}" data-delta="1">+</button>
        </div>
      </div>`
    )
    .join("");

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tt = document.getElementById("totalText");
  if (tt) tt.textContent = "EUR " + total.toFixed(2);
}

function openCart() {
  if (!requireVerifiedUser()) return;
  if (!requireNotBanned()) return;
  drawer.classList.add("open");
  overlay.classList.add("open");
}

function closeCart() {
  drawer.classList.remove("open");
  overlay.classList.remove("open");
}

function openPaymentModal() {
  if (!requireVerifiedUser()) return;
  if (!cart.length) {
    showToast("Aggiungi almeno un prodotto al carrello.", "warning");
    return;
  }
  paymentModal.hidden = false;
  paymentModal.classList.add("open");
}

function closePaymentModal() {
  paymentModal.classList.remove("open");
  paymentModal.hidden = true;
}

function handleOrderButtonClick() {
  openPaymentModal();
}

function resetDrawer() {
  document.getElementById("drawerContent").innerHTML = `
    <h3>Il tuo ordine</h3>
    <div id="drawerItems"><div class="drawer-empty">Nessun panino selezionato</div></div>
    <div id="drawerBottom" style="display:none">
      <div class="student-form">
        <label>Il tuo nome</label>
        <input type="text" id="inputNome" placeholder="es. Marco">
        <label>Classe</label>
        <input type="text" id="inputClasse" placeholder="es. 3A">
        <label>Orario di ritiro</label>
        <select id="inputOrario" style="width:100%;padding:11px 14px;border:2px solid #e8e8e8;border-radius:10px;font-family:'Nunito',sans-serif;font-size:0.95rem;outline:none;background:#fff;transition:border-color 0.2s">
          <option value="">Seleziona orario...</option>
        </select>
      </div>
      <div class="drawer-total"><span>Totale</span><span id="totalText">EUR 0.00</span></div>
      <button class="order-btn" id="orderBtn">Conferma ordine</button>
    </div>`;

  document.getElementById("orderBtn").addEventListener("click", handleOrderButtonClick);
  renderCart();
}

async function sendOrder() {
  if (!requireVerifiedUser()) return;
  await checkCurrentUserBan();
  if (!requireNotBanned()) return;
  const verifiedForRules = await ensureVerifiedSession();
  if (!verifiedForRules) {
    openAuthGate();
    updateOrderUiState();
    showToast("Sessione non aggiornata: verifica email richiesta.", "warning", 4200);
    return;
  }

  const nomeInput = document.getElementById("inputNome");
  const classeInput = document.getElementById("inputClasse");
  const orario = document.getElementById("inputOrario")?.value || "";

  const nomeRaw = nomeInput?.value.trim() || "";
  const classeRaw = classeInput?.value.trim() || "";

  if (!nomeRaw || !classeRaw) {
    showToast("Inserisci nome e classe.", "warning");
    return;
  }

  if (orariDisponibili.length && !orario) {
    showToast("Seleziona un orario di ritiro.", "warning");
    return;
  }

  const nome = sanitize(nomeRaw);
  const classe = sanitize(classeRaw);
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  if (total > 50) {
    showToast("Totale massimo consentito: EUR 50.00.", "warning", 4200);
    return;
  }

  const btn = document.getElementById("orderBtn");
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = "Invio in corso...";

  try {
    const orderNum = Array.from(crypto.getRandomValues(new Uint8Array(5)))
      .map(b => b.toString(36).padStart(2,'0'))
      .join('').toUpperCase().slice(0, 8);
    await addDoc(collection(db, "ordini"), {
      numero: orderNum,
      nome,
      classe,
      orario: orario || null,
      prodotti: cart.map((i) => ({ nome: i.name, qty: i.qty, prezzo: i.price })),
      totale: total,
      stato: "in attesa",
      email: normalizeEmail(auth.currentUser?.email),
      timestamp: serverTimestamp()
    });

    cart = [];
    document.getElementById("cartCount").textContent = "0";

    document.getElementById("drawerContent").innerHTML = `
      <div class="success-box">
        <div class="icon">🎉</div>
        <h3>Ordine inviato</h3>
        <div class="order-num">#${orderNum}</div>
        <p><strong>${nome}</strong> - Classe ${classe}<br>${orario ? `Ritiro alle <strong>${orario}</strong>` : "Passa al bar all'intervallo"} con il tuo numero.</p>
      </div>
      <button class="order-btn" id="newOrderBtn" style="margin-top:12px">Nuovo ordine</button>`;

    document.getElementById("newOrderBtn").addEventListener("click", resetDrawer);
    showToast(`Ordine #${orderNum} inviato con successo.`, "success");
  } catch (e) {
    console.error(e);
    showToast("Errore nell'invio dell'ordine. Riprova.", "error", 5000);
    btn.disabled = false;
    btn.textContent = "Conferma ordine";
  }
}

cartBtn.addEventListener("click", openCart);
overlay.addEventListener("click", closeCart);

drawer.addEventListener("click", (e) => {
  const btn = e.target.closest(".q-btn");
  if (!btn) return;

  const idx = parseInt(btn.dataset.idx, 10);
  const delta = parseInt(btn.dataset.delta, 10);

  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);

  renderCart();
  if (!cart.length) closeCart();
});

document.getElementById("orderBtn").addEventListener("click", handleOrderButtonClick);

if (payPickupBtn) {
  payPickupBtn.addEventListener("click", async () => {
    closePaymentModal();
    await sendOrder();
  });
}

if (payNowBtn) {
  payNowBtn.addEventListener("click", () => {
    closePaymentModal();
    showToastRight("Prossimamente disponibile.", "info", 3200);
  });
}

if (closePaymentBtn) {
  closePaymentBtn.addEventListener("click", closePaymentModal);
}

if (paymentModal) {
  paymentModal.addEventListener("click", (e) => {
    if (e.target === paymentModal) closePaymentModal();
  });
}

authToggleModeBtn.addEventListener("click", () => {
  setAuthMode(authMode === "register" ? "login" : "register");
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (userIsBanned) {
    showBannedState();
    showToast("Account bloccato: accesso ordini disabilitato.", "error", 4200);
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;
  const confirm = authConfirm.value;

  if (!email) {
    showToast("Inserisci una email valida.", "warning");
    return;
  }

  if (!password || password.length < 6) {
    showToast("La password deve avere almeno 6 caratteri.", "warning");
    return;
  }

  authSubmitBtn.disabled = true;

  try {
    if (authMode === "register") {
      if (password !== confirm) {
        showToast("Le password non coincidono.", "warning");
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
      showVerifyState(cred.user);
      showToast("Email di verifica inviata. Controlla la posta.", "success", 4200);
      authPassword.value = "";
      authConfirm.value = "";
    } else {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await reload(cred.user);
      if (cred.user.emailVerified) {
        await cred.user.getIdToken(true);
        closeAuthGate();
        showToast("Accesso effettuato.", "success");
      } else {
        showVerifyState(cred.user);
        openAuthGate();
        showToast("Account trovato ma email non verificata.", "warning", 4200);
      }
      authPassword.value = "";
      authConfirm.value = "";
    }
  } catch (err) {
    console.error(err);
    const authErrMap = {
      'auth/email-already-in-use': 'Email già registrata. Prova ad accedere.',
      'auth/wrong-password': 'Password errata.',
      'auth/invalid-credential': 'Email o password errati.',
      'auth/user-not-found': 'Nessun account trovato.',
      'auth/weak-password': 'Password troppo corta (minimo 6 caratteri).',
      'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
      'auth/invalid-email': 'Email non valida.',
      'auth/network-request-failed': 'Errore di rete. Controlla la connessione.',
    };
    showToast(authErrMap[err.code] || 'Errore di accesso. Riprova.', "error", 5200);
  } finally {
    authSubmitBtn.disabled = false;
  }
});

resendVerifyBtn.addEventListener("click", async () => {
  if (!auth.currentUser) {
    showToast("Nessun utente autenticato.", "warning");
    return;
  }

  try {
    await sendEmailVerification(auth.currentUser);
    showToast("Email di verifica inviata nuovamente.", "success");
  } catch (err) {
    showToast("Errore durante l'invio dell'email. Attendi qualche secondo.", "error");
  }
});

checkVerifyBtn.addEventListener("click", async () => {
  if (!auth.currentUser) {
    showToast("Effettua prima il login.", "warning");
    return;
  }

  try {
    const verified = await refreshVerificationState();
    if (verified) {
      await auth.currentUser.getIdToken(true);
      userIsVerified = true;
      closeAuthGate();
      updateOrderUiState();
      showToast("Email verificata. Ora puoi ordinare.", "success");
    } else {
      showVerifyState(auth.currentUser);
      showToast("Email non ancora verificata.", "warning");
    }
  } catch (err) {
    showToast("Errore nel controllo della verifica. Riprova.", "error");
  }
});

async function performLogout() {
  try {
    await signOut(auth);
    cart = [];
    renderCart();
    closeCart();
    // Reset to main card
    const cardMain = document.getElementById("authCardMain");
    const cardVerify = document.getElementById("authCardVerify");
    if (cardMain) cardMain.hidden = false;
    if (cardVerify) {
      cardVerify.hidden = true;
      // Reset verify card in case it was showing banned state
      const icon = cardVerify.querySelector(".verify-icon");
      if (icon) icon.textContent = "📧";
      const h2 = cardVerify.querySelector("h2");
      if (h2) h2.textContent = "Controlla la tua email";
      if (resendVerifyBtn) resendVerifyBtn.style.display = "block";
      if (checkVerifyBtn) checkVerifyBtn.style.display = "block";
    }
    showToast("Sei uscito dall'account.", "info");
  } catch (err) {
    showToast("Errore durante il logout.", "error");
  }
}

logoutBtn.addEventListener("click", performLogout);
if (logoutHeaderBtn) logoutHeaderBtn.addEventListener("click", performLogout);

// Back to login from verify card — delete unverified account and return
const backToLoginBtn = document.getElementById("backToLoginBtn");
if (backToLoginBtn) {
  backToLoginBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (user && !user.emailVerified) {
      try { await user.delete(); } catch(e) { /* account già eliminato o sessione scaduta */ }
    }
    await signOut(auth).catch(() => {});
    cart = [];
    renderCart();
    const cardMain = document.getElementById("authCardMain");
    const cardVerify = document.getElementById("authCardVerify");
    if (cardMain) cardMain.hidden = false;
    if (cardVerify) {
      cardVerify.hidden = true;
      const icon = cardVerify.querySelector(".verify-icon");
      if (icon) icon.textContent = "📧";
      const h2 = cardVerify.querySelector("h2");
      if (h2) h2.textContent = "Controlla la tua email";
      if (resendVerifyBtn) resendVerifyBtn.style.display = "block";
      if (checkVerifyBtn) checkVerifyBtn.style.display = "block";
    }
    setAuthMode("register");
    showToast("Registrazione annullata. Puoi riprovare.", "info");
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    userIsVerified = false;
    userIsBanned = false;
    setAuthMode("register");
    openAuthGate();
    updateOrderUiState();
    return;
  }

  try {
    await reload(user);
  } catch (e) {
    console.error(e);
  }

  userIsVerified = !!auth.currentUser?.emailVerified;
  await checkCurrentUserBan();
  if (userIsVerified) {
    try {
      await auth.currentUser.getIdToken(true);
    } catch (err) {
      console.error(err);
    }
    closeAuthGate();
  } else {
    openAuthGate();
    showVerifyState(auth.currentUser);
  }

  updateOrderUiState();
  if (userIsBanned) {
    closeCart();
    showBannedState();
    showToast("Account bloccato: non puoi effettuare ordini.", "error", 4500);
  }
});

setAuthMode("register");
renderCart();
renderMenu();