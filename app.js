/* =====================================================================
   CRT Ledger - app.js
   Isang JS file para sa lahat ng pages.

   Paano gumagana:
   1. Transaction page  -> sine-save ang transaction sa localStorage
   2. General Journal   -> ginagawang journal entry (debit/credit) ang bawat transaction
   3. Trial Balance     -> sinusum ang lahat ng debit at credit ng bawat account
   4. Financial Stmts   -> galing sa trial balance ang Income Statement at Balance Sheet
   5. Dashboard         -> summary lang (cash, revenue, expenses, net income)
   ===================================================================== */


/* ================= 1. DATA (mga listahan) ================= */

// Pangalan ng lalagyan ng data sa localStorage ng browser
const STORAGE_KEY = "crt_transactions";

// Lahat ng accounts. "type" ang ginagamit sa trial balance at financial statements
const ACCOUNTS = [
  { name: "Cash", type: "asset" },
  { name: "Accounts Receivable", type: "asset" },
  { name: "Supplies", type: "asset" },
  { name: "Equipment", type: "asset" },
  { name: "Accounts Payable", type: "liability" },
  { name: "Capital", type: "equity" },
  { name: "Drawing", type: "drawing" },
  { name: "Service Revenue", type: "revenue" },
  { name: "Rent Expense", type: "expense" },
  { name: "Electricity Expense", type: "expense" }
];

// Mga transaction type.
// direction "in"  = may pumapasok (kita / puhunan) -> DEBIT cash o A/R, CREDIT yung account
// direction "out" = may lumalabas (gastos / bili)  -> DEBIT yung account, CREDIT cash o A/P
// cashOnly = true kapag cash lang pwede (puhunan at drawing)
const TYPES = [
  { name: "Service Revenue", account: "Service Revenue", direction: "in", cashOnly: false },
  { name: "Owner Investment", account: "Capital", direction: "in", cashOnly: true },
  { name: "Buy Equipment", account: "Equipment", direction: "out", cashOnly: false },
  { name: "Buy Supplies", account: "Supplies", direction: "out", cashOnly: false },
  { name: "Rent Expense", account: "Rent Expense", direction: "out", cashOnly: false },
  { name: "Electricity Expense", account: "Electricity Expense", direction: "out", cashOnly: false },
  { name: "Owner Withdrawal", account: "Drawing", direction: "out", cashOnly: true }
];

// Mga payment method
const METHODS = ["Cash", "On Account", "Partial Payment"];


/* ================= 2. MALILIIT NA HELPER ================= */

// Hanapin yung transaction type base sa pangalan
function findType(name) {
  for (const t of TYPES) {
    if (t.name === name) {
      return t;
    }
  }
  return TYPES[0];
}

// Hanapin yung account base sa pangalan
function findAccount(name) {
  for (const a of ACCOUNTS) {
    if (a.name === name) {
      return a;
    }
  }
  return ACCOUNTS[0];
}

// Gawing text ang number: 48000 -> "48,000", 1250.5 -> "1,250.50"
function numberText(n) {
  const value = Math.abs(n);
  // kapag buo ang number walang decimals, kapag may sentimo 2 decimals
  let decimals = 2;
  if (Number.isInteger(value)) {
    decimals = 0;
  }
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Para sa debit/credit columns: kapag 0 ay "-" ang ilalabas
function formatNumber(n) {
  if (n === 0) {
    return "-";
  }
  return numberText(n);
}

// May peso sign: 48000 -> "₱48,000", -500 -> "-₱500"
function formatMoney(n) {
  if (n < 0) {
    return "-₱" + numberText(n);
  }
  return "₱" + numberText(n);
}

// Pag-round sa 2 decimals para walang kakaibang decimal (halimbawa 0.1 + 0.2)
function round2(n) {
  return Math.round(n * 100) / 100;
}

// "2026-10-31" -> "Oct 31, 2026"
function formatDate(dateString) {
  const d = new Date(dateString + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Petsa ngayon sa format na "2026-10-31" (para sa date input)
function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + month + "-" + day;
}

// Para hindi masira ang table kapag may "<" o ">" sa description
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Ipakita ang petsa ngayon sa navbar
function setCurrentDate() {
  const el = document.getElementById("currentDate");
  if (el) {
    const options = { month: "long", day: "numeric", year: "numeric" };
    el.textContent = new Date().toLocaleDateString("en-US", options);
  }
}


/* ================= 3. LOCALSTORAGE ================= */

// Kunin lahat ng na-save na transactions (array). Kung wala pa, empty array
function getTransactions() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) {
    return [];
  }
  try {
    return JSON.parse(saved);
  } catch (error) {
    return [];
  }
}

