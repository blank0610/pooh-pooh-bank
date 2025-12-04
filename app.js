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

/* Profile */
const profileEmailLabel = document.getElementById("profileEmailLabel");
const profileNameInput = document.getElementById("profileNameInput");
const profileMemberSince = document.getElementById("profileMemberSince");
const btnUpdateProfile = document.getElementById("btnUpdateProfile");
const profileStatus = document.getElementById("profileStatus");

/* Money accounts management */
const accountSelect = document.getElementById("accountSelect");
const accountNameEditInput = document.getElementById("accountNameEditInput");
const accountTypeEditSelect = document.getElementById("accountTypeEditSelect");
const accountNoteEditInput = document.getElementById("accountNoteEditInput");
const btnUpdateAccountDetails = document.getElementById("btnUpdateAccountDetails");
const accountEditStatus = document.getElementById("accountEditStatus");

const newAccountNameInput = document.getElementById("newAccountNameInput");
const newAccountTypeSelect = document.getElementById("newAccountTypeSelect");
const newAccountNoteInput = document.getElementById("newAccountNoteInput");
const btnCreateAccount = document.getElementById("btnCreateAccount");
const accountCreateStatus = document.getElementById("accountCreateStatus");

/* Settings per account (dropdown) */
const settingsAccountSelect = document.getElementById("settingsAccountSelect");
const incomeInput = document.getElementById("incomeInput");
const savingTargetInput = document.getElementById("savingTargetInput");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const settingsStatus = document.getElementById("settingsStatus");

/* Transactions input (dropdown) */
const txAccountSelect = document.getElementById("txAccountSelect");
const txDateInput = document.getElementById("txDateInput");
const txAmountInput = document.getElementById("txAmountInput");
const txMerchantInput = document.getElementById("txMerchantInput");
const txCategoryInput = document.getElementById("txCategoryInput");
const btnAddTransaction = document.getElementById("btnAddTransaction");
const txStatus = document.getElementById("txStatus");

/* Summary */
const sumIncome = document.getElementById("sumIncome");
const sumSpent = document.getElementById("sumSpent");
const sumExpectedSaving = document.getElementById("sumExpectedSaving");
const sumExpectedSavingPct = document.getElementById("sumExpectedSavingPct");
const sumActualSaving = document.getElementById("sumActualSaving");
const sumActualSavingPct = document.getElementById("sumActualSavingPct");
const savingStatus = document.getElementById("savingStatus");
const accountsSummaryTableBody = document.getElementById("accountsSummaryTableBody");

/* Tables */
const categoryTableBody = document.getElementById("categoryTableBody");
const txTableBody = document.getElementById("txTableBody");
const txTable = document.getElementById("txTable");

let txSortState = { key: "date", direction: "desc" };

/******************** GLOBAL STATE ********************/
let currentUser = null;

// Per-user profile
let userProfile = {
  displayName: "",
  createdAt: null
};

// Money accounts list
let accounts = []; // { id, name, type, note, income, savingTargetPercent, createdAt }

let selectedSettingsAccountId = "";
let selectedTxAccountId = "";

// Transactions per account: { accountId: [tx,...] }
let transactionsByAccount = {};
let txUnsubscribes = {};
let accountsUnsubscribe = null;

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

function getAllTransactionsFlat() {
  const result = [];
  for (const acc of accounts) {
    const list = transactionsByAccount[acc.id] || [];
    for (const tx of list) {
      result.push({
        ...tx,
        accountId: acc.id,
        accountName: acc.name || "(no name)"
      });
    }
  }
  return result;
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

    // Create user profile doc
    const userDocRef = doc(db, "users", cred.user.uid);
    await setDoc(userDocRef, {
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

  // Clean up listeners when logged out
  if (!user) {
    if (accountsUnsubscribe) accountsUnsubscribe();
    accountsUnsubscribe = null;

    for (const id in txUnsubscribes) {
      txUnsubscribes[id]();
    }
    txUnsubscribes = {};
    transactionsByAccount = {};
  }

  if (user) {
    authCard.classList.add("hidden");
    appRoot.classList.remove("hidden");

    const email = user.email || user.uid;
    userEmailLabel.textContent = email;
    profileEmailLabel.textContent = email;

    await loadUserProfile();
    attachAccountsListener();
  } else {
    appRoot.classList.add("hidden");
    authCard.classList.remove("hidden");

    accounts = [];
    selectedSettingsAccountId = "";
    selectedTxAccountId = "";
    userProfile = { displayName: "", createdAt: null };
    renderAll();
    renderAccountDropdowns();
  }
});

/******************** PROFILE (login-level) ********************/
async function loadUserProfile() {
  if (!currentUser) return;
  const userDocRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userDocRef);

  if (snap.exists()) {
    const data = snap.data();
    userProfile.displayName = data.displayName || "";
    userProfile.createdAt = data.createdAt ? data.createdAt.toDate() : null;
  } else {
    userProfile.displayName = "";
    userProfile.createdAt = null;
  }

  profileNameInput.value = userProfile.displayName || "";

  const labelEmail = currentUser.email || currentUser.uid;
  const label = userProfile.displayName
    ? `${userProfile.displayName} (${labelEmail})`
    : labelEmail;
  userEmailLabel.textContent = label;

  profileMemberSince.textContent = formatDateHuman(userProfile.createdAt);
}

