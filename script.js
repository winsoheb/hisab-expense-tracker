const SYNC_SERVER = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' || 
                   window.location.hostname === '' || 
                   window.location.protocol === 'file:'
    ? 'http://localhost:5000' 
    : 'https://hisab-soheb-in.onrender.com';

// DatabaseManager: Redirects calls to Backend API (MongoDB) with IndexedDB as a local buffer
const DatabaseManager = {
    db: null,
    dbName: 'HisabDB',
    version: 1,

    init: async function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('transactions')) {
                    db.createObjectStore('transactions', { keyPath: 'docId' });
                }
                if (!db.objectStoreNames.contains('emis')) {
                    db.createObjectStore('emis', { keyPath: 'docId' });
                }
            };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            request.onerror = (event) => reject(event.target.error);
        });
    },

    // API Core
    apiFetch: async function(endpoint, options = {}) {
        let loadingTimer = setTimeout(() => {
            const toast = document.createElement('div');
            toast.id = 'render-warming-toast';
            toast.style = 'position:fixed; bottom:20px; right:20px; background:#6366f1; color:white; padding:12px 20px; border-radius:8px; z-index:10000; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-family:sans-serif; transition: all 0.3s ease;';
            toast.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Warming up backend server... Please wait (Render Free Tier)';
            document.body.appendChild(toast);
        }, 1500); // Show after 1.5s delay

        try {
            const response = await fetch(`${SYNC_SERVER}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            clearTimeout(loadingTimer);
            const toast = document.getElementById('render-warming-toast');
            if(toast) toast.remove();

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'API Error');
            return data;
        } catch (err) {
            clearTimeout(loadingTimer);
            const toast = document.getElementById('render-warming-toast');
            if(toast) toast.remove();

            console.error("Fetch Error:", err);
            const fullUrl = `${SYNC_SERVER}${endpoint}`;
            if (err.message === 'Failed to fetch') {
                alert(`Connection Error: Could not reach the server at ${fullUrl}.\n\nNote: If the server hasn't been used recently, it may take 50+ seconds to "wake up" (Render Free Tier).`);
            } else {
                alert("Error: " + err.message + ` (URL: ${fullUrl})`);
            }
            throw err;
        }
    },

    // Auth
    getUsers: async function() {
        return this.apiFetch('/api/auth/users');
    },
    
    addUser: async function(userObj) {
        return this.apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(userObj)
        });
    },

    deleteUser: async function(id) {
        return this.apiFetch(`/api/auth/users/${id}`, { method: 'DELETE' });
    },

    authenticate: async function(email, password) {
        return this.apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    },

    // Transactions
    getTransactions: async function(userId = null) {
        const url = userId ? `/api/transactions/${userId}` : '/api/transactions';
        return this.apiFetch(url);
    },

    addTransaction: async function(transaction) {
        if(!transaction.docId) transaction.docId = 'tx_' + Math.random().toString(36).substr(2, 9);
        return this.apiFetch('/api/transactions', {
            method: 'POST',
            body: JSON.stringify(transaction)
        });
    },

    deleteTransaction: async function(docId) {
        return this.apiFetch(`/api/transactions/${docId}`, { method: 'DELETE' });
    },

    // EMIs
    getEMIs: async function(userId = null) {
        const url = userId ? `/api/emis/${userId}` : '/api/emis';
        return this.apiFetch(url);
    },

    addEMI: async function(emi) {
        if(!emi.docId) emi.docId = 'emi_' + Math.random().toString(36).substr(2, 9);
        return this.apiFetch('/api/emis', {
            method: 'POST',
            body: JSON.stringify(emi)
        });
    },

    editEMI: async function(docId, updatedData) {
        return this.apiFetch(`/api/emis/${docId}`, {
            method: 'PATCH',
            body: JSON.stringify(updatedData)
        });
    },

    deleteEMI: async function(docId) {
        return this.apiFetch(`/api/emis/${docId}`, { method: 'DELETE' });
    },

    updateTransactionType: async function(docId, newType) {
        return this.apiFetch(`/api/transactions/${docId}`, {
            method: 'PATCH',
            body: JSON.stringify({ type: newType })
        });
    },

    // Generic DB Core (Local Fallback for Sync)
    getAllLocal: async function(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    deleteLocal: async function(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    syncToCloud: async function(userId) {
        console.log("Starting Cloud Sync...");
        const localTxs = await this.getAllLocal('transactions');
        const localEmis = await this.getAllLocal('emis');

        for (const tx of localTxs) {
            if (tx.userId === userId || !userId) {
                await this.addTransaction(tx);
                await this.deleteLocal('transactions', tx.docId);
            }
        }
        for (const emi of localEmis) {
            if (emi.userId === userId || !userId) {
                await this.addEMI(emi);
                await this.deleteLocal('emis', emi.docId);
            }
        }
        console.log("Cloud Sync Complete.");
    }
};

// Initialize DB before anything else
DatabaseManager.init();

// App State
let currentUser = null;
let currentTransactions = [];
let currentEMIs = [];
let chartInstance = null;

// DOM Elements: Auth & Layout
const loginOverlay = document.getElementById('login-overlay');
const appDashboard = document.getElementById('app-dashboard');
const adminDashboard = document.getElementById('admin-dashboard');

const overviewView = document.getElementById('overview-view');
const transactionsView = document.getElementById('transactions-view');
const reportsView = document.getElementById('reports-view');
const emisView = document.getElementById('emis-view');

const navOverview = document.getElementById('nav-overview');
const navTransactions = document.getElementById('nav-transactions');
const navReports = document.getElementById('nav-reports');
const navEmis = document.getElementById('nav-emis');
const navDatabase = document.getElementById('nav-database');

const databaseView = document.getElementById('database-view');

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');

const logoutBtn = document.getElementById('logout-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const userNameEl = document.getElementById('user-name');

// DOM Elements: Overview Dash
const overviewIncomeEl = document.getElementById('overview-income');
const overviewExpenseEl = document.getElementById('overview-expense');
const overviewEmiEl = document.getElementById('overview-emi-deductions');
const overviewBorrowedEl = document.getElementById('overview-borrowed');

// Theme Toggle
const themeToggleBtn = document.getElementById('theme-toggle');
const adminThemeToggleBtn = document.getElementById('admin-theme-toggle');
const mobileThemeBtn = document.getElementById('mobile-theme-btn');

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        if(themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        if(adminThemeToggleBtn) adminThemeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        if(mobileThemeBtn) mobileThemeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-theme');
        if(themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        if(adminThemeToggleBtn) adminThemeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        if(mobileThemeBtn) mobileThemeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
    
    // Re-render charts to update their typography colors
    if(Chart.instances && Object.keys(Chart.instances).length > 0) {
        Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--chart-text-color').trim();
        for(let id in Chart.instances) {
            Chart.instances[id].update();
        }
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    localStorage.setItem('hisab_theme', newTheme);
    applyTheme(newTheme);
}

themeToggleBtn?.addEventListener('click', toggleTheme);
adminThemeToggleBtn?.addEventListener('click', toggleTheme);
const mobileThemeBtnLocal = document.getElementById('mobile-theme-btn');
mobileThemeBtnLocal?.addEventListener('click', toggleTheme);

// Initialize Theme
const savedTheme = localStorage.getItem('hisab_theme') || 'dark';
applyTheme(savedTheme);

// Quick Actions
document.getElementById('qa-add-income')?.addEventListener('click', () => switchTab('transactions', 'income'));
document.getElementById('qa-add-expense')?.addEventListener('click', () => switchTab('transactions', 'expense'));
document.getElementById('qa-view-reports')?.addEventListener('click', () => switchTab('reports'));
document.getElementById('qa-manage-emis')?.addEventListener('click', () => switchTab('emis'));

// DOM Elements: Standard User Dashboard
const balanceEl = document.getElementById('total-balance');
const listEl = document.getElementById('transaction-list');
const formEl = document.getElementById('transaction-form');
const ctx = document.getElementById('expenseChart') ? document.getElementById('expenseChart').getContext('2d') : null;

// DOM Elements: EMIs
const emiForm = document.getElementById('emi-form');
const emiListEl = document.getElementById('emi-list');
let emiChartInstances = {}; // Store individual chart instances by docId

// DOM Elements: Reports View
const dateRangeSelect = document.getElementById('date-range');
const customDateInputs = document.getElementById('custom-date-inputs');
const filterTypeSelect = document.getElementById('filter-type');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const reportListEl = document.getElementById('report-transaction-list');
const reportCtx = document.getElementById('reportChart') ? document.getElementById('reportChart').getContext('2d') : null;
let reportChartInstance = null;

// ----------------------------------------------------
// AUTHENTICATION LOGIC
// ----------------------------------------------------

// Tab switching
tabLogin?.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    authError.style.display = 'none';
});

tabRegister?.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
    authError.style.display = 'none';
});