// I-save ang array ng transactions
function saveTransactions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// Kopya ng transactions na nakaayos ayon sa petsa (pinakaluma muna)
// Kapag pareho ang petsa, nananatili ang pagkakasunod ng pag-input
function sortedTransactions() {
  const list = getTransactions().slice();
  list.sort(function (a, b) {
    if (a.date < b.date) {
      return -1;
    }
    if (a.date > b.date) {
      return 1;
    }
    return 0;
  });
  return list;
}


/* ================= 4. JOURNAL ENTRY ================= */

// Gumawa ng isang linya ng journal
function makeLine(tx, account, debit, credit) {
  return { date: tx.date, account: account, debit: debit, credit: credit, description: tx.description };
}

// Gawing journal entry (array ng mga linya) ang isang transaction
function makeJournal(tx) {
  const type = findType(tx.type);
  const lines = [];

  // Kapag cashOnly ang type (puhunan/drawing), cash lagi ang method
  let method = tx.method;
  if (type.cashOnly) {
    method = "Cash";
  }

  // Hatiin ang amount: magkano ang cash at magkano ang on account (utang)
  let cashPart = 0;
  let accountPart = 0;
  if (method === "Cash") {
    cashPart = tx.amount;                 // buo ang bayad
  } else if (method === "On Account") {
    accountPart = tx.amount;              // walang bayad, utang lahat
  } else {
    cashPart = tx.paid;                   // Partial: yung binayad ay cash
    accountPart = tx.amount - tx.paid;    // yung natira ay utang
  }

  if (type.direction === "in") {
    // May pumasok: DEBIT cash o Accounts Receivable, CREDIT yung account (revenue / capital)
    if (cashPart > 0) {
      lines.push(makeLine(tx, "Cash", cashPart, 0));
    }
    if (accountPart > 0) {
      lines.push(makeLine(tx, "Accounts Receivable", accountPart, 0));
    }
    lines.push(makeLine(tx, type.account, 0, tx.amount));
  } else {
    // May lumabas: DEBIT yung account (expense / asset / drawing), CREDIT cash o Accounts Payable
    lines.push(makeLine(tx, type.account, tx.amount, 0));
    if (cashPart > 0) {
      lines.push(makeLine(tx, "Cash", 0, cashPart));
    }
    if (accountPart > 0) {
      lines.push(makeLine(tx, "Accounts Payable", 0, accountPart));
    }
  }

  return lines;
}

// Journal entries ng lahat ng transactions (array ng mga entry, bawat entry ay array ng linya)
function getJournalEntries() {
  const entries = [];
  const list = sortedTransactions();
  for (const tx of list) {
    entries.push(makeJournal(tx));
  }
  return entries;
}


/* ================= 5. TRIAL BALANCE ================= */

