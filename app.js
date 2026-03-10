// ============================================
// CONFIGURATION - UPDATE THIS URL
// ============================================
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzQISAJ2NfYzri-cbr26B8-b3oUMFeNy5srdjqXex-9ngPGO12pYstv5s1IOUystpAM/exec";

// Session Configuration
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
let sessionTimer = null;
let sessionExpiry = null;

// App State
let currentUser = null;
let branchChartInstance = null;
let areaChartInstance = null;
let typeChartInstance = null;
let currentBranchData = [];
let currentAreaData = [];
let globalData = [];
let currentCustomer = "";
let chartInstances = [];
let availableAreas = [];
let isAreaDropdownLoaded = false; // Track if dropdown is loaded

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span>⏳</span> Authenticating...';
    errorDiv.classList.remove('show');
    
    try {
        const clientInfo = await getClientInfo();
        
        const params = new URLSearchParams({
            action: 'authenticate',
            username: username,
            password: password,
            ip: clientInfo.ip,
            deviceType: clientInfo.deviceType,
            browser: clientInfo.browser,
            os: clientInfo.os,
            userAgent: clientInfo.userAgent,
            referrer: clientInfo.referrer
        });
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();
        
        if (result.success) {
            currentUser = {
                username: result.user.username,
                agentName: result.user.agentName,
                role: result.user.role,
                department: result.user.department,
                sessionToken: result.sessionToken,
                loginTime: new Date().toISOString()
            };
            
            sessionStorage.setItem('pgcpi_user', JSON.stringify(currentUser));
            sessionStorage.setItem('pgcpi_sessionExpiry', Date.now() + SESSION_TIMEOUT);
            
            startSessionTimer();
            showMainApp();
            
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            
            // Load areas for Area Checker with retry logic
            await loadAreaDropdownWithRetry();
            
        } else {
            showLoginError(result.message || 'Authentication failed');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Connection failed. Please try again.');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>🔐</span> Secure Login';
    }
}

async function getClientInfo() {
    const info = {
        ip: 'Unknown',
        deviceType: 'Unknown',
        browser: 'Unknown',
        os: 'Unknown',
        userAgent: navigator.userAgent || 'Unknown',
        referrer: document.referrer || 'Direct Access'
    };
    
    const ua = navigator.userAgent;
    
    if (/Mobile|Android|iPhone|iPod/i.test(ua)) {
        info.deviceType = /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Mobile';
    } else {
        info.deviceType = 'Desktop';
    }
    
    if (/Chrome/i.test(ua) && !/Edge/i.test(ua)) info.browser = 'Chrome';
    else if (/Firefox/i.test(ua)) info.browser = 'Firefox';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) info.browser = 'Safari';
    else if (/Edge/i.test(ua)) info.browser = 'Edge';
    else if (/Opera|OPR/i.test(ua)) info.browser = 'Opera';
    else info.browser = 'Other';
    
    if (/Windows NT 10/i.test(ua)) info.os = 'Windows 10/11';
    else if (/Windows NT 6.3/i.test(ua)) info.os = 'Windows 8.1';
    else if (/Windows NT 6.2/i.test(ua)) info.os = 'Windows 8';
    else if (/Windows NT 6.1/i.test(ua)) info.os = 'Windows 7';
    else if (/Mac OS X|macOS/i.test(ua)) info.os = 'macOS';
    else if (/Linux/i.test(ua) && !/Android/i.test(ua)) info.os = 'Linux';
    else if (/Android/i.test(ua)) info.os = 'Android';
    else if (/iOS|iPhone|iPad/i.test(ua)) info.os = 'iOS';
    else info.os = 'Other';
    
    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        info.ip = ipData.ip;
    } catch (e) {
        console.log('Could not get IP');
    }
    
    return info;
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    document.getElementById('loginErrorText').textContent = message;
    errorDiv.classList.add('show');
}

function startSessionTimer() {
    sessionExpiry = Date.now() + SESSION_TIMEOUT;
    updateSessionDisplay();
    
    if (sessionTimer) clearInterval(sessionTimer);
    
    sessionTimer = setInterval(() => {
        const remaining = sessionExpiry - Date.now();
        if (remaining <= 0) {
            handleLogout();
            alert('Session expired. Please login again.');
            return;
        }
        updateSessionDisplay();
    }, 60000);
}

function updateSessionDisplay() {
    const remaining = sessionExpiry - Date.now();
    const minutes = Math.max(0, Math.floor(remaining / 60000));
    const timerDisplay = document.getElementById('sessionTimer');
    
    if (timerDisplay) {
        timerDisplay.textContent = `Session: ${minutes}m remaining`;
        timerDisplay.style.color = minutes < 5 ? 'var(--danger)' : 'var(--text-muted)';
    }
}

function handleLogout() {
    if (sessionTimer) clearInterval(sessionTimer);
    sessionStorage.removeItem('pgcpi_user');
    sessionStorage.removeItem('pgcpi_sessionExpiry');
    currentUser = null;
    isAreaDropdownLoaded = false; // Reset flag
    
    chartInstances.forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = [];
    if (branchChartInstance) {
        branchChartInstance.destroy();
        branchChartInstance = null;
    }
    if (areaChartInstance) {
        areaChartInstance.destroy();
        areaChartInstance = null;
    }
    if (typeChartInstance) {
        typeChartInstance.destroy();
        typeChartInstance = null;
    }
    
    location.reload();
}

function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').classList.add('logged-in');
    
    if (currentUser) {
        const displayName = currentUser.agentName || currentUser.username;
        const initial = displayName.charAt(0).toUpperCase();
        
        document.getElementById('userAvatar').textContent = initial;
        document.getElementById('userNameDisplay').textContent = displayName;
        document.getElementById('userRoleDisplay').textContent = currentUser.role;
        document.getElementById('welcomeUser').textContent = displayName;
        document.getElementById('reportGeneratedBy').textContent = displayName;
    }
}

function checkExistingSession() {
    const saved = sessionStorage.getItem('pgcpi_user');
    const expiry = sessionStorage.getItem('pgcpi_sessionExpiry');
    
    if (saved && expiry) {
        if (Date.now() > parseInt(expiry)) {
            sessionStorage.removeItem('pgcpi_user');
            sessionStorage.removeItem('pgcpi_sessionExpiry');
            return;
        }
        
        try {
            currentUser = JSON.parse(saved);
            sessionExpiry = parseInt(expiry);
            startSessionTimer();
            showMainApp();
            // Load areas with retry when restoring session
            loadAreaDropdownWithRetry();
        } catch (e) {
            sessionStorage.removeItem('pgcpi_user');
            sessionStorage.removeItem('pgcpi_sessionExpiry');
        }
    }
}