function showError(msg) {
    authError.innerText = msg;
    authError.style.display = 'block';
}

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    try {
        const user = await DatabaseManager.authenticate(email, pass);
        await loginUser(user);
    } catch (err) {
        showError(err.message);
    }
});

registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;

    try {
        const newUser = await DatabaseManager.addUser({ name, email, password: pass });
        await loginUser(newUser);
    } catch (err) {
        showError(err.message);
    }
});

function logout() {
    currentUser = null;
    currentTransactions = [];
    currentEMIs = [];
    loginOverlay.style.display = 'flex';
    appDashboard.style.display = 'none';
    overviewView.style.display = 'none';
    transactionsView.style.display = 'none';
    adminDashboard.style.display = 'none';
    reportsView.style.display = 'none';
    emisView.style.display = 'none';
    
    document.getElementById('login-password').value = '';
    document.getElementById('reg-password').value = '';
    
    // Clear Session permanently
    localStorage.removeItem('loggedInUser');
}

logoutBtn?.addEventListener('click', logout);
adminLogoutBtn?.addEventListener('click', logout);

async function loginUser(user) {
    currentUser = user;
    localStorage.setItem('loggedInUser', JSON.stringify(user));

    loginOverlay.style.display = 'none';
    
    if (user.role === 'admin') {
        await renderAdminDashboard();
    } else {
        await renderUserDashboard();
    }

    // Check for unsynced local data
    const localTxs = await DatabaseManager.getAllLocal('transactions');
    const localEmis = await DatabaseManager.getAllLocal('emis');
    if (localTxs.length > 0 || localEmis.length > 0) {
        if (confirm(`You have ${localTxs.length + localEmis.length} local records that are not synced to the cloud. Would you like to sync them now?`)) {
            await switchTab('database');
            document.getElementById('btn-sync-cloud')?.click();
        }
    }
}

// Check session & App Entry Point
(async () => {
    await DatabaseManager.init();
    const storedSession = localStorage.getItem('loggedInUser');
    if (storedSession) {
        await loginUser(JSON.parse(storedSession));
    } else {
        // Show login by default
        currentUser = null;
        loginOverlay.style.display = 'flex';
    }
})();