// Kuwentahin ang balance ng bawat account na may galaw
// Bawat item: { name, type, debit, credit, balance }
//   debit / credit = kung saang column ito ilalagay sa trial balance
//   balance        = halaga ayon sa normal balance ng account (para sa financial statements)
function computeBalances() {
  const entries = getJournalEntries();
  const result = [];

  for (const account of ACCOUNTS) {
    let totalDebit = 0;
    let totalCredit = 0;
    let hasActivity = false;

    // Sum ng lahat ng debit at credit ng account na ito sa buong journal
    for (const entry of entries) {
      for (const line of entry) {
        if (line.account === account.name) {
          totalDebit += line.debit;
          totalCredit += line.credit;
          hasActivity = true;
        }
      }
    }

    // Skip ang account kung walang galaw
    if (hasActivity === false) {
      continue;
    }

    // Net = debit - credit. Kapag positive -> Debit column, kapag negative -> Credit column
    const net = round2(totalDebit - totalCredit);
    let debit = 0;
    let credit = 0;
    if (net > 0) {
      debit = net;
    } else if (net < 0) {
      credit = -net;
    }

    // Normal balance: asset, drawing, expense = debit; liability, equity, revenue = credit
    let balance = 0;
    if (account.type === "asset" || account.type === "drawing" || account.type === "expense") {
      balance = net;
    } else {
      balance = -net;
    }

    result.push({ name: account.name, type: account.type, debit: debit, credit: credit, balance: balance });
  }

  return result;
}


/* ================= 6. TRANSACTION PAGE ================= */

function showTransactionPage() {
  const dateInput = document.getElementById("date");
  const typeSelect = document.getElementById("type");
  const methodSelect = document.getElementById("method");
  const amountInput = document.getElementById("amount");
  const paidInput = document.getElementById("paid");
  const paidGroup = document.getElementById("paidGroup");
  const descInput = document.getElementById("description");
  const message = document.getElementById("message");
  const previewBody = document.getElementById("previewBody");
  const form = document.getElementById("txForm");
  const clearBtn = document.getElementById("clearBtn");

  // Default na petsa ay ngayon
  dateInput.value = todayString();

  // Ilagay sa dropdowns ang mga choices galing sa arrays
  for (const t of TYPES) {
    typeSelect.add(new Option(t.name, t.name));
  }
  for (const m of METHODS) {
    methodSelect.add(new Option(m, m));
  }

  // Kunin ang laman ng form bilang isang transaction object
  function readForm() {
    return {
      date: dateInput.value,
      type: typeSelect.value,
      method: methodSelect.value,
      amount: Number(amountInput.value),   // kapag walang laman = 0
      paid: Number(paidInput.value),
      description: descInput.value.trim()
    };
  }

  // I-check kung tama ang laman. Ibabalik ang error message, o "" kung okay
  function checkTransaction(tx) {
    if (tx.date === "") {
      return "Please choose a date.";
    }
    if (tx.amount <= 0) {
      return "Amount must be greater than 0.";
    }
    if (tx.method === "Partial Payment" && findType(tx.type).cashOnly === false) {
      // Sa partial, dapat mas malaki sa 0 at mas maliit sa total ang binayad
      if (tx.paid <= 0 || tx.paid >= tx.amount) {
        return "Amount paid now must be more than 0 and less than the total amount.";
      }
    }
    return "";
  }

  // I-update ang journal preview sa kanan habang nagta-type
  function updatePreview() {
    const tx = readForm();
    if (checkTransaction(tx) !== "") {
      previewBody.innerHTML = '<tr><td colspan="3" class="empty">Enter an amount to see the journal entry.</td></tr>';
      return;
    }

    let html = "";
    const lines = makeJournal(tx);
    for (const line of lines) {
      // Naka-indent ang account kapag credit (standard sa journal)
      let cssClass = "";
      if (line.credit > 0) {
        cssClass = "indent";
      }
      html += "<tr>";
      html += '<td class="' + cssClass + '">' + line.account + "</td>";
      html += '<td class="num">' + formatNumber(line.debit) + "</td>";
      html += '<td class="num">' + formatNumber(line.credit) + "</td>";
      html += "</tr>";
    }
    previewBody.innerHTML = html;
  }

  // Ayusin ang form depende sa napiling type at method
  function updateForm() {
    const type = findType(typeSelect.value);

    // Cash lang ang puhunan at drawing, kaya naka-lock ang payment method
    if (type.cashOnly) {
      methodSelect.value = "Cash";
      methodSelect.disabled = true;
    } else {
      methodSelect.disabled = false;
    }

    // Lalabas lang ang "Amount paid now" kapag Partial Payment
    if (methodSelect.value === "Partial Payment") {
      paidGroup.style.display = "block";
    } else {
      paidGroup.style.display = "none";
    }

    updatePreview();
  }

  typeSelect.addEventListener("change", updateForm);
  methodSelect.addEventListener("change", updateForm);
  amountInput.addEventListener("input", updatePreview);
  paidInput.addEventListener("input", updatePreview);

  // Kapag pinindot ang Add Transaction
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const tx = readForm();
    const error = checkTransaction(tx);
    if (error !== "") {
      message.className = "message error";
      message.textContent = error;
      return;
    }

    // Kapag walang description, gamitin ang pangalan ng type
    if (tx.description === "") {
      tx.description = tx.type;
    }

    // Idagdag sa listahan at i-save
    const list = getTransactions();
    list.push(tx);
    saveTransactions(list);

    message.className = "message success";
    message.innerHTML = 'Transaction added. <a href="journal.html">View General Journal</a>';

    // Linisin ang mga input
    amountInput.value = "";
    paidInput.value = "";
    descInput.value = "";
    updatePreview();
  });

  // Burahin lahat ng data
  clearBtn.addEventListener("click", function () {
    if (confirm("Delete all transactions? This cannot be undone.")) {
      localStorage.removeItem(STORAGE_KEY);
      message.className = "message success";
      message.textContent = "All transactions deleted.";
    }
  });

  updateForm();
}