// ============================================
// TAB NAVIGATION - FIXED
// ============================================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    // Load area dropdown when switching to areaChecker tab if not loaded
    if (tabName === 'areaChecker' && currentUser && !isAreaDropdownLoaded) {
        loadAreaDropdownWithRetry();
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', { 
        style: 'currency', 
        currency: 'PHP', 
        minimumFractionDigits: 2 
    }).format(amount || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateReportNumber() {
    return 'PMFS-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
}

// ============================================
// MONITORING SEARCH
// ============================================
async function searchCustomer() {
    if (!currentUser) {
        alert('Session expired. Please login again.');
        handleLogout();
        return;
    }
    
    const id = document.getElementById('customerId').value.trim();
    if (!id) {
        showError('Please enter a Customer ID');
        return;
    }

    currentCustomer = id;
    const container = document.getElementById('resultsContainer');
    
    chartInstances.forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = [];

    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Retrieving customer records...</p>
        </div>
    `;

    try {
        const params = new URLSearchParams({
            action: 'getCustomer',
            customerId: id
        });
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <span>⚠️</span>
                    <span>${escapeHtml(result.message)}</span>
                </div>
            `;
            return;
        }

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <span>⚠️</span>
                    <span>No records found for Customer ID: <strong>${escapeHtml(id)}</strong></span>
                </div>
            `;
            globalData = [];
            return;
        }

        globalData = result.data;
        renderDashboard(globalData);

    } catch (error) {
        console.error('Search error:', error);
        showError('Failed to retrieve data. Please check your connection.');
    }
}

function showError(message) {
    document.getElementById('resultsContainer').innerHTML = `
        <div class="alert alert-error">
            <span>⚠️</span>
            <span>${message}</span>
        </div>
    `;
}

// ============================================
// DASHBOARD RENDERING
// ============================================
function calculateStats(data) {
    const totalAmount = data.reduce((sum, row) => sum + (parseFloat(row["Amount"]) || 0), 0);
    const highRisk = data.filter(r => r["Status"]?.toLowerCase() === "high").length;
    const normal = data.filter(r => r["Status"]?.toLowerCase() === "normal").length;
    
    const assignedToCounts = data.reduce((acc, row) => {
        const name = row["Assigned To"] || row["Assisgned to"];
        if (name) acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});
    
    const uniqueAssignedTo = Object.keys(assignedToCounts);
    let mostAssignedTo = 'Unassigned';
    let maxCount = 0;
    
    Object.entries(assignedToCounts).forEach(([name, count]) => {
        if (count > maxCount) {
            maxCount = count;
            mostAssignedTo = name;
        }
    });
    
    const branchCounts = data.reduce((acc, row) => {
        const branch = row["Assigned Branch"];
        if (branch) acc[branch] = (acc[branch] || 0) + 1;
        return acc;
    }, {});
    
    return { 
        totalRecords: data.length, 
        totalAmount, 
        highRisk, 
        normal, 
        uniqueAssignedTo, 
        assignedToCounts, 
        mostAssignedTo, 
        mostAssignedCount: maxCount, 
        branchCounts 
    };
}

function generateMonthlySummary(data) {
    const summary = {};
    data.forEach(row => {
        const date = new Date(row["Date of Alert"]);
        const amount = parseFloat(row["Amount"]) || 0;
        if (isNaN(date)) return;
        const year = date.getFullYear();
        const month = date.getMonth();
        if (!summary[year]) summary[year] = Array(12).fill(0).map(() => ({ count: 0, total: 0 }));
        summary[year][month].count++;
        summary[year][month].total += amount;
    });
    return summary;
}

function renderDashboard(data) {
    const container = document.getElementById('resultsContainer');
    const stats = calculateStats(data);
    const customerName = data[0]["Customer Name"] || "Unknown Customer";

    const html = `
        <div class="fade-in">
            ${renderStatsCards(stats)}
            <div class="content-grid">
                ${renderCustomerInfoCard(data[0])}
                ${renderBranchesCard(stats.branchCounts)}
            </div>
            <div class="content-grid">
                ${renderDocumentsCard(data)}
                ${renderCaseAssignmentCard(stats.mostAssignedTo, stats.mostAssignedCount, stats.assignedToCounts)}
            </div>
            ${renderAssignedToCard(stats.uniqueAssignedTo)}
            ${renderTransactionTable(data)}
            <div class="chart-grid">${renderCharts(data)}</div>
        </div>
    `;

    container.innerHTML = html;
    initializeCharts(data);
}

function renderStatsCards(stats) {
    return `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header"><span class="stat-label">Total Records</span><span class="stat-icon">📋</span></div>
                <div class="stat-value">${stats.totalRecords}</div>
                <div class="stat-subtext">Transaction alerts</div>
            </div>
            <div class="stat-card">
                <div class="stat-header"><span class="stat-label">Total Amount</span><span class="stat-icon">💰</span></div>
                <div class="stat-value">${formatCurrency(stats.totalAmount)}</div>
                <div class="stat-subtext">Cumulative value</div>
            </div>
            <div class="stat-card info">
                <div class="stat-header"><span class="stat-label">Assigned Officers</span><span class="stat-icon">👥</span></div>
                <div class="stat-value">${stats.uniqueAssignedTo.length}</div>
                <div class="stat-subtext">Unique personnel</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-header"><span class="stat-label">Branches</span><span class="stat-icon">🏢</span></div>
                <div class="stat-value">${Object.keys(stats.branchCounts).length}</div>
                <div class="stat-subtext">Processing locations</div>
            </div>
        </div>
    `;
}

function renderCustomerInfoCard(record) {
    return `
        <div class="card">
            <div class="card-header"><div class="card-title">👤 Customer Profile</div></div>
            <div class="card-body">
                <div style="margin-bottom: 15px;">
                    <span style="display:block; font-size: 0.875rem; color: var(--text-muted); margin-bottom: 4px;">Customer Name</span>
                    <span style="font-size: 1.2rem; font-weight: 600;">${escapeHtml(record["Customer Name"]) || 'N/A'}</span>
                </div>
                <div style="margin-bottom: 15px;">
                    <span style="display:block; font-size: 0.875rem; color: var(--text-muted); margin-bottom: 4px;">Customer ID</span>
                    <span style="font-weight: 600;">${escapeHtml(currentCustomer)}</span>
                </div>
                <div>
                    <span style="display:block; font-size: 0.875rem; color: var(--text-muted); margin-bottom: 4px;">Account Status</span>
                    <span style="color: var(--success); font-weight: 600;">● Active</span>
                </div>
            </div>
        </div>
    `;
}

function renderBranchesCard(branchCounts) {
    const branches = Object.entries(branchCounts).sort((a, b) => b[1] - a[1]);
    if (branches.length === 0) {
        return `<div class="card"><div class="card-header"><div class="card-title">🏢 Assigned Branches</div></div><div class="card-body"><div style="text-align: center; padding: 40px; color: var(--text-muted);">No branch data available.</div></div></div>`;
    }
    const branchItems = branches.map(([branch, count]) => `
        <div class="branch-item"><span class="branch-name">${escapeHtml(branch)}</span><span class="branch-count">${count}</span></div>
    `).join('');
    return `
        <div class="card">
            <div class="card-header"><div class="card-title">🏢 Assigned Branches</div><span style="font-size: 0.9rem; color: var(--text-muted);">${branches.length} branch(es)</span></div>
            <div class="card-body" style="padding: 20px;"><div class="branches-grid">${branchItems}</div></div>
        </div>
    `;
}

function renderDocumentsCard(data) {
    const documents = [];
    const seenDocs = new Set();
    data.forEach(row => {
        const docName = row["Document"];
        if (docName && !seenDocs.has(docName)) {
            seenDocs.add(docName);
            documents.push({ 
                name: docName, 
                validity: row["Validity"], 
                link: row["Document Link"] 
            });
        }
    });
    
    if (documents.length === 0) {
        return `<div class="card"><div class="card-header"><div class="card-title">📎 Documents Submitted</div></div><div class="card-body"><div style="text-align: center; padding: 40px; color: var(--text-muted);">No documents available.</div></div></div>`;
    }
    
    const rows = documents.map((doc, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${escapeHtml(doc.name)}</strong></td>
            <td>${formatDate(doc.validity)}</td>
            <td>${doc.link ? `<a href="${escapeHtml(doc.link)}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: 600;"><span>📄</span> View</a>` : '<span style="color: var(--text-muted);">—</span>'}</td>
        </tr>
    `).join('');
    
    return `
        <div class="card">
            <div class="card-header"><div class="card-title">📎 Documents Submitted</div><span style="font-size: 0.9rem; color: var(--text-muted);">${documents.length} document(s)</span></div>
            <div class="card-body" style="padding: 0;">
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th style="width: 50px;">#</th><th>Document Name</th><th>Validity</th><th style="width: 100px;">Action</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderCaseAssignmentCard(mostAssignedTo, count, allCounts) {
    const total = Object.values(allCounts).reduce((a, b) => a + b, 0);
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
        <div class="card">
            <div class="card-header"><div class="card-title">🎯 Case Assignment</div><span style="font-size: 0.9rem; color: var(--text-muted);">Primary Officer</span></div>
            <div class="card-body">
                <div style="display: flex; align-items: center; gap: 15px; padding: 10px 0;">
                    <div style="width: 70px; height: 70px; background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; color: white; font-weight: 700;">${mostAssignedTo.charAt(0).toUpperCase()}</div>
                    <div style="flex: 1;">
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${escapeHtml(mostAssignedTo)}</div>
                        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 8px;">Primary Case Officer</div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="flex: 1; height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden;">
                                <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, var(--accent) 0%, var(--accent-light) 100%);"></div>
                            </div>
                            <span style="font-size: 0.8rem; font-weight: 600; color: var(--accent);">${count} of ${total} (${percentage}%)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAssignedToCard(uniqueNames) {
    if (uniqueNames.length === 0) {
        return `<div class="card" style="margin-bottom: 30px;"><div class="card-header"><div class="card-title">👥 Assigned To</div></div><div class="card-body"><div style="text-align: center; padding: 40px; color: var(--text-muted);">No assigned officers found.</div></div></div>`;
    }
    const items = uniqueNames.map(name => `
        <div class="assigned-to-item"><div class="assigned-to-avatar">${name.charAt(0).toUpperCase()}</div><span class="assigned-to-name">${escapeHtml(name)}</span></div>
    `).join('');
    return `
        <div class="card" style="margin-bottom: 30px;">
            <div class="card-header"><div class="card-title">👥 Assigned To</div><span style="font-size: 0.9rem; color: var(--text-muted);">${uniqueNames.length} officer(s)</span></div>
            <div class="card-body" style="padding: 20px;"><div class="assigned-to-list">${items}</div></div>
        </div>
    `;
}

function renderTransactionTable(data) {
    const rows = data.map((row, index) => {
        const amount = parseFloat(row["Amount"]) || 0;
        const isHigh = row["Status"]?.toLowerCase() === "high";
        const assignedTo = row["Assigned To"] || row["Assisgned to"] || '—';
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${formatDate(row["Date of Alert"])}</td>
                <td>${escapeHtml(row["Transaction Type"]) || 'General'}</td>
                <td class="amount ${isHigh ? 'amount-high' : ''}">${formatCurrency(amount)}</td>
                <td><span class="status-badge ${isHigh ? 'status-high' : 'status-normal'}">${escapeHtml(row["Status"]) || 'Unknown'}</span></td>
                <td>${escapeHtml(assignedTo)}</td>
            </tr>
        `;
    }).join('');
    return `
        <div class="card" style="margin-bottom: 30px;">
            <div class="card-header"><div class="card-title">📋 Transaction History</div><span style="font-size: 0.9rem; color: var(--text-muted);">${data.length} records found</span></div>
            <div class="card-body" style="padding: 0;">
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th style="width: 50px;">#</th><th>Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Assigned To</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderCharts(data) {
    const summary = generateMonthlySummary(data);
    const years = Object.keys(summary).sort();
    if (years.length === 0) return '';
    return years.map(year => `
        <div class="chart-container">
            <div class="chart-header"><div class="chart-title">📈 Monthly Analysis - ${year}</div></div>
            <div class="chart-wrapper"><canvas id="chart-${year}"></canvas></div>
        </div>
    `).join('');
}

function initializeCharts(data) {
    const summary = generateMonthlySummary(data);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    Object.keys(summary).forEach(year => {
        const ctx = document.getElementById(`chart-${year}`);
        if (!ctx) return;
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Alert Count', data: summary[year].map(m => m.count), backgroundColor: 'rgba(30, 58, 95, 0.8)', borderColor: 'rgba(30, 58, 95, 1)', borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
                    { label: 'Amount (PHP)', data: summary[year].map(m => m.total), backgroundColor: 'rgba(5, 150, 105, 0.6)', borderColor: 'rgba(5, 150, 105, 1)', borderWidth: 1, borderRadius: 4, yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, padding: 20, font: { size: 12, weight: '600' } } },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.dataset.yAxisID === 'y1') label += formatCurrency(context.raw);
                                else label += context.raw;
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: { type: 'linear', display: true, position: 'left', beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: function(value) { return '₱' + (value / 1000).toFixed(0) + 'k'; } } },
                    x: { grid: { display: false } }
                }
            }
        });
        chartInstances.push(chart);
    });
}

// ============================================
// ID FINDER
// ============================================
async function searchCustomerByName() {
    if (!currentUser) {
        alert('Session expired. Please login again.');
        handleLogout();
        return;
    }
    
    const nameInput = document.getElementById('customerNameSearch').value.trim();
    const filterInput = document.getElementById('searchFilter').value.trim();
    
    if (!nameInput) {
        showFinderError('Please enter a customer name to search');
        return;
    }

    const container = document.getElementById('finderResults');
    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Searching for: <strong>${escapeHtml(nameInput)}</strong></p>
        </div>
    `;

    try {
        let params = new URLSearchParams({
            action: 'findByName',
            customerName: nameInput
        });
        if (filterInput) params.append('filter', filterInput);
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            container.innerHTML = `<div class="alert alert-error"><span>⚠️</span><span>${escapeHtml(result.message)}</span></div>`;
            return;
        }

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="alert alert-error"><span>⚠️</span><span>No customers found matching "<strong>${escapeHtml(nameInput)}</strong>"</span></div>
                <div class="alert alert-info" style="margin-top: 10px;">
                    <span>💡</span>
                    <span><strong>Search Tips:</strong><br>• Try just the last name<br>• Remove commas<br>• Search is case-insensitive</span>
                </div>
            `;
            return;
        }

        renderFinderResults(result.data, nameInput);

    } catch (error) {
        container.innerHTML = `<div class="alert alert-error"><span>⚠️</span><span>Failed to search. Please check your connection.</span></div>`;
    }
}

function renderFinderResults(results, searchTerm) {
    const container = document.getElementById('finderResults');
    const tableRows = results.map((item) => {
        const customerId = item["Customer ID"] || '';
        const customerName = item["Customer Name"] || '';
        const branch = item["Assigned Branch"] || '-';
        const officer = item["Assigned To"] || 'Unassigned';
        const highlightedName = customerName.replace(new RegExp(searchTerm, 'gi'), match => `<span class="highlight">${match}</span>`);
        
        return `
            <tr class="finder-row" onclick="selectCustomerFromFinder('${escapeHtml(customerId)}')">
                <td class="col-id"><span style="font-size: 1.2rem;">🆔</span> ${escapeHtml(customerId)}</td>
                <td class="col-name">${highlightedName}</td>
                <td class="col-branch"><span>🏢</span> ${escapeHtml(branch)}</td>
                <td class="col-officer"><span>👤</span> ${escapeHtml(officer)}</td>
                <td style="text-align: center;">
                    <button class="btn-select" onclick="event.stopPropagation(); selectCustomerFromFinder('${escapeHtml(customerId)}')">Select</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="finder-results fade-in">
            <div class="finder-header">
                <div class="finder-title"><span>✅</span> Search Results</div>
                <div class="finder-stats">${results.length} unique customer(s) found</div>
            </div>
            <div class="table-container">
                <table class="finder-table">
                    <thead>
                        <tr>
                            <th class="col-id">🆔 Customer ID</th>
                            <th class="col-name">👤 Customer Name</th>
                            <th class="col-branch">🏢 Branch</th>
                            <th class="col-officer">👤 Officer</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function selectCustomerFromFinder(customerId) {
    switchTab('monitoring');
    document.getElementById('customerId').value = customerId;
    searchCustomer();
}