// Google Identity Services Callback
window.handleCredentialResponse = async (response) => {
    try {
        // Decode JWT token (standard Base64Url decoding)
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        
        const googleUser = JSON.parse(jsonPayload);
        
        // Structure the user profile for Hisab
        const userProfile = {
            id: googleUser.sub, // Unique Google ID
            name: googleUser.name,
            email: googleUser.email,
            role: 'user', // Default role for standard users
            picture: googleUser.picture
        };

        // Try to add or get the user from our DB
        let localUser;
        try {
            // Check if user exists, if not, create them (password won't matter for OAuth)
            localUser = await DatabaseManager.addUser({ 
                 name: userProfile.name, 
                 email: userProfile.email, 
                 password: 'oauth_dummy_password', // Just a placeholder for local schema
                 id: userProfile.id,
                 role: userProfile.role
            });
        } catch (err) {
            // User likely already exists, we can still log them in based on email match
            const allUsers = await DatabaseManager.getUsers();
            localUser = allUsers.find(u => u.email === userProfile.email);
        }

        if (localUser) {
            await loginUser(localUser);
        } else {
            showError("Failed to synchronize Google Login with local database.");
        }

    } catch (error) {
        console.error("Google Login Error:", error);
        showError("Google Authentication failed. Please try again.");
    }
};


// ----------------------------------------------------
// ADMIN DASHBOARD LOGIC
// ----------------------------------------------------
async function renderAdminDashboard() {
    adminDashboard.style.display = 'flex';
    appDashboard.style.display = 'none';

    // 1. Render Users Table
    const users = await DatabaseManager.getUsers();
    const tbody = document.querySelector('#admin-users-table tbody');
    tbody.innerHTML = '';
    
    users.forEach(u => {
        const tr = document.createElement('tr');
        const badge = u.role === 'admin' ? '<span class="badge-admin">Admin</span>' : '<span class="badge-user">User</span>';
        const deleteBtn = (u.role !== 'admin') ? `<button class="delete-btn" onclick="deleteExplorerItem('users', '${u._id || u.id}')"><i class="fa-solid fa-trash"></i></button>` : '-';
        tr.innerHTML = `
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${badge}</td>
            <td>${deleteBtn}</td>
        `;
        tbody.appendChild(tr);
    });

    // 2. Render Global Transactions
    const allTx = await DatabaseManager.getTransactions();
    // Sort descending by date
    allTx.sort((a,b) => new Date(b.date) - new Date(a.date));
    
    const adminTxList = document.getElementById('admin-tx-list');
    adminTxList.innerHTML = '';
    let totalVolume = 0;

    if (allTx.length === 0) {
        adminTxList.innerHTML = '<div class="empty-state">No transactions system-wide.</div>';
    } else {
        allTx.forEach(tx => {
            totalVolume += tx.amount;
            
            // Look up author name
            const author = users.find(u => u.id === tx.userId);
            const authorName = author ? author.name : 'Unknown User';

            const item = document.createElement('div');
            item.classList.add('transaction-item');
            item.classList.add(`${tx.type}-edge`);

            const sign = tx.type === 'expense' ? '-' : '+';
            const dateStr = new Date(tx.date).toLocaleDateString();

            item.innerHTML = `
                <div class="item-info">
                    <span class="item-name">${tx.name} <small style="color:var(--text-muted); font-size: 0.8em">by ${authorName} <b style="text-transform:uppercase">[${tx.mode || 'N/A'}]</b></small></span>
                    <span class="item-date">${dateStr}</span>
                </div>
                <div class="item-right">
                    <span class="item-amount ${tx.type}">${sign}${formatMoney(tx.amount)}</span>
                </div>
            `;
            adminTxList.appendChild(item);
        });
    }

    document.getElementById('admin-total-volume').innerText = formatMoney(totalVolume);
}


// ----------------------------------------------------
// NORMAL USER DASHBOARD LOGIC
// ----------------------------------------------------