/* ================= 7. GENERAL JOURNAL PAGE ================= */

function showJournalPage() {
  const body = document.getElementById("journalBody");
  const totalDebitCell = document.getElementById("totalDebit");
  const totalCreditCell = document.getElementById("totalCredit");

  const entries = getJournalEntries();
  let html = "";
  let totalDebit = 0;
  let totalCredit = 0;

  // Kapag wala pang transaction
  if (entries.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty">No journal entries yet. Add a transaction first.</td></tr>';
    totalDebitCell.textContent = "-";
    totalCreditCell.textContent = "-";
    return;
  }

  // Isa-isahin ang bawat entry, tapos bawat linya sa loob ng entry
  for (const entry of entries) {
    for (let i = 0; i < entry.length; i++) {
      const line = entry[i];

      // Ang unang linya ng entry ay may linya sa taas at nakalagay ang petsa at description
      let rowClass = "";
      let dateText = "";
      let descText = "";
      if (i === 0) {
        rowClass = "entry-start";
        dateText = formatDate(line.date);
        descText = escapeHtml(line.description);
      }

      // Naka-indent ang account kapag credit
      let accountClass = "";
      if (line.credit > 0) {
        accountClass = "indent";
      }

      html += '<tr class="' + rowClass + '">';
      html += "<td>" + dateText + "</td>";
      html += '<td class="' + accountClass + '">' + line.account + "</td>";
      html += '<td class="num">' + formatNumber(line.debit) + "</td>";
      html += '<td class="num">' + formatNumber(line.credit) + "</td>";
      html += '<td class="desc">' + descText + "</td>";
      html += "</tr>";

      // Dagdag sa total
      totalDebit += line.debit;
      totalCredit += line.credit;
    }
  }

  body.innerHTML = html;
  totalDebitCell.textContent = numberText(round2(totalDebit));
  totalCreditCell.textContent = numberText(round2(totalCredit));
}


/* ================= 8. TRIAL BALANCE PAGE ================= */

