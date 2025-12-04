/******************** FIREBASE SETUP ********************/
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TODO: Put YOUR Firebase config here
const firebaseConfig = {
  apiKey: "AIzaSyBFshNVsXI2kvP1ETjDmubYDR1l0Sed-2c",
  authDomain: "poohpooh-bank.firebaseapp.com",
  projectId: "poohpooh-bank",
  storageBucket: "poohpooh-bank.firebasestorage.app",
  messagingSenderId: "630472440652",
  appId: "1:630472440652:web:efb873cab5933a8e336de9",
  measurementId: "G-XSE1J37NLG"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/******************** DOM ELEMENTS ********************/
const authCard = document.getElementById("authCard");
const appRoot = document.getElementById("appRoot");

const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authName = document.getElementById("authName");
const btnSignUp = document.getElementById("btnSignUp");
const btnSignIn = document.getElementById("btnSignIn");
const btnSignOut = document.getElementById("btnSignOut");
const authStatus = document.getElementById("authStatus");
const userEmailLabel = document.getElementById("userEmailLabel");

const incomeInput = document.getElementById("incomeInput");
const savingTargetInput = document.getElementById("savingTargetInput");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const settingsStatus = document.getElementById("settingsStatus");

const txDateInput = document.getElementById("txDateInput");
const txAmountInput = document.getElementById("txAmountInput");
const txMerchantInput = document.getElementById("txMerchantInput");
const txCategoryInput = document.getElementById("txCategoryInput");
const btnAddTransaction = document.getElementById("btnAddTransaction");
const txStatus = document.getElementById("txStatus");

const sumIncome = document.getElementById("sumIncome");
const sumSpent = document.getElementById("sumSpent");
const sumExpectedSaving = document.getElementById("sumExpectedSaving");
const sumExpectedSavingPct = document.getElementById("sumExpectedSavingPct");
const sumActualSaving = document.getElementById("sumActualSaving");
const sumActualSavingPct = document.getElementById("sumActualSavingPct");
const savingStatus = document.getElementById("savingStatus");

const categoryTableBody = document.getElementById("categoryTableBody");
const txTableBody = document.getElementById("txTableBody");
const txTable = document.getElementById("txTable");

// Account elements
const accountEmailLabel = document.getElementById("accountEmailLabel");
const accountNameInput = document.getElementById("accountNameInput");
const accountMemberSince = document.getElementById("accountMemberSince");
const btnUpdateAccount = document.getElementById("btnUpdateAccount");
const accountStatus = document.getElementById("accountStatus");

let txSortState = { key: "date", direction: "desc" };

/******************** GLOBAL STATE ********************/
let currentUser = null;
let userSettings = {
  income: 0,
  savingTargetPercent: 0
};
let userProfile = {
  displayName: "",
  createdAt: null
};
let transactions = []; // local cache of Firestore data

/******************** UTIL HELPERS ********************/
function formatCurrency(value) {
  const num = Number(value) || 0;
  return "£" + num.toFixed(2);
}

function percent(value) {
  const num = Number(value) || 0;
  return num.toFixed(1) + "%";
}

function formatDateHuman(dt) {
  if (!dt) return "–";
  try {
    return dt.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "–";
  }
}

// Simple auto-categorisation rules based on merchant text
function guessCategory(merchantRaw) {
  const merchant = (merchantRaw || "").toLowerCase();

  const rules = [
    { match: ["asda", "tesco", "morrisons", "aldi", "lidl", "sainsbury"], category: "Groceries" },
    { match: ["netflix", "spotify", "disney", "cinema"], category: "Entertainment" },
    { match: ["tfl", "bus", "train", "uber", "bolt"], category: "Transport" },
    { match: ["rent"], category: "Rent" },
    { match: ["vodafone", "o2", "ee", "three"], category: "Phone" },
    { match: ["octopus", "british gas", "edf"], category: "Energy" },
    { match: ["amazon"], category: "Shopping" }
  ];

  for (const rule of rules) {
    for (const key of rule.match) {
      if (merchant.includes(key)) return rule.category;
    }
  }
  return "Other";
}

/******************** AUTH HANDLERS ********************/
btnSignUp.addEventListener("click", async () => {
  authStatus.textContent = "";
  try {
    const email = authEmail.value.trim();
    const pass = authPassword.value;
    const name = authName.value.trim();
    if (!email || !pass) {
      authStatus.textContent = "Please enter email and password.";
      return;
    }
    const cred = await createUserWithEmailAndPassword(auth, email, pass);

    // Create user doc with account info
    const userDocRef = doc(db, "users", cred.user.uid);
    await setDoc(userDocRef, {
      income: 0,
      savingTargetPercent: 0,
      displayName: name || "",
      createdAt: serverTimestamp()
    });

    authStatus.textContent = "Account created and signed in.";
  } catch (err) {
    authStatus.textContent = "Sign up error: " + err.message;
  }
});

btnSignIn.addEventListener("click", async () => {
  authStatus.textContent = "";
  try {
    const email = authEmail.value.trim();
    const pass = authPassword.value;
    if (!email || !pass) {
      authStatus.textContent = "Please enter email and password.";
      return;
    }
    await signInWithEmailAndPassword(auth, email, pass);
    authStatus.textContent = "Signed in.";
  } catch (err) {
    authStatus.textContent = "Sign in error: " + err.message;
  }
});

btnSignOut.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    authCard.classList.add("hidden");
    appRoot.classList.remove("hidden");

    accountEmailLabel.textContent = user.email || user.uid;

    await loadUserSettingsAndProfile();
    attachTransactionsListener();
  } else {
    appRoot.classList.add("hidden");
    authCard.classList.remove("hidden");
    transactions = [];
    userSettings = { income: 0, savingTargetPercent: 0 };
    userProfile = { displayName: "", createdAt: null };
    renderAll();
  }
});