function formatMoney(amount) {
    return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function renderUserDashboard() {
    appDashboard.style.display = 'flex';
    overviewView.style.display = 'block';
    adminDashboard.style.display = 'none';
    userNameEl.innerText = `Hi, ${currentUser.name.split(' ')[0]}`;

    // Get strictly this user's data
    currentTransactions = await DatabaseManager.getTransactions((currentUser._id || currentUser.id));
    currentEMIs = await DatabaseManager.getEMIs((currentUser._id || currentUser.id));
    
    // Sort oldest to newest for visual append
    currentTransactions.sort((a,b) => new Date(a.date) - new Date(b.date));
    
    listEl.innerHTML = '';
    if (currentTransactions.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No transactions yet. Add one to get started!</div>';
    } else {
        currentTransactions.forEach(addTransactionDOM);
    }
    
    renderEMIsList();
    
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('emi-date').valueAsDate = new Date();
    updateValues();
}

async function handleAddTransaction(e) {
    e.preventDefault();
    if (!currentUser || currentUser.role !== 'user') return;

    const type = document.getElementById('type').value;
    const name = document.getElementById('name').value;
    const amountStr = document.getElementById('amount').value;
    const mode = document.getElementById('mode').value;
    const date = document.getElementById('date').value;

    if (name.trim() === '' || amountStr.trim() === '' || date.trim() === '') {
        alert('Please fill in all fields');
        return;
    }

    const tx = await DatabaseManager.addTransaction({
        userId: (currentUser._id || currentUser.id),
        type,
        name,
        amount: parseFloat(amountStr),
        mode,
        date,
        createdAt: new Date().toISOString()
    });

    currentTransactions.push(tx);
    
    // Clear empty state if needed
    if (currentTransactions.length === 1 && listEl.innerHTML.includes('empty-state')) {
        listEl.innerHTML = '';
    }
    
    addTransactionDOM(tx); // adds to DOM top
    updateValues();

    // Reset inputs
    document.getElementById('name').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('mode').value = 'upi';
}

if(formEl) formEl.addEventListener('submit', handleAddTransaction);

function addTransactionDOM(transaction) {
    const item = document.createElement('div');
    item.classList.add('transaction-item');
    item.classList.add(`${transaction.type}-edge`);

    const sign = (transaction.type === 'expense' || transaction.type === 'investment') ? '-' : '+';
    const dateString = new Date(transaction.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    let emiConvertBtn = '';
    if ((transaction.mode === 'creditcard' && transaction.type === 'expense') || transaction.type === 'borrowed') {
        emiConvertBtn = `<button class="convert-emi-btn" data-id="${transaction.docId}" data-amount="${transaction.amount}" data-name="${transaction.name}" title="Convert to EMI"><i class="fa-solid fa-money-bill-transfer"></i></button>`;
    }

    item.innerHTML = `
        <div class="item-info">
            <span class="item-name">${transaction.name} <small style="color:var(--text-muted); text-transform:uppercase;">[${transaction.mode || 'N/A'}]</small></span>
            <span class="item-date">${dateString}</span>
        </div>
        <div class="item-right">
            <span class="item-amount ${transaction.type}">${sign}${formatMoney(transaction.amount)}</span>
            ${emiConvertBtn}
            <button class="delete-btn" data-id="${transaction.docId}">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `;

    item.querySelector('.delete-btn').addEventListener('click', (e) => {
        let btn = e.target.closest('.delete-btn');
        handleRemoveTransaction(btn.dataset.id, item);
    });

    const emiBtn = item.querySelector('.convert-emi-btn');
    if(emiBtn) {
        emiBtn.addEventListener('click', (e) => {
            const btn = e.target;
            handleConvertToEmi(btn.dataset.id, btn.dataset.amount, btn.dataset.name);
        });
    }

    listEl.insertBefore(item, listEl.firstChild);
}

async function handleConvertToEmi(docId, amount, name) {
    // 1. Switch to EMI tab
    switchTab('emis');
    
    // 2. Pre-fill EMI form
    document.getElementById('emi-name').value = `Converted: ${name}`;
    document.getElementById('emi-principal').value = amount;
    
    // 3. Mark the original transaction as converted so it doesn't double-deduct
    const targetTx = currentTransactions.find(t => t.docId === docId);
    let newType = 'expense-converted';
    if(targetTx && targetTx.type === 'borrowed') newType = 'borrowed-converted';
    
    await DatabaseManager.updateTransactionType(docId, newType);
    
    // 4. Update local state
    if(targetTx) targetTx.type = newType;
    
    // 5. Re-render UI
    listEl.innerHTML = '';
    currentTransactions.forEach(addTransactionDOM);
    updateValues();
}

async function handleRemoveTransaction(docId, domElement) {
    await DatabaseManager.deleteTransaction(docId);
    domElement.remove();
    
    currentTransactions = currentTransactions.filter(t => t.docId !== docId);
    
    if (currentTransactions.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No transactions yet. Add one to get started!</div>';
    }
    updateValues();
}

function updateValues() {
    let totals = { income: 0, expense: 0, investment: 0, borrowed: 0, emiDeductions: 0 };
    const now = new Date();

    // 1. Calculate standard transaction totals
    let currentMonthIncome = 0;
    let currentMonthExpense = 0;

    currentTransactions.forEach(t => {
        if (t.type === 'income' || t.type === 'expense' || t.type === 'investment' || t.type === 'borrowed') {
            totals[t.type] += t.amount;
        }

        // Calculate current month overview metrics
        const tDate = new Date(t.date);
        if (tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear()) {
            if (t.type === 'income') currentMonthIncome += t.amount;
            if (t.type === 'expense') currentMonthExpense += t.amount;
        }
    });

    // 2. Calculate Active EMI Deductions
    currentEMIs.forEach(emi => {
        const startDate = new Date(emi.startDate);
        if (startDate <= now) {
            let monthsPassed = (now.getFullYear() - startDate.getFullYear()) * 12;
            monthsPassed -= startDate.getMonth();
            monthsPassed += now.getMonth();
            monthsPassed = Math.max(0, monthsPassed); 
            if (now >= startDate) monthsPassed += 1; // Count the start month as 1st payment
            if (monthsPassed > emi.tenure) monthsPassed = emi.tenure;

            totals.emiDeductions += (emi.monthlyEmi * monthsPassed);
        }
    });

    // 3. Update DOM Values (Borrowed money counts as usable 'cash on hand')
    const balance = totals.income + totals.borrowed - totals.expense - totals.investment - totals.emiDeductions;

    balanceEl.innerText = formatMoney(balance);
    
    // Overview Dashboard Setters
    if(overviewIncomeEl) overviewIncomeEl.innerText = '+' + formatMoney(currentMonthIncome);
    if(overviewExpenseEl) overviewExpenseEl.innerText = '-' + formatMoney(currentMonthExpense);
    if(overviewEmiEl) overviewEmiEl.innerText = '-' + formatMoney(totals.emiDeductions);
    if(overviewBorrowedEl) overviewBorrowedEl.innerText = '+' + formatMoney(totals.borrowed);
    
    if (balance < 0) {
        balanceEl.style.background = 'linear-gradient(90deg, #fca5a5, #ef4444)';
        balanceEl.style.backgroundClip = 'text';
        balanceEl.style.webkitBackgroundClip = 'text';
    } else {
        balanceEl.style.background = 'linear-gradient(90deg, #fff, #a5b4fc)';
        balanceEl.style.backgroundClip = 'text';
        balanceEl.style.webkitBackgroundClip = 'text';
    }

    if(ctx) updateChart(totals.income, totals.expense, totals.investment, totals.emiDeductions, totals.borrowed);
}

function updateChart(income, expense, investment, emiDeductions = 0, borrowed = 0) {
    if (chartInstance) chartInstance.destroy();
    if (!window.Chart) return;
    
    Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--chart-text-color').trim();
    Chart.defaults.font.family = "'Outfit', sans-serif";

    if (income === 0 && expense === 0 && investment === 0 && emiDeductions === 0 && borrowed === 0) return; 

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Income', 'Expense', 'Investment', 'EMIs Deducted', 'Borrowed'],
            datasets: [{
                data: [income, expense, investment, emiDeductions, borrowed],
                backgroundColor: ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#d97706'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) label += formatMoney(context.parsed);
                            return label;
                        }
                    }
                }
            }
        }
    });
}