function showTrialBalancePage() {
  const body = document.getElementById("tbBody");
  const totalDebitCell = document.getElementById("totalDebit");
  const totalCreditCell = document.getElementById("totalCredit");
  const status = document.getElementById("tbStatus");

  const balances = computeBalances();

  // Kapag wala pang transaction
  if (balances.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="empty">No accounts yet. Add a transaction first.</td></tr>';
    totalDebitCell.textContent = "-";
    totalCreditCell.textContent = "-";
    status.textContent = "";
    return;
  }

  let html = "";
  let totalDebit = 0;
  let totalCredit = 0;

  // Isang row bawat account, sabay sum ng Debit at Credit column
  for (const b of balances) {
    html += "<tr>";
    html += "<td>" + b.name + "</td>";
    html += '<td class="num">' + formatNumber(b.debit) + "</td>";
    html += '<td class="num">' + formatNumber(b.credit) + "</td>";
    html += "</tr>";

    totalDebit += b.debit;
    totalCredit += b.credit;
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);

  body.innerHTML = html;
  totalDebitCell.textContent = numberText(totalDebit);
  totalCreditCell.textContent = numberText(totalCredit);

  // Dapat pantay ang total debit at total credit
  if (totalDebit === totalCredit) {
    status.textContent = "Balanced: total debit equals total credit.";
  } else {
    status.textContent = "Not balanced: total debit and total credit are different.";
  }
}


/* ================= 9. FINANCIAL STATEMENTS PAGE ================= */

// Isang row ng statement (label sa kaliwa, halaga sa kanan)
function statementRow(label, amount, cssClass) {
  return '<tr class="' + cssClass + '"><td>' + label + '</td><td class="num">' + formatMoney(amount) + "</td></tr>";
}

// Row ng heading ng section (Assets, Liabilities, atbp.)
function sectionRow(label) {
  return '<tr class="section-row"><td colspan="2">' + label + "</td></tr>";
}