btnUpdateProfile.addEventListener("click", async () => {
  profileStatus.textContent = "";
  if (!currentUser) {
    profileStatus.textContent = "Not logged in.";
    return;
  }
  const newName = profileNameInput.value.trim();
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
    profileStatus.textContent = "Profile updated.";
  } catch (err) {
    profileStatus.textContent = "Error updating profile: " + err.message;
  }
});

/******************** MONEY ACCOUNTS (multi bank accounts) ********************/
function attachAccountsListener() {
  if (!currentUser) return;
  if (accountsUnsubscribe) accountsUnsubscribe();

  const accColRef = collection(db, "users", currentUser.uid, "accounts");
  const q = query(accColRef, orderBy("createdAt", "asc"));

  accountsUnsubscribe = onSnapshot(q, (snapshot) => {
    const newAccounts = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    // Handle removed accounts: stop their tx listeners
    const newIds = new Set(newAccounts.map((a) => a.id));
    for (const id in txUnsubscribes) {
      if (!newIds.has(id)) {
        txUnsubscribes[id]();
        delete txUnsubscribes[id];
        delete transactionsByAccount[id];
      }
    }

    accounts = newAccounts;

    // Attach tx listener for any new accounts
    for (const acc of accounts) {
      if (!txUnsubscribes[acc.id]) {
        attachTransactionsListenerForAccount(acc.id);
      }
    }

    // Update selects
    renderAccountDropdowns();

    // Update edit account section fields
    updateAccountEditSelection();

    // Re-render summary / transactions with new account data
    renderAll();
  });
}

function renderAccountDropdowns() {
  // Money account edit dropdown
  accountSelect.innerHTML = "";
  const editDefaultOpt = document.createElement("option");
  editDefaultOpt.value = "";
  editDefaultOpt.textContent = accounts.length ? "Select account" : "No accounts yet";
  accountSelect.appendChild(editDefaultOpt);

  for (const acc of accounts) {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = acc.name || "(no name)";
    accountSelect.appendChild(opt);
  }

  // Settings dropdown
  settingsAccountSelect.innerHTML = "";
  const setDef = document.createElement("option");
  setDef.value = "";
  setDef.textContent = accounts.length ? "Select account" : "No accounts yet";
  settingsAccountSelect.appendChild(setDef);

  for (const acc of accounts) {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = acc.name || "(no name)";
    settingsAccountSelect.appendChild(opt);
  }

  if (selectedSettingsAccountId && accounts.some((a) => a.id === selectedSettingsAccountId)) {
    settingsAccountSelect.value = selectedSettingsAccountId;
  } else {
    selectedSettingsAccountId = "";
  }

  // Transaction dropdown
  txAccountSelect.innerHTML = "";
  const txDef = document.createElement("option");
  txDef.value = "";
  txDef.textContent = accounts.length ? "Select account" : "No accounts yet";
  txAccountSelect.appendChild(txDef);

  for (const acc of accounts) {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = acc.name || "(no name)";
    txAccountSelect.appendChild(opt);
  }

  if (selectedTxAccountId && accounts.some((a) => a.id === selectedTxAccountId)) {
    txAccountSelect.value = selectedTxAccountId;
  } else {
    selectedTxAccountId = "";
  }
}

// Edit account selection
accountSelect.addEventListener("change", updateAccountEditSelection);

function updateAccountEditSelection() {
  const accId = accountSelect.value || "";
  const acc = accounts.find((a) => a.id === accId);
  if (!acc) {
    accountNameEditInput.value = "";
    accountTypeEditSelect.value = "";
    accountNoteEditInput.value = "";
    return;
  }

  accountNameEditInput.value = acc.name || "";
  accountTypeEditSelect.value = acc.type || "";
  accountNoteEditInput.value = acc.note || "";
}