// ----------------------------------------------------
// NAVIGATION TABS LOGIC
// ----------------------------------------------------

function switchTab(tabId, subType = null) {
    // Reset all tabs
    navOverview.classList.remove('active');
    navTransactions.classList.remove('active');
    navReports.classList.remove('active');
    navEmis.classList.remove('active');
    navDatabase.classList.remove('active');

    overviewView.style.display = 'none';
    transactionsView.style.display = 'none';
    reportsView.style.display = 'none';
    emisView.style.display = 'none';
    databaseView.style.display = 'none';

    if (tabId === 'overview') {
        navOverview.classList.add('active');
        overviewView.style.display = 'block';
    } 
    else if (tabId === 'transactions') {
        navTransactions.classList.add('active');
        transactionsView.style.display = 'grid';
        if(subType) {
            document.getElementById('type').value = subType;
        }
    }
    else if (tabId === 'reports') {
        navReports.classList.add('active');
        reportsView.style.display = 'block';
        renderReports();
    }
    else if (tabId === 'emis') {
        navEmis.classList.add('active');
        emisView.style.display = 'grid';
    }
    else if (tabId === 'database') {
        navDatabase.classList.add('active');
        databaseView.style.display = 'block';
        renderDatabaseStats();
    }
}

navOverview?.addEventListener('click', () => switchTab('overview'));
navTransactions?.addEventListener('click', () => switchTab('transactions'));
navReports?.addEventListener('click', () => switchTab('reports'));
navEmis?.addEventListener('click', () => switchTab('emis'));
navDatabase?.addEventListener('click', () => switchTab('database'));


// ----------------------------------------------------
// EMIs LOGIC
// ----------------------------------------------------

if(emiForm) {
    emiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || currentUser.role !== 'user') return;

        const name = document.getElementById('emi-name').value;
        const principal = parseFloat(document.getElementById('emi-principal').value);
        let rate = parseFloat(document.getElementById('emi-rate').value);
        const tenure = parseInt(document.getElementById('emi-tenure').value);
        const knownInstallment = parseFloat(document.getElementById('emi-installment').value);
        const startDate = document.getElementById('emi-date').value;
        const editId = document.getElementById('emi-id').value;

        // ... same calculation logic ...
        if (!name || isNaN(principal) || isNaN(tenure) || !startDate) {
            alert('Please fill Principal, Tenure, and Start Date validly.');
            return;
        }

        let monthlyEmi = 0;
        if (!isNaN(rate) && rate > 0) {
            const r = rate / 12 / 100;
            monthlyEmi = (principal * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
        } else if (!isNaN(rate) && rate === 0) {
            monthlyEmi = principal / tenure;
        } else if (!isNaN(knownInstallment) && knownInstallment > 0) {
            monthlyEmi = knownInstallment;
            if (knownInstallment <= (principal / tenure)) {
                rate = 0.00;
            } else {
                let low = 0.0, high = 100.0, approxRate = 0;
                for(let i=0; i<100; i++) {
                    approxRate = (low + high) / 2;
                    let r = approxRate / 12 / 100;
                    if (r === 0) break;
                    let calcEmi = (principal * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
                    if (calcEmi > knownInstallment) high = approxRate;
                    else low = approxRate;
                }
                rate = approxRate;
            }
        } else {
            alert("Either provide the Interest Rate OR the Known Monthly EMI.");
            return;
        }

        const totalAmount = monthlyEmi * tenure;
        const emiData = {
            userId: (currentUser._id || currentUser.id),
            label: name,
            principal,
            interestRate: parseFloat(rate.toFixed(2)),
            tenure,
            monthlyEmi,
            totalAmount,
            startDate,
            isActive: true
        };

        if (editId) {
            await DatabaseManager.editEMI(editId, emiData);
            const index = currentEMIs.findIndex(e => e.docId === editId);
            if (index > -1) currentEMIs[index] = { ...currentEMIs[index], ...emiData };
            document.getElementById('emi-submit-btn').innerText = "Calculate & Add EMI";
            document.getElementById('emi-id').value = "";
        } else {
            const emiObj = await DatabaseManager.addEMI(emiData);
            currentEMIs.push(emiObj);
        }
        
        document.getElementById('emi-form').reset();
        await renderEMIsList();
        updateValues();
    });
}