function showFinancialStatementsPage() {
  const balances = computeBalances();

  // Mga lalagyan ng rows at totals
  let revenueRows = "";
  let expenseRows = "";
  let assetRows = "";
  let liabilityRows = "";
  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let capital = 0;
  let drawing = 0;

  // Ihiwalay ang bawat account ayon sa type nito
  for (const b of balances) {
    if (b.type === "revenue") {
      revenueRows += statementRow(b.name, b.balance, "");
      totalRevenue += b.balance;
    } else if (b.type === "expense") {
      expenseRows += statementRow(b.name, b.balance, "");
      totalExpenses += b.balance;
    } else if (b.type === "asset") {
      assetRows += statementRow(b.name, b.balance, "");
      totalAssets += b.balance;
    } else if (b.type === "liability") {
      liabilityRows += statementRow(b.name, b.balance, "");
      totalLiabilities += b.balance;
    } else if (b.type === "equity") {
      capital = b.balance;
    } else if (b.type === "drawing") {
      drawing = b.balance;
    }
  }

  // Net Income = Total Revenue - Total Expenses
  const netIncome = round2(totalRevenue - totalExpenses);

  // Owner's Equity = Capital + Net Income - Drawing
  const totalEquity = round2(capital + netIncome - drawing);

  // Total Liabilities and Owner's Equity (dapat kapareho ng Total Assets)
  const totalLiabilitiesEquity = round2(totalLiabilities + totalEquity);

  // Kung negative ang net income, "Net Loss" ang tawag
  let netLabel = "Net Income";
  let equityNetLabel = "Add: Net Income";
  if (netIncome < 0) {
    netLabel = "Net Loss";
    equityNetLabel = "Less: Net Loss";
  }

  // ----- Income Statement -----
  let incomeHtml = "";
  incomeHtml += sectionRow("Revenue");
  incomeHtml += revenueRows;
  incomeHtml += statementRow("Total Revenue", round2(totalRevenue), "total-row");
  incomeHtml += sectionRow("Expenses");
  incomeHtml += expenseRows;
  incomeHtml += statementRow("Total Expenses", round2(totalExpenses), "total-row");
  incomeHtml += statementRow(netLabel, netIncome, "grand");

  // ----- Balance Sheet -----
  let balanceHtml = "";
  balanceHtml += sectionRow("Assets");
  balanceHtml += assetRows;
  balanceHtml += statementRow("Total Assets", round2(totalAssets), "grand");
  balanceHtml += sectionRow("Liabilities");
  balanceHtml += liabilityRows;
  balanceHtml += statementRow("Total Liabilities", round2(totalLiabilities), "total-row");
  balanceHtml += sectionRow("Owner's Equity");
  balanceHtml += statementRow("Capital", capital, "");
  balanceHtml += statementRow(equityNetLabel, Math.abs(netIncome), "");
  balanceHtml += statementRow("Less: Drawing", drawing, "");
  balanceHtml += statementRow("Total Owner's Equity", totalEquity, "total-row");
  balanceHtml += statementRow("Total Liabilities and Owner's Equity", totalLiabilitiesEquity, "grand");

  document.getElementById("incomeBody").innerHTML = incomeHtml;
  document.getElementById("balanceBody").innerHTML = balanceHtml;

  // Petsa sa ilalim ng title: petsa ng pinakahuling transaction, o ngayon kung wala pa
  let dateText = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const list = sortedTransactions();
  if (list.length > 0) {
    const lastDate = new Date(list[list.length - 1].date + "T00:00:00");
    dateText = lastDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  document.getElementById("incomeDate").textContent = "For the period ended " + dateText;
  document.getElementById("balanceDate").textContent = "As of " + dateText;
}


/* ================= 10. DASHBOARD PAGE ================= */

// Kulay at pangalan ng badge ayon sa type ng account
function badgeFor(accountType) {
  if (accountType === "revenue") {
    return '<span class="badge b-revenue">Revenue</span>';
  } else if (accountType === "expense") {
    return '<span class="badge b-expense">Expense</span>';
  } else if (accountType === "asset") {
    return '<span class="badge b-asset">Asset</span>';
  } else if (accountType === "equity") {
    return '<span class="badge b-equity">Equity</span>';
  }
  return '<span class="badge b-drawing">Drawing</span>';
}

function showDashboard() {
  const balances = computeBalances();

  // Cash = balance ng Cash account
  // Total Revenue = sum ng revenue accounts, Total Expenses = sum ng expense accounts
  let cash = 0;
  let revenue = 0;
  let expenses = 0;
  for (const b of balances) {
    if (b.name === "Cash") {
      cash = b.balance;
    } else if (b.type === "revenue") {
      revenue += b.balance;
    } else if (b.type === "expense") {
      expenses += b.balance;
    }
  }

  // Net Income = Total Revenue - Total Expenses
  const netIncome = round2(revenue - expenses);

  document.getElementById("cardCash").textContent = formatMoney(cash);
  document.getElementById("cardRevenue").textContent = formatMoney(round2(revenue));
  document.getElementById("cardExpenses").textContent = formatMoney(round2(expenses));
  document.getElementById("cardIncome").textContent = formatMoney(netIncome);

  // Recent transactions: pinakabago ang nasa taas (baligtarin ang sorted list)
  const body = document.getElementById("recentBody");
  const list = sortedTransactions().reverse();

  if (list.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty">No transactions yet. Add one in the Transaction page.</td></tr>';
    return;
  }

  let html = "";
  for (const tx of list) {
    const accountType = findAccount(findType(tx.type).account).type;
    html += "<tr>";
    html += "<td>" + formatDate(tx.date) + "</td>";
    html += '<td class="desc">' + escapeHtml(tx.description) + "</td>";
    html += "<td>" + badgeFor(accountType) + "</td>";
    html += '<td class="num">' + formatMoney(tx.amount) + "</td>";
    html += "</tr>";
  }
  body.innerHTML = html;
}


/* ================= SIMULA ================= */
// Lahat ng page ay nagpapakita ng petsa sa navbar
setCurrentDate();