btnCreateAccount.addEventListener("click", async () => {
  accountCreateStatus.textContent = "";
  if (!currentUser) {
    accountCreateStatus.textContent = "Not logged in.";
    return;
  }

  const name = newAccountNameInput.value.trim();
  const type = newAccountTypeSelect.value || "Current";
  const note = newAccountNoteInput.value.trim();

  if (!name) {
    accountCreateStatus.textContent = "Please enter account name.";
    return;
  }

  try {
    const accColRef = collection(db, "users", currentUser.uid, "accounts");
    await addDoc(accColRef, {
      name,
      type,
      note,
      income: 0,
      savingTargetPercent: 0,
      createdAt: serverTimestamp()
    });

    accountCreateStatus.textContent = "Account created.";
    newAccountNameInput.value = "";
    newAccountNoteInput.value = "";
  } catch (err) {
    accountCreateStatus.textContent = "Error creating account: " + err.message;
  }
});

btnUpdateAccountDetails.addEventListener("click", async () => {
  accountEditStatus.textContent = "";
  if (!currentUser) {
    accountEditStatus.textContent = "Not logged in.";
    return;
  }

  const accId = accountSelect.value || "";
  if (!accId) {
    accountEditStatus.textContent = "Select an account first.";
    return;
  }

  const newName = accountNameEditInput.value.trim();
  const newType = accountTypeEditSelect.value || "";
  const newNote = accountNoteEditInput.value.trim();

  try {
    const accDocRef = doc(db, "users", currentUser.uid, "accounts", accId);
    await setDoc(
      accDocRef,
      {
        name: newName,
        type: newType,
        note: newNote
      },
      { merge: true }
    );
    accountEditStatus.textContent = "Account details updated.";
  } catch (err) {
    accountEditStatus.textContent = "Error updating account: " + err.message;
  }
});

/******************** ACCOUNT SETTINGS (income & saving target) ********************/
settingsAccountSelect.addEventListener("change", () => {
  selectedSettingsAccountId = settingsAccountSelect.value || "";
  fillSettingsInputsFromAccount();
});

function fillSettingsInputsFromAccount() {
  if (!selectedSettingsAccountId) {
    incomeInput.value = "";
    savingTargetInput.value = "";
    return;
  }
  const acc = accounts.find((a) => a.id === selectedSettingsAccountId);
  if (!acc) {
    incomeInput.value = "";
    savingTargetInput.value = "";
    return;
  }
  incomeInput.value =
    acc.income || acc.income === 0 ? acc.income : "";
  savingTargetInput.value =
    acc.savingTargetPercent || acc.savingTargetPercent === 0
      ? acc.savingTargetPercent
      : "";
}

btnSaveSettings.addEventListener("click", async () => {
  settingsStatus.textContent = "";
  if (!currentUser) {
    settingsStatus.textContent = "Not logged in.";
    return;
  }
  if (!selectedSettingsAccountId) {
    settingsStatus.textContent = "Select an account first.";
    return;
  }

  const income = Number(incomeInput.value) || 0;
  const targetPct = Number(savingTargetInput.value) || 0;

  try {
    const accDocRef = doc(db, "users", currentUser.uid, "accounts", selectedSettingsAccountId);
    await setDoc(
      accDocRef,
      {
        income,
        savingTargetPercent: targetPct
      },
      { merge: true }
    );
    settingsStatus.textContent = "Settings saved.";
  } catch (err) {
    settingsStatus.textContent = "Error saving: " + err.message;
  }
});

/******************** TRANSACTIONS (per account via dropdown) ********************/
txAccountSelect.addEventListener("change", () => {
  selectedTxAccountId = txAccountSelect.value || "";
});