function showFinderError(message) {
    document.getElementById('finderResults').innerHTML = `
        <div class="alert alert-error"><span>⚠️</span><span>${message}</span></div>
    `;
}

// ============================================
// BRANCH CHECKER
// ============================================
async function searchBranch() {
    if (!currentUser) {
        alert('Session expired. Please login again.');
        handleLogout();
        return;
    }
    
    const branchCode = document.getElementById('branchCode').value.trim().toUpperCase();
    if (!branchCode || branchCode.length !== 3) {
        showBranchError('Please enter exactly 3 letters for the branch code (e.g., AAQ)');
        return;
    }

    const container = document.getElementById('branchResults');
    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Searching for branch: <strong>${escapeHtml(branchCode)}</strong></p>
        </div>
    `;

    try {
        if (branchChartInstance) {
            branchChartInstance.destroy();
            branchChartInstance = null;
        }

        const params = new URLSearchParams({
            action: 'getBranch',
            branchCode: branchCode
        });
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            container.innerHTML = `<div class="alert alert-error"><span>⚠️</span><span>${escapeHtml(result.message)}</span></div>`;
            return;
        }

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="alert alert-error"><span>⚠️</span><span>No records found for branch code "<strong>${escapeHtml(branchCode)}</strong>"</span></div>
                <div class="alert alert-info" style="margin-top: 10px;">
                    <span>💡</span>
                    <span><strong>Search Tips:</strong><br>• Enter exactly 3 letters<br>• Search is case-insensitive</span>
                </div>
            `;
            currentBranchData = [];
            return;
        }

        currentBranchData = result.data;
        renderBranchResults(result.data, branchCode, result.monthlySummary);

    } catch (error) {
        container.innerHTML = `<div class="alert alert-error"><span>⚠️</span><span>Failed to search branch. Please check your connection.</span></div>`;
    }
}