/******************** SETTINGS & PROFILE ********************/
async function loadUserSettingsAndProfile() {
  if (!currentUser) return;
  const userDocRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userDocRef);

  if (snap.exists()) {
    const data = snap.data();
    userSettings.income = data.income || 0;
    userSettings.savingTargetPercent = data.savingTargetPercent || 0;
    userProfile.displayName = data.displayName || "";
    userProfile.createdAt = data.createdAt ? data.createdAt.toDate() : null;
  } else {
    userSettings.income = 0;
    userSettings.savingTargetPercent = 0;
    userProfile.displayName = "";
    userProfile.createdAt = null;
  }

  // Fill inputs
  incomeInput.value = userSettings.income || "";
  savingTargetInput.value = userSettings.savingTargetPercent || "";
  accountNameInput.value = userProfile.displayName || "";

  const labelEmail = currentUser.email || currentUser.uid;
  const label = userProfile.displayName
    ? `${userProfile.displayName} (${labelEmail})`
    : labelEmail;
  userEmailLabel.textContent = label;

  accountMemberSince.textContent = formatDateHuman(userProfile.createdAt);

  renderSummary();
}

btnSaveSettings.addEventListener("click", async () => {
  settingsStatus.textContent = "";
  if (!currentUser) {
    settingsStatus.textContent = "Not logged in.";
    return;
  }
  const income = Number(incomeInput.value) || 0;
  const targetPct = Number(savingTargetInput.value) || 0;

  userSettings.income = income;
  userSettings.savingTargetPercent = targetPct;

  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    await setDoc(
      userDocRef,
      {
        income,
        savingTargetPercent: targetPct
      },
      { merge: true }
    );
    settingsStatus.textContent = "Settings saved.";
    renderSummary();
  } catch (err) {
    settingsStatus.textContent = "Error saving: " + err.message;
  }
});

btnUpdateAccount.addEventListener("click", async () => {
  accountStatus.textContent = "";
  if (!currentUser) {
    accountStatus.textContent = "Not logged in.";
    return;
  }
  const newName = accountNameInput.value.trim();
  userProfile.displayName = newName;

  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    await setDoc(
      userDocRef,
      {
        displayName: newName
      },
      { merge: true }
    );
    const labelEmail = currentUser.email || currentUser.uid;
    const label = newName ? `${newName} (${labelEmail})` : labelEmail;
    userEmailLabel.textContent = label;
    accountStatus.textContent = "Account updated.";
  } catch (err) {
    accountStatus.textContent = "Error updating account: " + err.message;
  }
});

/******************** TRANSACTIONS ********************/
function attachTransactionsListener() {
  if (!currentUser) return;
  const txColRef = collection(db, "users", currentUser.uid, "transactions");
  const q = query(txColRef, orderBy("date", "desc"));

  onSnapshot(q, (snapshot) => {
    transactions = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderAll();
  });
}

btnAddTransaction.addEventListener("click", async () => {
  txStatus.textContent = "";
  if (!currentUser) {
    txStatus.textContent = "Not logged in.";
    return;
  }

  const date = txDateInput.value || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const amount = Number(txAmountInput.value);
  const merchant = txMerchantInput.value.trim();
  let category = txCategoryInput.value.trim();

  if (isNaN(amount) || amount <= 0) {
    txStatus.textContent = "Please enter a positive amount.";
    return;
  }
  if (!merchant) {
    txStatus.textContent = "Please enter a merchant/description.";
    return;
  }

  if (!category) {
    category = guessCategory(merchant);
  }

  try {
    const txColRef = collection(db, "users", currentUser.uid, "transactions");
    await addDoc(txColRef, {
      date,
      amount,
      merchant,
      category
    });

    txStatus.textContent = "Transaction added.";
    txAmountInput.value = "";
    txMerchantInput.value = "";
    txCategoryInput.value = "";
  } catch (err) {
    txStatus.textContent = "Error adding transaction: " + err.message;
  }
});