function attachTransactionsListenerForAccount(accountId) {
  if (!currentUser || !accountId) return;

  const txColRef = collection(
    db,
    "users",
    currentUser.uid,
    "accounts",
    accountId,
    "transactions"
  );
  const q = query(txColRef, orderBy("date", "desc"));

  txUnsubscribes[accountId] = onSnapshot(q, (snapshot) => {
    transactionsByAccount[accountId] = snapshot.docs.map((docSnap) => ({
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
  if (!selectedTxAccountId) {
    txStatus.textContent = "Select an account first.";
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
    const txColRef = collection(
      db,
      "users",
      currentUser.uid,
      "accounts",
      selectedTxAccountId,
      "transactions"
    );
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

async function deleteTransaction(accountId, txId) {
  if (!currentUser || !accountId || !txId) return;
  const txDocRef = doc(
    db,
    "users",
    currentUser.uid,
    "accounts",
    accountId,
    "transactions",
    txId
  );
  await deleteDoc(txDocRef);
}

/******************** RENDER FUNCTIONS ********************/
function renderAll() {
  fillSettingsInputsFromAccount(); // keep settings inputs synced
  renderSummary();
  renderAccountsSummary();
  renderCategories();
  renderTransactionsTable();
}

function renderSummary() {
  const allTx = getAllTransactionsFlat();

  const totalIncome = accounts.reduce(
    (sum, acc) => sum + (Number(acc.income) || 0),
    0
  );

  const totalSpent = allTx.reduce(
    (sum, t) => sum + (Number(t.amount) || 0),
    0
  );

  const expectedSavingTotal = accounts.reduce((sum, acc) => {
    const income = Number(acc.income) || 0;
    const pct = Number(acc.savingTargetPercent) || 0;
    return sum + income * (pct / 100);
  }, 0);

  const actualSaving = totalIncome - totalSpent;
  const expectedSavingPct = totalIncome > 0 ? (expectedSavingTotal / totalIncome) * 100 : 0;
  const actualSavingPct = totalIncome > 0 ? (actualSaving / totalIncome) * 100 : 0;

  sumIncome.textContent = formatCurrency(totalIncome);
  sumSpent.textContent = formatCurrency(totalSpent);
  sumExpectedSaving.textContent = formatCurrency(expectedSavingTotal);
  sumExpectedSavingPct.textContent = percent(expectedSavingPct);
  sumActualSaving.textContent = formatCurrency(actualSaving);
  sumActualSavingPct.textContent = percent(actualSavingPct);

  if (accounts.length === 0) {
    savingStatus.textContent = "Create a money account first.";
    savingStatus.classList.remove("status-ok", "status-bad");
  } else if (totalIncome <= 0) {
    savingStatus.textContent = "Set income for your accounts.";
    savingStatus.classList.remove("status-ok", "status-bad");
  } else if (actualSaving >= expectedSavingTotal) {
    savingStatus.textContent = "On track ✅";
    savingStatus.classList.add("status-ok");
    savingStatus.classList.remove("status-bad");
  } else {
    savingStatus.textContent = "Below target ❌";
    savingStatus.classList.add("status-bad");
    savingStatus.classList.remove("status-ok");
  }
}

function renderAccountsSummary() {
  accountsSummaryTableBody.innerHTML = "";
  if (accounts.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" class="small-info">No accounts yet.</td>`;
    accountsSummaryTableBody.appendChild(tr);
    return;
  }

  for (const acc of accounts) {
    const txs = transactionsByAccount[acc.id] || [];
    const spent = txs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const income = Number(acc.income) || 0;
    const pct = Number(acc.savingTargetPercent) || 0;
    const expectedSaving = income * (pct / 100);
    const actualSaving = income - spent;

    let statusText = "Set income / target";
    let statusClass = "";
    if (income > 0) {
      if (actualSaving >= expectedSaving) {
        statusText = "On track ✅";
        statusClass = "status-ok";
      } else {
        statusText = "Below target ❌";
        statusClass = "status-bad";
      }
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${acc.name || "(no name)"}</td>
      <td>${acc.type || ""}</td>
      <td class="right">${formatCurrency(income)}</td>
      <td class="right">${formatCurrency(spent)}</td>
      <td class="right">${formatCurrency(expectedSaving)}</td>
      <td class="right">${formatCurrency(actualSaving)}</td>
      <td class="${statusClass}">${statusText}</td>
    `;
    accountsSummaryTableBody.appendChild(tr);
  }
}

function renderCategories() {
  categoryTableBody.innerHTML = "";

  const allTx = getAllTransactionsFlat();
  const totals = {};
  let totalSpent = 0;

  for (const t of allTx) {
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

  const rows = getAllTransactionsFlat();
  const { key, direction } = txSortState;

  rows.sort((a, b) => {
    let av = a[key];
    let bv = b[key];

    if (key === "amount") {
      av = Number(av) || 0;
      bv = Number(bv) || 0;
    } else if (key === "date") {
      // dates are YYYY-MM-DD strings, lexicographic compare works
    } else if (key === "category" || key === "accountName") {
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
      <td>${t.accountName || ""}</td>
      <td>${t.merchant || ""}</td>
      <td class="right">${formatCurrency(t.amount)}</td>
      <td><span class="tag">${t.category || "Uncategorised"}</span></td>
      <td>
        <button class="danger" data-account-id="${t.accountId}" data-tx-id="${t.id}">Delete</button>
      </td>
    `;
    txTableBody.appendChild(tr);
  }

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="small-info">No transactions yet.</td>`;
    txTableBody.appendChild(tr);
  }

  txTableBody.querySelectorAll("button.danger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const accountId = btn.getAttribute("data-account-id");
      const txId = btn.getAttribute("data-tx-id");
      if (confirm("Delete this transaction?")) {
        deleteTransaction(accountId, txId);
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