function renderBranchResults(data, branchCode, monthlySummary) {
    const container = document.getElementById('branchResults');
    const totalAmount = data.reduce((sum, r) => sum + (parseFloat(r["Amount"]) || 0), 0);
    const totalTransactions = data.reduce((sum, r) => sum + (parseFloat(r["Total Transaction"]) || 0), 0);
    const uniqueBranches = [...new Set(data.map(r => r["Assigned Branch"]))];
    
    let tableRows = '';
    if (monthlySummary) {
        Object.keys(monthlySummary).sort().forEach(year => {
            monthlySummary[year].forEach((month, idx) => {
                if (month.count > 0) {
                    const monthName = new Date(year, idx).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
                    tableRows += `
                        <tr>
                            <td style="font-weight: 600;">${monthName}</td>
                            <td><span style="font-family: monospace; font-weight: 700; color: var(--primary); background: var(--bg-secondary); padding: 4px 8px; border-radius: var(--radius-sm);">${escapeHtml(branchCode)}</span></td>
                            <td style="text-align: center;"><span style="background: var(--purple); color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">${month.totalTransactions.toLocaleString()}</span></td>
                            <td style="text-align: right; font-weight: 700; color: var(--accent);">${formatCurrency(month.totalAmount)}</td>
                            <td style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">${month.count} records</td>
                        </tr>
                    `;
                }
            });
        });
    }
    
    const detailRows = data.map((record, index) => `
        <tr>
            <td style="text-align: center;">${index + 1}</td>
            <td>${formatDate(record["Date of Alert"])}</td>
            <td>${escapeHtml(record["Assigned Branch"])}</td>
            <td style="text-align: center; font-family: monospace;">${parseFloat(record["Total Transaction"] || 0).toLocaleString()}</td>
            <td style="text-align: right; font-weight: 600;">${formatCurrency(record["Amount"])}</td>
        </tr>
    `).join('');
    
    container.innerHTML = `
        <div class="fade-in">
            <div class="stats-grid" style="margin-bottom: 30px;">
                <div class="stat-card">
                    <div class="stat-header"><span class="stat-label">Branch Code</span><span class="stat-icon">🏢</span></div>
                    <div class="stat-value" style="font-family: monospace; font-size: 2rem;">${escapeHtml(branchCode)}</div>
                    <div class="stat-subtext">${uniqueBranches.length} matching branch(es)</div>
                </div>
                <div class="stat-card success">
                    <div class="stat-header"><span class="stat-label">Total Amount</span><span class="stat-icon">💰</span></div>
                    <div class="stat-value">${formatCurrency(totalAmount)}</div>
                    <div class="stat-subtext">Cumulative transaction value</div>
                </div>
                <div class="stat-card purple">
                    <div class="stat-header"><span class="stat-label">Total Transactions</span><span class="stat-icon">📊</span></div>
                    <div class="stat-value">${totalTransactions.toLocaleString()}</div>
                    <div class="stat-subtext">Transaction count</div>
                </div>
                <div class="stat-card info">
                    <div class="stat-header"><span class="stat-label">Data Points</span><span class="stat-icon">📋</span></div>
                    <div class="stat-value">${data.length}</div>
                    <div class="stat-subtext">Records found</div>
                </div>
            </div>

            <div class="card" style="margin-bottom: 30px;">
                <div class="card-header"><div class="card-title">📅 Monthly Summary - Branch ${escapeHtml(branchCode)}</div></div>
                <div class="card-body" style="padding: 0;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>Month</th><th>Branch Code</th><th style="text-align: center;">Total Transactions</th><th style="text-align: right;">Amount</th><th style="text-align: center;">Records</th></tr></thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <div class="chart-title">📈 Monthly Comparison: Amount vs Total Transactions</div>
                    <div style="font-size: 0.875rem; color: var(--text-muted);">Branch: <strong>${escapeHtml(branchCode)}</strong></div>
                </div>
                <div class="chart-wrapper"><canvas id="branchChart"></canvas></div>
            </div>

            <div class="card" style="margin-bottom: 30px;">
                <div class="card-header">
                    <div class="card-title">📝 Detailed Transaction Records</div>
                    <span style="font-size: 0.9rem; color: var(--text-muted);">${data.length} entries</span>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                        <table class="data-table">
                            <thead style="position: sticky; top: 0; z-index: 10;">
                                <tr><th style="width: 60px; text-align: center;">#</th><th>Date of Alert</th><th>Assigned Branch</th><th style="text-align: center;">Total Transaction</th><th style="text-align: right;">Amount</th></tr>
                            </thead>
                            <tbody>${detailRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    initializeBranchChart(monthlySummary, branchCode);
}

function initializeBranchChart(monthlySummary, branchCode) {
    const ctx = document.getElementById('branchChart');
    if (!ctx || !monthlySummary) return;
    
    const labels = [];
    const amountData = [];
    const transactionData = [];
    
    Object.keys(monthlySummary).sort().forEach(year => {
        monthlySummary[year].forEach((month, idx) => {
            if (month.count > 0) {
                labels.push(new Date(year, idx).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }));
                amountData.push(month.totalAmount);
                transactionData.push(month.totalTransactions);
            }
        });
    });
    
    branchChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Amount (PHP)',
                    data: amountData,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                    yAxisID: 'y',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: 'Total Transactions',
                    data: transactionData,
                    borderColor: '#7c3aed',
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label + ': ';
                            if (context.dataset.yAxisID === 'y') label += formatCurrency(context.raw);
                            else label += context.raw.toLocaleString();
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    type: 'linear', display: true, position: 'left',
                    title: { display: true, text: 'Amount (PHP)', color: '#059669' },
                    ticks: { callback: function(value) { return '₱' + (value / 1000).toFixed(0) + 'k'; }, color: '#059669' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y1: {
                    type: 'linear', display: true, position: 'right',
                    title: { display: true, text: 'Transaction Count', color: '#7c3aed' },
                    ticks: { color: '#7c3aed' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function showBranchError(message) {
    document.getElementById('branchResults').innerHTML = `
        <div class="alert alert-error"><span>⚠️</span><span>${message}</span></div>
    `;
}

// ============================================
// AREA CHECKER - FIXED WITH RETRY LOGIC
// ============================================

/**
 * Load area dropdown with retry logic and loading state
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} delay - Delay between retries in ms
 */
async function loadAreaDropdownWithRetry(maxRetries = 3, delay = 1000) {
    const select = document.getElementById('areaNameSelect');
    
    // Set loading state
    if (select) {
        select.innerHTML = '<option value="">⏳ Loading areas...</option>';
        select.disabled = true;
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Loading areas (attempt ${attempt}/${maxRetries})...`);
            
            const params = new URLSearchParams({
                action: 'getAreas'
            });
            
            // Add timeout to fetch
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`${WEB_APP_URL}?${params.toString()}`, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.areas && Array.isArray(result.areas) && result.areas.length > 0) {
                availableAreas = result.areas;
                populateAreaDropdown(result.areas);
                isAreaDropdownLoaded = true;
                console.log(`✅ Areas loaded successfully: ${result.areas.length} areas`);
                return; // Success - exit function
            } else if (result.success && (!result.areas || result.areas.length === 0)) {
                console.warn('API returned success but no areas found');
                if (select) {
                    select.innerHTML = '<option value="">⚠️ No areas available</option>';
                }
                isAreaDropdownLoaded = true; // Mark as loaded (even if empty)
                return;
            } else {
                throw new Error(result.message || 'Invalid response from server');
            }
            
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            
            if (attempt === maxRetries) {
                // Final attempt failed
                console.error('All retry attempts exhausted');
                if (select) {
                    select.innerHTML = '<option value="">❌ Failed to load areas</option>';
                    select.disabled = false;
                    
                    // Add retry button
                    const retryBtn = document.createElement('button');
                    retryBtn.textContent = '🔄 Retry';
                    retryBtn.className = 'btn-retry';
                    retryBtn.onclick = () => loadAreaDropdownWithRetry();
                    retryBtn.style.cssText = 'margin-left: 10px; padding: 5px 10px; cursor: pointer;';
                    
                    // Insert after select if not already present
                    if (!select.nextElementSibling || !select.nextElementSibling.classList.contains('btn-retry')) {
                        select.parentNode.insertBefore(retryBtn, select.nextSibling);
                    }
                }
                
                // Show user-friendly error in area results if visible
                const areaResults = document.getElementById('areaResults');
                if (areaResults && !areaResults.querySelector('.alert')) {
                    areaResults.innerHTML = `
                        <div class="alert alert-error">
                            <span>⚠️</span>
                            <span>Failed to load area list. Please click "Retry" or refresh the page.</span>
                        </div>
                    `;
                }
            } else {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

/**
 * Legacy function - kept for compatibility
 * Use loadAreaDropdownWithRetry() instead
 */
async function loadAreaDropdown() {
    return loadAreaDropdownWithRetry();
}

function populateAreaDropdown(areas) {
    const select = document.getElementById('areaNameSelect');
    if (!select) {
        console.error('Area select element not found');
        return;
    }
    
    select.innerHTML = '<option value="">-- Select Area --</option>';
    select.disabled = false;
    
    // Remove retry button if exists
    const retryBtn = select.parentNode.querySelector('.btn-retry');
    if (retryBtn) {
        retryBtn.remove();
    }
    
    // Sort areas alphabetically
    areas.sort((a, b) => a.localeCompare(b));
    
    areas.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        select.appendChild(option);
    });
    
    console.log(`Dropdown populated with ${areas.length} areas`);
}