async function deleteTransaction(id) {
  if (!currentUser || !id) return;
  const txDocRef = doc(db, "users", currentUser.uid, "transactions", id);
  await deleteDoc(txDocRef);
}

/******************** RENDER FUNCTIONS ********************/
function renderAll() {
  renderSummary();
  renderCategories();
  renderTransactionsTable();
}

function renderSummary() {
  const income = Number(userSettings.income) || 0;
  const targetPct = Number(userSettings.savingTargetPercent) || 0;

  const totalSpent = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const expectedSaving = (income * targetPct) / 100;
  const actualSaving = income - totalSpent;
  const actualSavingPct = income > 0 ? (actualSaving / income) * 100 : 0;

  sumIncome.textContent = formatCurrency(income);
  sumSpent.textContent = formatCurrency(totalSpent);
  sumExpectedSaving.textContent = formatCurrency(expectedSaving);
  sumExpectedSavingPct.textContent = percent(targetPct);
  sumActualSaving.textContent = formatCurrency(actualSaving);
  sumActualSavingPct.textContent = percent(actualSavingPct);

  if (income <= 0) {
    savingStatus.textContent = "Set your income to see status.";
    savingStatus.classList.remove("status-ok", "status-bad");
  } else if (actualSaving >= expectedSaving) {
    savingStatus.textContent = "On track ✅";
    savingStatus.classList.add("status-ok");
    savingStatus.classList.remove("status-bad");
  } else {
    savingStatus.textContent = "Below target ❌";
    savingStatus.classList.add("status-bad");
    savingStatus.classList.remove("status-ok");
  }
}

function renderCategories() {
  categoryTableBody.innerHTML = "";
  const totals = {};
  let totalSpent = 0;

  for (const t of transactions) {
    const amount = Number(t.amount) || 0;
    const cat = t.category || "Uncategorised";
    totalSpent += amount;
    totals[cat] = (totals[cat] || 0) + amount;
  }

  const cats = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  for (const [cat, amount] of cats) {
    const tr = document.createElement("tr");
    const pct = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;

    tr.innerHTML = `
      <td>${cat}</td>
      <td class="right">${formatCurrency(amount)}</td>
      <td class="right">${percent(pct)}</td>
    `;
    categoryTableBody.appendChild(tr);
  }

  if (cats.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" class="small-info">No transactions yet.</td>`;
    categoryTableBody.appendChild(tr);
  }
}

function renderTransactionsTable() {
  txTableBody.innerHTML = "";

  const rows = [...transactions];
  const { key, direction } = txSortState;
  rows.sort((a, b) => {
    let av = a[key];
    let bv = b[key];

    if (key === "amount") {
      av = Number(av) || 0;
      bv = Number(bv) || 0;
    } else if (key === "date") {
      // compare YYYY-MM-DD strings
    } else if (key === "category") {
      av = (av || "").toLowerCase();
      bv = (bv || "").toLowerCase();
    }

    if (av < bv) return direction === "asc" ? -1 : 1;
    if (av > bv) return direction === "asc" ? 1 : -1;
    return 0;
  });

  for (const t of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.date || ""}</td>
      <td>${t.merchant || ""}</td>
      <td class="right">${formatCurrency(t.amount)}</td>
      <td><span class="tag">${t.category || "Uncategorised"}</span></td>
      <td>
        <button class="danger" data-id="${t.id}">Delete</button>
      </td>
    `;
    txTableBody.appendChild(tr);
  }

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="small-info">No transactions yet.</td>`;
    txTableBody.appendChild(tr);
  }

  txTableBody.querySelectorAll("button.danger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (confirm("Delete this transaction?")) {
        deleteTransaction(id);
      }
    });
  });
}

// Sort handling for the transactions table
txTable.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.getAttribute("data-sort-key");
    if (!key) return;

    if (txSortState.key === key) {
      txSortState.direction = txSortState.direction === "asc" ? "desc" : "asc";
    } else {
      txSortState.key = key;
      txSortState.direction = "asc";
    }
    renderTransactionsTable();
  });
});

// Default date = today
txDateInput.value = new Date().toISOString().slice(0, 10);