function renderEMIsList() {
    emiListEl.innerHTML = '';
    
    // Clear old chart instances
    Object.values(emiChartInstances).forEach(chart => chart.destroy());
    emiChartInstances = {};

    if (currentEMIs.length === 0) {
        emiListEl.innerHTML = '<div class="empty-state">No active EMIs tracked.</div>';
    } else {
        const sorted = [...currentEMIs].sort((a,b) => new Date(b.startDate) - new Date(a.startDate));
        const now = new Date();

        sorted.forEach(emi => {
            const item = document.createElement('div');
            item.classList.add('transaction-item', 'expense-edge');
            item.style.flexDirection = 'column'; // Stack vertically to allow chart expansion
            item.style.alignItems = 'stretch';
            item.style.cursor = 'pointer'; // Make it look clickable
            
            const startDate = new Date(emi.startDate);
            const startStr = startDate.toLocaleDateString();
            
            // Calculate ending date
            let endDate = new Date(emi.startDate);
            endDate.setMonth(endDate.getMonth() + emi.tenure);
            const endStr = endDate.toLocaleDateString();

            // Calculate Progress
            let monthsPassed = 0;
            if (now >= startDate) {
                monthsPassed = (now.getFullYear() - startDate.getFullYear()) * 12;
                monthsPassed -= startDate.getMonth();
                monthsPassed += now.getMonth();
                
                // Add 1 to count the current month if the start day has passed
                if (now.getDate() >= startDate.getDate()) {
                    monthsPassed += 1;
                }
            }
            monthsPassed = Math.max(0, monthsPassed);
            if (monthsPassed > emi.tenure) monthsPassed = emi.tenure;

            const monthsLeft = emi.tenure - monthsPassed;
            const remainingBalance = emi.totalAmount - (emi.monthlyEmi * monthsPassed);
            const progressPercent = (monthsPassed / emi.tenure) * 100;

            // Approximate principal paid vs total paid up to months passed
            // In a real amortization schedule, this is non-linear.
            // But for simple breakdown let's roughly use the correct schedule if r > 0
            
            let principalRemaining = emi.principal;
            let principalPaid = 0;
            
            if (emi.interestRate > 0) {
               const r = emi.interestRate / 12 / 100;
               // Formula for principal remaining after n months
               // Pr = P * ( (1+r)^N - (1+r)^n ) / ( (1+r)^N - 1 )
               const MathPowN = Math.pow(1 + r, emi.tenure);
               const MathPown = Math.pow(1 + r, monthsPassed);
               principalRemaining = emi.principal * (MathPowN - MathPown) / (MathPowN - 1);
               principalPaid = emi.principal - principalRemaining;
            } else {
               principalPaid = (emi.principal / emi.tenure) * monthsPassed;
               principalRemaining = emi.principal - principalPaid;
            }
            
            const totalInterest = emi.totalAmount - emi.principal;
            
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width: 100%;">
                    <div class="item-info" style="width: 100%;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="item-name">${emi.label} <small style="color:var(--text-muted); font-size: 0.8em">[${emi.tenure}m @ ${emi.interestRate}%]</small></span>
                            <span class="item-amount expense">-${formatMoney(emi.monthlyEmi)}/mo</span>
                        </div>
                        
                        <progress value="${progressPercent}" max="100"></progress>
                        
                        <div class="emi-stats">
                            <span>Paid: ${monthsPassed}/${emi.tenure} Months</span>
                            <span style="color: #fff;">Remaining: ${formatMoney(Math.max(0, remainingBalance))}</span>
                        </div>
                    </div>
                    <div class="item-right" style="margin-left: 1rem;">
                        <button class="edit-btn" data-id="${emi.docId}" title="Edit EMI"><i class="fa-solid fa-pen"></i></button>
                        <button class="delete-emi-btn delete-btn" data-id="${emi.docId}" title="Delete EMI"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                
                <!-- Expanding Chart Section -->
                <div class="emi-details-chart" id="details-${emi.docId}" style="display: none; margin-top: 1.5rem; border-top: 1px solid var(--card-border); padding-top: 1rem;">
                    <h4 style="text-align:center; font-size:0.9rem; color:var(--text-muted); margin-bottom: 0.5rem;">Principal vs Interest Breakdown</h4>
                    <div class="chart-wrapper" style="height: 180px;">
                        <canvas id="chart-${emi.docId}"></canvas>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:0.5rem; font-size:0.8rem; color:var(--text-muted);">
                        <span>Total Loan: ${formatMoney(emi.totalAmount)}</span>
                        <span>Interest: ${formatMoney(totalInterest)}</span>
                    </div>
                </div>
            `;

            // Bind Edit Button
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Prevents chart expansion
                document.getElementById('emi-name').value = emi.label;
                document.getElementById('emi-principal').value = emi.principal;
                document.getElementById('emi-rate').value = emi.interestRate;
                document.getElementById('emi-tenure').value = emi.tenure;
                document.getElementById('emi-installment').value = emi.monthlyEmi.toFixed(2);
                document.getElementById('emi-date').value = emi.startDate;
                document.getElementById('emi-id').value = emi.docId;
                document.getElementById('emi-submit-btn').innerText = "Update EMI";
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

            // Bind Delete Button
            item.querySelector('.delete-emi-btn').addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevents chart expansion
                const docId = e.target.closest('.delete-emi-btn').dataset.id;
                if (confirm("Are you sure you want to delete this EMI?")) {
                    await DatabaseManager.deleteEMI(docId);
                    currentEMIs = currentEMIs.filter(em => em.docId !== docId);
                    await renderEMIsList();
                    updateValues();
                }
            });

            // Bind Card Click (Expand Chart)
            item.addEventListener('click', (ev) => {
                // If the user clicked a button inside the element, stop
                if(ev.target.closest('button')) return;

                const detailsDiv = item.querySelector(`#details-${emi.docId}`);
                if (detailsDiv.style.display === 'none') {
                    detailsDiv.style.display = 'block';
                    
                    // Render Chart if it doesn't exist
                    if (!emiChartInstances[emi.docId] && window.Chart) {
                        const ctx = document.getElementById(`chart-${emi.docId}`).getContext('2d');
                        emiChartInstances[emi.docId] = new Chart(ctx, {
                            type: 'doughnut',
                            data: {
                                labels: ['Paid Principal', 'Remaining Principal', 'Total Interest'],
                                datasets: [{
                                    data: [principalPaid, principalRemaining, totalInterest],
                                    backgroundColor: ['#10b981', '#6366f1', '#f59e0b'],
                                    borderWidth: 0,
                                    hoverOffset: 4
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                cutout: '70%',
                                plugins: {
                                    legend: { display: false },
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                let lbl = context.label || '';
                                                if (lbl) lbl += ': ';
                                                if (context.parsed !== null) lbl += formatMoney(context.parsed);
                                                return lbl;
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                } else {
                    detailsDiv.style.display = 'none';
                }
            });

            emiListEl.appendChild(item);
        });
    }
}

// ----------------------------------------------------
// DATABASE MANAGEMENT LOGIC
// ----------------------------------------------------

async function renderDatabaseStats() {
    if (!currentUser) return;
    try {
        const isAdmin = currentUser.role === 'admin';
        const allTx = await DatabaseManager.getTransactions(isAdmin ? null : (currentUser._id || currentUser.id));
        const allEmis = await DatabaseManager.getEMIs(isAdmin ? null : (currentUser._id || currentUser.id));
        document.getElementById('stat-transactions-count').innerText = allTx.length;
        document.getElementById('stat-emis-count').innerText = allEmis.length;
        
        // Show/Hide Users tab for non-admins
        const usersBtn = document.getElementById('explorer-users-btn');
        if (usersBtn) usersBtn.style.display = isAdmin ? 'block' : 'none';

        if (!isAdmin && explorerTab === 'users') {
            await switchExplorerTab('transactions');
            return;
        }
        
        // Check for local unsynced data
        const localTxs = await DatabaseManager.getAllLocal('transactions');
        const localEmis = await DatabaseManager.getAllLocal('emis');
        const syncStatus = document.getElementById('sync-status');
        if (localTxs.length > 0 || localEmis.length > 0) {
            syncStatus.style.display = 'block';
            syncStatus.innerText = `You have ${localTxs.length + localEmis.length} local records not yet synced to cloud.`;
            syncStatus.style.color = 'var(--accent-primary)';
        }
        
        await renderExplorer();
    } catch (err) {
        console.error("Stats Error:", err);
    }
}

// Cloud Sync Button
document.getElementById('btn-sync-cloud')?.addEventListener('click', async () => {
    if (!currentUser) return;
    const btn = document.getElementById('btn-sync-cloud');
    const status = document.getElementById('sync-status');
    
    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> Syncing...';
    status.style.display = 'block';
    status.innerText = 'Uploading local data to cloud...';
    status.style.color = 'var(--accent-primary)';

    try {
        await DatabaseManager.syncToCloud((currentUser._id || currentUser.id));
        status.innerText = 'Sync complete! All data is now in the cloud.';
        status.style.color = '#10b981';
        await renderDatabaseStats();
        if (currentUser) await renderUserDashboard();
    } catch (err) {
        status.innerText = 'Sync failed: ' + err.message + '. Ensure backend is running.';
        status.style.color = '#ef4444';
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
});

document.getElementById('btn-export-db')?.addEventListener('click', async () => {
    const data = {
        users: await DatabaseManager.getUsers(),
        transactions: await DatabaseManager.getTransactions(),
        emis: await DatabaseManager.getEMIs(),
        exportDate: new Date().toISOString(),
        version: "1.0"
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hisab_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

document.getElementById('btn-import-db')?.addEventListener('click', () => {
    const fileInput = document.getElementById('import-db-file');
    const file = fileInput.files[0];
    
    if (!file) {
        alert("Please select a backup file first.");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.transactions || !data.emis || !data.users) throw new Error("Invalid backup file format.");
            
            if (confirm("Importing this data will REPLACE all current data in IndexedDB. Are you sure?")) {
                // Clear existing first
                const users = await DatabaseManager.getUsers();
                for (const u of users) await DatabaseManager.delete('users', u.id);
                const txs = await DatabaseManager.getTransactions();
                for (const t of txs) await DatabaseManager.delete('transactions', t.docId);
                const emis = await DatabaseManager.getEMIs();
                for (const e of emis) await DatabaseManager.delete('emis', e.docId);

                // Add new
                for (const u of data.users) await DatabaseManager.put('users', u);
                for (const t of data.transactions) await DatabaseManager.put('transactions', t);
                for (const em of data.emis) await DatabaseManager.put('emis', em);
                
                alert("Data imported successfully! The page will now reload.");
                window.location.reload();
            }
        } catch (err) {
            alert("Error importing data: " + err.message);
        }
    };
    reader.readAsText(file);
});

document.getElementById('btn-factory-reset')?.addEventListener('click', () => {
    if (confirm("CRITICAL WARNING: This will permanently delete ALL data, including your account and all transactions. This cannot be undone. Are you absolutely sure?")) {
        const password = prompt("Please type 'RESET' to confirm factory reset:");
        if (password === 'RESET') {
            indexedDB.deleteDatabase('HisabDB');
            localStorage.clear();
            alert("Application has been reset. Reloading...");
            window.location.reload();
        } else {
            alert("Reset cancelled.");
        }
    }
});

// ----------------------------------------------------
// DATA EXPLORER LOGIC
// ----------------------------------------------------
let explorerTab = 'transactions';

async function switchExplorerTab(tab) {
    explorerTab = tab;
    // Update active state of explorer buttons
    const navButtons = document.querySelectorAll('.explorer-tabs .nav-btn');
    navButtons.forEach(btn => {
        if(btn.innerText.toLowerCase().includes(tab)) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    await renderExplorer();
}

async function renderExplorer() {
    const thead = document.getElementById('explorer-thead');
    const tbody = document.getElementById('explorer-tbody');
    if(!thead || !tbody) return;

    if (!currentUser) return;
    const isAdmin = currentUser.role === 'admin';

    let data = [];
    let headers = [];

    if (explorerTab === 'transactions') {
        data = await DatabaseManager.getTransactions(isAdmin ? null : (currentUser._id || currentUser.id));
        headers = ['Name', 'Amount', 'Type', 'Mode', 'Date', 'Actions'];
    } else if (explorerTab === 'emis') {
        data = await DatabaseManager.getEMIs(isAdmin ? null : (currentUser._id || currentUser.id));
        headers = ['Label', 'Principal', 'Rate', 'Tenure', 'Actions'];
    } else if (explorerTab === 'users' && isAdmin) {
        data = await DatabaseManager.getUsers();
        headers = ['Name', 'Email', 'Role', 'Actions'];
    }

    thead.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
    tbody.innerHTML = '';

    data.forEach(item => {
        const tr = document.createElement('tr');
        if (explorerTab === 'transactions') {
            tr.innerHTML = `
                <td>${item.name}</td>
                <td class="${item.type}">${formatMoney(item.amount)}</td>
                <td><span class="badge-${item.type}">${item.type}</span></td>
                <td>${item.mode}</td>
                <td>${item.date}</td>
                <td><button class="delete-btn" onclick="deleteExplorerItem('transactions', '${item.docId}')"><i class="fa-solid fa-trash"></i></button></td>
            `;
        } else if (explorerTab === 'emis') {
            tr.innerHTML = `
                <td>${item.label}</td>
                <td>${formatMoney(item.principal)}</td>
                <td>${item.interestRate}%</td>
                <td>${item.tenure}m</td>
                <td><button class="delete-btn" onclick="deleteExplorerItem('emis', '${item.docId}')"><i class="fa-solid fa-trash"></i></button></td>
            `;
        } else if (explorerTab === 'users') {
            tr.innerHTML = `
                <td>${item.name}</td>
                <td>${item.email}</td>
                <td>${item.role}</td>
                <td>${item.role !== 'admin' ? `<button class="delete-btn" onclick="deleteExplorerItem('users', '${item.id}')"><i class="fa-solid fa-trash"></i></button>` : '-'}</td>
            `;
        }
        tbody.appendChild(tr);
    });
}

async function deleteExplorerItem(store, id) {
    if (confirm(`Delete this ${store} record permanently?`)) {
        if (store === 'transactions') await DatabaseManager.deleteTransaction(id);
        else if (store === 'emis') await DatabaseManager.deleteEMI(id);
        else if (store === 'users') await DatabaseManager.deleteUser(id);
        await renderDatabaseStats(); // Will call renderExplorer
        if (currentUser) await renderUserDashboard();
    }
}
window.switchExplorerTab = switchExplorerTab; // Expose to HTML
window.deleteExplorerItem = deleteExplorerItem;


// ----------------------------------------------------
// REPORTS DASHBOARD LOGIC
// ----------------------------------------------------

dateRangeSelect?.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
        customDateInputs.style.display = 'flex';
    } else {
        customDateInputs.style.display = 'none';
        renderReports();
    }
});

startDateInput?.addEventListener('change', renderReports);
endDateInput?.addEventListener('change', renderReports);
filterTypeSelect?.addEventListener('change', renderReports);

function getFilteredTransactions() {
    if (!currentUser) return [];
    
    const rangeType = dateRangeSelect.value;
    const filterType = filterTypeSelect.value;
    const now = new Date();
    let startDate = null;
    let endDate = now;

    if (rangeType === '7days') {
        startDate = new Date();
        startDate.setDate(now.getDate() - 7);
    } else if (rangeType === 'month') {
        startDate = new Date();
        startDate.setMonth(now.getMonth() - 1);
    } else if (rangeType === 'custom') {
        if (startDateInput.value) startDate = new Date(startDateInput.value);
        if (endDateInput.value) {
            endDate = new Date(endDateInput.value);
            endDate.setHours(23, 59, 59); // include the whole end day
        }
    }

    return currentTransactions.filter(tx => {
        // Exclude converted ones if looking generally (so report isn't inflated)
        if (tx.type === 'expense-converted') return false;
        
        // Check exact UI filter match
        if (filterType !== 'all' && tx.type !== filterType) return false;

        const txDate = new Date(tx.date);
        if (startDate && txDate < startDate) return false;
        if (endDate && txDate > endDate) return false;
        return true;
    });
}

function renderReports() {
    const filteredTx = getFilteredTransactions();
    
    // Render List
    reportListEl.innerHTML = '';
    
    if (filteredTx.length === 0) {
        reportListEl.innerHTML = '<div class="empty-state">No transactions in this period.</div>';
    } else {
        // Sort newest first for reports
        const sortedTx = [...filteredTx].sort((a,b) => new Date(b.date) - new Date(a.date));
        
        sortedTx.forEach(tx => {
            const item = document.createElement('div');
            item.classList.add('transaction-item');
            item.classList.add(`${tx.type}-edge`);

            const sign = tx.type === 'expense' ? '-' : '+';
            const dateString = new Date(tx.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

            item.innerHTML = `
                <div class="item-info">
                    <span class="item-name">${tx.name} <small style="color:var(--text-muted); font-size: 0.8em; text-transform:uppercase;">[${tx.mode || 'N/A'}]</small></span>
                    <span class="item-date">${dateString}</span>
                </div>
                <div class="item-right">
                    <span class="item-amount ${tx.type}">${sign}${formatMoney(tx.amount)}</span>
                </div>
            `;
            reportListEl.appendChild(item);
        });
    }

    // Render Chart
    updateReportChart(filteredTx);
}

function updateReportChart(filteredTx) {
    if (reportChartInstance) reportChartInstance.destroy();
    if (!window.Chart || !reportCtx) return;

    let income = 0, expense = 0, investment = 0;
    filteredTx.forEach(t => {
        if (t.type === 'income') income += t.amount;
        if (t.type === 'expense') expense += t.amount;
        if (t.type === 'investment') investment += t.amount;
    });

    if (income === 0 && expense === 0 && investment === 0) return;

    reportChartInstance = new Chart(reportCtx, {
        type: 'doughnut',
        data: {
            labels: ['Income', 'Expense', 'Investment'],
            datasets: [{
                data: [income, expense, investment],
                backgroundColor: ['#10b981', '#ef4444', '#3b82f6'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) label += formatMoney(context.parsed);
                            return label;
                        }
                    }
                }
            }
        }
    });
}