async function searchArea() {
    if (!currentUser) {
        alert('Session expired. Please login again.');
        handleLogout();
        return;
    }
    
    const areaName = document.getElementById('areaNameSelect').value;
    const dateFrom = document.getElementById('areaDateFrom').value;
    const dateTo = document.getElementById('areaDateTo').value;
    
    if (!areaName) {
        showAreaError('Please select an area to analyze');
        return;
    }

    const container = document.getElementById('areaResults');
    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Analyzing area: <strong>${escapeHtml(areaName)}</strong></p>
            <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 10px;">
                ${dateFrom && dateTo ? `Date range: ${formatDate(dateFrom)} - ${formatDate(dateTo)}` : 'All dates'}
            </p>
        </div>
    `;

    try {
        if (areaChartInstance) {
            areaChartInstance.destroy();
            areaChartInstance = null;
        }
        if (typeChartInstance) {
            typeChartInstance.destroy();
            typeChartInstance = null;
        }

        const params = new URLSearchParams({
            action: 'getAreaData',
            areaName: areaName
        });
        
        if (dateFrom) params.append('dateFrom', dateFrom);
        if (dateTo) params.append('dateTo', dateTo);
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            container.innerHTML = `<div class="alert alert-error"><span>⚠️</span><span>${escapeHtml(result.message)}</span></div>`;
            return;
        }

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="alert alert-error"><span>⚠️</span><span>No records found for area "<strong>${escapeHtml(areaName)}</strong>"</span></div>
                <div class="alert alert-info" style="margin-top: 10px;">
                    <span>💡</span>
                    <span><strong>Search Tips:</strong><br>• Try selecting a different area<br>• Adjust the date range<br>• Check if data exists for this area</span>
                </div>
            `;
            currentAreaData = [];
            return;
        }

        currentAreaData = result.data;
        renderAreaResults(result.data, areaName, dateFrom, dateTo, result.summary);

    } catch (error) {
        console.error('Area search error:', error);
        container.innerHTML = `<div class="alert alert-error"><span>⚠️</span><span>Failed to analyze area. Please check your connection.</span></div>`;
    }
}

function renderAreaResults(data, areaName, dateFrom, dateTo, summary) {
    const container = document.getElementById('areaResults');
    
    // Calculate statistics
    const totalAmount = data.reduce((sum, r) => sum + (parseFloat(r["Total Amount"]) || parseFloat(r["Amount"]) || 0), 0);
    const totalTransactions = data.reduce((sum, r) => sum + (parseFloat(r["Total Transaction"]) || 0), 0);
    
    // Group by branch
    const branchStats = data.reduce((acc, row) => {
        const branch = row["Assigned Branch"] || 'Unknown';
        if (!acc[branch]) {
            acc[branch] = {
                count: 0,
                totalAmount: 0,
                totalTransactions: 0
            };
        }
        acc[branch].count++;
        acc[branch].totalAmount += parseFloat(row["Total Amount"] || row["Amount"] || 0);
        acc[branch].totalTransactions += parseFloat(row["Total Transaction"] || 0);
        return acc;
    }, {});
    
    const branchList = Object.entries(branchStats).sort((a, b) => b[1].totalTransactions - a[1].totalTransactions);
    
    // Get unique clusters and regions
    const clusters = [...new Set(data.map(r => r["CLUSTER"]).filter(Boolean))];
    const regions = [...new Set(data.map(r => r["Region"]).filter(Boolean))];
    
    // Generate daily data for chart
    const dailyData = generateDailySummary(data);
    
    const html = `
        <div class="fade-in">
            <!-- Area Profile Card -->
            <div class="area-profile-card">
                <div class="area-profile-header">
                    <div>
                        <div class="area-profile-title">Area Profile</div>
                        <div class="area-profile-value">${escapeHtml(areaName)}</div>
                        <div class="area-profile-sub">${dateFrom && dateTo ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}` : 'All Time Period'}</div>
                    </div>
                    <div style="font-size: 3rem; opacity: 0.3;">🗺️</div>
                </div>
                <div class="area-profile-grid">
                    <div class="area-profile-item">
                        <div class="area-profile-label">Cluster</div>
                        <div class="area-profile-data">${escapeHtml(clusters.join(', ') || 'N/A')}</div>
                    </div>
                    <div class="area-profile-item">
                        <div class="area-profile-label">Region</div>
                        <div class="area-profile-data">${escapeHtml(regions.join(', ') || 'N/A')}</div>
                    </div>
                    <div class="area-profile-item">
                        <div class="area-profile-label">Total Branches</div>
                        <div class="area-profile-data">${branchList.length} Active</div>
                    </div>
                </div>
            </div>

            <!-- Summary Stats -->
            <div class="area-summary-grid">
                <div class="area-stat-card amount">
                    <div class="area-stat-header">
                        <span class="area-stat-label">Total Amount</span>
                        <span class="area-stat-icon">💰</span>
                    </div>
                    <div class="area-stat-value amount">${formatCurrency(totalAmount)}</div>
                    <div class="area-stat-subtext">Cumulative transaction value</div>
                </div>
                <div class="area-stat-card transactions">
                    <div class="area-stat-header">
                        <span class="area-stat-label">Total Transactions</span>
                        <span class="area-stat-icon">📊</span>
                    </div>
                    <div class="area-stat-value transactions">${totalTransactions.toLocaleString()}</div>
                    <div class="area-stat-subtext">Transaction count</div>
                </div>
                <div class="area-stat-card">
                    <div class="area-stat-header">
                        <span class="area-stat-label">Avg Amount/Transaction</span>
                        <span class="area-stat-icon">📈</span>
                    </div>
                    <div class="area-stat-value">${formatCurrency(totalTransactions > 0 ? totalAmount / totalTransactions : 0)}</div>
                    <div class="area-stat-subtext">Average transaction size</div>
                </div>
                <div class="area-stat-card branches">
                    <div class="area-stat-header">
                        <span class="area-stat-label">Branches</span>
                        <span class="area-stat-icon">🏢</span>
                    </div>
                    <div class="area-stat-value branches">${branchList.length}</div>
                    <div class="area-stat-subtext">Active branches</div>
                </div>
            </div>

            <div class="content-grid">
                <!-- Branch List Card -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">🏢 Branches in ${escapeHtml(areaName)}</div>
                        <span style="font-size: 0.9rem; color: var(--text-muted);">${branchList.length} branches</span>
                    </div>
                    <div class="card-body branch-list-card">
                        ${branchList.map(([branch, stats]) => `
                            <div class="branch-list-item">
                                <div class="branch-list-info">
                                    <div class="branch-list-icon">🏦</div>
                                    <div class="branch-list-details">
                                        <div class="branch-list-name">${escapeHtml(branch)}</div>
                                        <div class="branch-list-meta">${stats.count} records</div>
                                    </div>
                                </div>
                                <div class="branch-list-stats">
                                    <div class="branch-list-count">${stats.totalTransactions.toLocaleString()}</div>
                                    <div class="branch-list-label">Transactions</div>
                                    <div style="font-size: 0.85rem; color: var(--accent); font-weight: 600; margin-top: 4px;">
                                        ${formatCurrency(stats.totalAmount)}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Transaction Types Breakdown -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">📝 Transaction Types</div>
                        <span style="font-size: 0.9rem; color: var(--text-muted);">Distribution</span>
                    </div>
                    <div class="card-body">
                        <div style="height: 400px; position: relative;">
                            <canvas id="typeChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Analytics Chart -->
            <div class="area-chart-container">
                <div class="area-chart-header">
                    <div>
                        <div class="area-chart-title">📈 Transaction Behavior Analysis</div>
                        <div class="area-chart-subtitle">Amount vs Transaction Count Over Time</div>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--accent);">
                            <span style="width: 12px; height: 12px; background: var(--accent); border-radius: 2px;"></span> Amount
                        </span>
                        <span style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--purple);">
                            <span style="width: 12px; height: 12px; background: var(--purple); border-radius: 2px;"></span> Transactions
                        </span>
                    </div>
                </div>
                <div class="area-chart-wrapper">
                    <canvas id="areaBehaviorChart"></canvas>
                </div>
            </div>

            <!-- Detailed Data Table -->
            <div class="card" style="margin-bottom: 30px;">
                <div class="card-header">
                    <div class="card-title">📋 Detailed Transaction Records</div>
                    <span style="font-size: 0.9rem; color: var(--text-muted);">${data.length} entries</span>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                        <table class="data-table">
                            <thead style="position: sticky; top: 0; z-index: 10;">
                                <tr>
                                    <th>Date</th>
                                    <th>Branch</th>
                                    <th>Type</th>
                                    <th style="text-align: center;">Transactions</th>
                                    <th style="text-align: right;">Amount</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.map((row, index) => `
                                    <tr>
                                        <td>${formatDate(row["Date of Alert"])}</td>
                                        <td>${escapeHtml(row["Assigned Branch"] || '—')}</td>
                                        <td>${escapeHtml(row["Transaction Type"] || 'General')}</td>
                                        <td style="text-align: center; font-family: monospace; font-weight: 600;">
                                            ${parseInt(row["Total Transaction"] || 0).toLocaleString()}
                                        </td>
                                        <td style="text-align: right; font-weight: 600; color: var(--accent);">
                                            ${formatCurrency(row["Total Amount"] || row["Amount"] || 0)}
                                        </td>
                                        <td>
                                            <span class="status-badge ${(row["Status"]?.toLowerCase() === 'high') ? 'status-high' : 'status-normal'}">
                                                ${escapeHtml(row["Status"] || 'Normal')}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    
    // Initialize charts
    initializeAreaChart(dailyData);
    initializeTransactionTypeChart(data);
}

function generateDailySummary(data) {
    const summary = {};
    
    data.forEach(row => {
        const dateStr = row["Date of Alert"];
        if (!dateStr) return;
        
        const date = new Date(dateStr);
        if (isNaN(date)) return;
        
        const key = date.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (!summary[key]) {
            summary[key] = {
                date: key,
                displayDate: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
                amount: 0,
                transactions: 0,
                count: 0
            };
        }
        
        summary[key].amount += parseFloat(row["Total Amount"] || row["Amount"] || 0);
        summary[key].transactions += parseFloat(row["Total Transaction"] || 0);
        summary[key].count++;
    });
    
    // Sort by date
    return Object.values(summary).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function initializeAreaChart(dailyData) {
    const ctx = document.getElementById('areaBehaviorChart');
    if (!ctx || dailyData.length === 0) return;
    
    const labels = dailyData.map(d => d.displayDate);
    const amounts = dailyData.map(d => d.amount);
    const transactions = dailyData.map(d => d.transactions);
    
    areaChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Amount (PHP)',
                    data: amounts,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                    yAxisID: 'y',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#059669',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Total Transactions',
                    data: transactions,
                    borderColor: '#7c3aed',
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#7c3aed',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label + ': ';
                            if (context.dataset.yAxisID === 'y') {
                                label += formatCurrency(context.raw);
                            } else {
                                label += context.raw.toLocaleString();
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Amount (PHP)',
                        color: '#059669',
                        font: { weight: 'bold' }
                    },
                    ticks: {
                        callback: function(value) {
                            return '₱' + (value / 1000).toFixed(0) + 'k';
                        },
                        color: '#059669'
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Transaction Count',
                        color: '#7c3aed',
                        font: { weight: 'bold' }
                    },
                    ticks: {
                        color: '#7c3aed'
                    },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function initializeTransactionTypeChart(data) {
    const ctx = document.getElementById('typeChart');
    if (!ctx) return;
    
    // Group by transaction type
    const typeStats = data.reduce((acc, row) => {
        const type = row["Transaction Type"] || 'General';
        if (!acc[type]) {
            acc[type] = { count: 0, amount: 0 };
        }
        acc[type].count += parseFloat(row["Total Transaction"] || 0);
        acc[type].amount += parseFloat(row["Total Amount"] || row["Amount"] || 0);
        return acc;
    }, {});
    
    const labels = Object.keys(typeStats);
    const counts = Object.values(typeStats).map(v => v.count);
    const colors = [
        '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', 
        '#ef4444', '#ec4899', '#6366f1', '#14b8a6'
    ];
    
    typeChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        font: { size: 11 },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label}: ${data.datasets[0].data[i].toLocaleString()}`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function showAreaError(message) {
    document.getElementById('areaResults').innerHTML = `
        <div class="alert alert-error"><span>⚠️</span><span>${message}</span></div>
    `;
}

function exportAreaToExcel() {
    if (!currentAreaData || currentAreaData.length === 0) {
        alert('⚠️ No area data available to export. Please search for an area first.');
        return;
    }
    
    const areaName = document.getElementById('areaNameSelect').value;
    const dateFrom = document.getElementById('areaDateFrom').value;
    const dateTo = document.getElementById('areaDateTo').value;
    
    const ws_data = [];
    
    ws_data.push(['Area Analysis Report']);
    ws_data.push(['Generated:', new Date().toLocaleString()]);
    ws_data.push(['Generated By:', currentUser ? (currentUser.agentName || currentUser.username) : 'Unknown']);
    ws_data.push(['Area:', areaName]);
    ws_data.push(['Date Range:', dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : 'All Dates']);
    ws_data.push([]);
    ws_data.push(['Date of Alert', 'Assigned Branch', 'Transaction Type', 'Total Transaction', 'Total Amount', 'Status', 'Cluster', 'Region']);
    
    currentAreaData.forEach(row => {
        ws_data.push([
            row["Date of Alert"] || '',
            row["Assigned Branch"] || '',
            row["Transaction Type"] || '',
            row["Total Transaction"] || 0,
            row["Total Amount"] || row["Amount"] || 0,
            row["Status"] || '',
            row["CLUSTER"] || '',
            row["Region"] || ''
        ]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, "Area Analysis");
    XLSX.writeFile(wb, `Area_Analysis_${areaName}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ============================================
// EXPORT FUNCTIONS
// ============================================
function exportToExcel() {
    if (!globalData || globalData.length === 0) {
        alert('⚠️ No data available to export. Please search for a customer first.');
        return;
    }
    const ws_data = [];
    ws_data.push(['BSP Compliance Monitoring Report']);
    ws_data.push(['Generated:', new Date().toLocaleString()]);
    ws_data.push(['Generated By:', currentUser ? (currentUser.agentName || currentUser.username) : 'Unknown']);
    ws_data.push(['Customer ID:', currentCustomer]);
    ws_data.push(['Customer Name:', globalData[0]["Customer Name"] || '']);
    ws_data.push([]);
    const headers = Object.keys(globalData[0]);
    ws_data.push(headers);
    globalData.forEach(row => ws_data.push(headers.map(h => row[h] || '')));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, "Customer Data");
    XLSX.writeFile(wb, `BSP_Monitoring_${currentCustomer}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportBranchToExcel() {
    if (!currentBranchData || currentBranchData.length === 0) {
        alert('⚠️ No branch data available to export. Please search for a branch first.');
        return;
    }
    
    const branchCode = document.getElementById('branchCode').value.trim().toUpperCase();
    const ws_data = [];
    
    ws_data.push(['Branch Analysis Report']);
    ws_data.push(['Generated:', new Date().toLocaleString()]);
    ws_data.push(['Generated By:', currentUser ? (currentUser.agentName || currentUser.username) : 'Unknown']);
    ws_data.push(['Branch Code:', branchCode]);
    ws_data.push([]);
    ws_data.push(['Date of Alert', 'Assigned Branch', 'Total Transaction', 'Amount', 'Customer ID', 'Customer Name']);
    
    currentBranchData.forEach(row => {
        ws_data.push([
            row["Date of Alert"] || '',
            row["Assigned Branch"] || '',
            row["Total Transaction"] || 0,
            row["Amount"] || 0,
            row["Customer ID"] || '',
            row["Customer Name"] || ''
        ]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, "Branch Data");
    XLSX.writeFile(wb, `Branch_Analysis_${branchCode}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ============================================
// PRINT REPORT
// ============================================
function generateReport() {
    if (!globalData || globalData.length === 0) {
        alert('⚠️ No data available. Please search for a customer first.');
        return;
    }
    const stats = calculateStats(globalData);
    const customerName = globalData[0]["Customer Name"] || "Unknown";
    
    document.getElementById('reportCustomerName').textContent = customerName;
    document.getElementById('reportCustomerId').textContent = currentCustomer;
    document.getElementById('reportDate').textContent = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('reportNumber').textContent = generateReportNumber();
    document.getElementById('reportGeneratedBy').textContent = currentUser ? (currentUser.agentName || currentUser.username) : 'Unknown';
    document.getElementById('reportTotalRecords').textContent = stats.totalRecords;
    document.getElementById('reportTotalAmount').textContent = formatCurrency(stats.totalAmount);
    document.getElementById('reportAmountAssessment').textContent = stats.totalAmount > 1000000 ? 'High Value' : 'Standard';
    document.getElementById('reportHighRisk').textContent = stats.highRisk;
    document.getElementById('reportNormal').textContent = stats.normal;
    
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = globalData.map((row, index) => {
        const isHigh = row["Status"]?.toLowerCase() === "high";
        const assignedTo = row["Assigned To"] || row["Assisgned to"] || '';
        return `<tr><td>${index + 1}</td><td>${formatDate(row["Date of Alert"])}</td><td>${escapeHtml(row["Transaction Type"]) || ''}</td><td>${formatCurrency(row["Amount"])}</td><td style="color: ${isHigh ? 'var(--danger)' : 'var(--success)'}; font-weight: bold;">${escapeHtml(row["Status"]) || ''}</td><td>${escapeHtml(assignedTo)}</td></tr>`;
    }).join('');
    
    window.print();
}

// ============================================
// EVENT LISTENERS - UPDATED
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    checkExistingSession();
    
    document.getElementById('customerId')?.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter') searchCustomer(); 
    });
    document.getElementById('customerNameSearch')?.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter') searchCustomerByName(); 
    });
    document.getElementById('branchCode')?.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter') searchBranch(); 
    });
    document.getElementById('branchCode')?.addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase();
    });
    
    // Area Checker event listeners
    document.getElementById('areaNameSelect')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchArea();
    });
    
    // Add tab change listener to reload dropdown when Area Checker tab is shown
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.id.replace('tab-', '');
            if (tabName === 'areaChecker' && currentUser && !isAreaDropdownLoaded) {
                loadAreaDropdownWithRetry();
            }
        });
    });
    
    document.addEventListener('click', resetSessionTimer);
    document.addEventListener('keypress', resetSessionTimer);
});

function resetSessionTimer() {
    if (currentUser && sessionExpiry) {
        sessionExpiry = Date.now() + SESSION_TIMEOUT;
        sessionStorage.setItem('pgcpi_sessionExpiry', sessionExpiry);
        updateSessionDisplay();
    }
}
