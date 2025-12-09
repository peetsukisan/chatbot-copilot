/**
 * Admin Dashboard Main Application
 */

// State
let socket = null;
let currentPage = 'dashboard';
let selectedChat = null;
let charts = {};
let liveChats = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    initNavigation();
    initEventListeners();
    loadDashboard();
    startClock();

    // Check API config
    if (!API.token) {
        showConfigModal();
    }
});

// Socket.io Connection
function initSocket() {
    try {
        socket = io(API.baseUrl);

        socket.on('connect', () => {
            console.log('Socket connected');
            socket.emit('join-admin');
        });

        socket.on('new-message', (data) => {
            addLiveChat(data);
            showToast(`New message from customer`, 'info');
        });

        socket.on('staff-required', (data) => {
            addLiveChat(data);
            updateNotificationCount(1);
            showToast(`Staff assistance needed`, 'warning');
        });

        socket.on('escalation-needed', (data) => {
            addLiveChat({ ...data, priority: 'high' });
            updateNotificationCount(1);
            showToast(`⚠️ Escalation: ${data.reason}`, 'error');
        });

        socket.on('ai-response', (data) => {
            updateChatWithAI(data);
        });

        socket.on('daily-report-generated', (data) => {
            showToast('Daily report generated!', 'success');
        });

    } catch (error) {
        console.error('Socket connection failed:', error);
    }
}

// Navigation
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    currentPage = page;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });

    // Update title
    const titles = {
        'dashboard': 'Dashboard',
        'pending': 'Pending Messages',
        'live-chats': 'Live Chats',
        'customers': 'Customers',
        'analytics': 'Analytics',
        'reports': 'Reports',
        'menu-editor': 'Menu Editor',
        'campaigns': 'Campaigns'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    // Load page data
    loadPageData(page);
}

async function loadPageData(page) {
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'pending': loadPending(); break;
        case 'live-chats': loadLiveChats(); break;
        case 'customers': loadCustomers(); break;
        case 'analytics': loadAnalytics(); break;
        case 'reports': loadReports(); break;
        case 'menu-editor': loadMenuEditor(); break;
        case 'campaigns': loadCampaigns(); break;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const { data } = await API.getDashboard();

        // Update stats
        document.getElementById('stat-messages').textContent = data.messages.total || 0;
        document.getElementById('stat-ai-handled').textContent =
            `${data.messages.fromAI || 0} (${Math.round((data.messages.fromAI / data.messages.total) * 100) || 0}%)`;
        document.getElementById('stat-customers').textContent = data.customers.activeToday || 0;
        document.getElementById('stat-confidence').textContent = `${data.messages.avgAIConfidence || 0}%`;

        // Update business status
        updateBusinessStatus(data.businessHours);

        // Load charts
        loadDashboardCharts();

    } catch (error) {
        showToast('Failed to load dashboard', 'error');
    }
}

async function loadDashboardCharts() {
    try {
        // Messages chart
        const dailyData = await API.getDaily(7);
        renderMessagesChart(dailyData.data);

        // Intents chart
        const intentsData = await API.getIntents('7d');
        renderIntentsChart(intentsData.data);

    } catch (error) {
        console.error('Chart loading failed:', error);
    }
}

function renderMessagesChart(data) {
    const ctx = document.getElementById('messages-chart');
    if (!ctx) return;

    if (charts.messages) charts.messages.destroy();

    charts.messages = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date),
            datasets: [{
                label: 'Messages',
                data: data.map(d => d.total),
                borderColor: '#1da1f2',
                backgroundColor: 'rgba(29, 161, 242, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#2f3b4a' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderIntentsChart(data) {
    const ctx = document.getElementById('intents-chart');
    if (!ctx) return;

    if (charts.intents) charts.intents.destroy();

    const colors = ['#1da1f2', '#9b59b6', '#17bf63', '#ffad1f', '#e0245e'];

    charts.intents = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.slice(0, 5).map(d => d.intent),
            datasets: [{
                data: data.slice(0, 5).map(d => d.count),
                backgroundColor: colors
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// Live Chats
function addLiveChat(data) {
    const existing = liveChats.find(c => c.senderId === data.senderId);
    if (existing) {
        existing.lastMessage = data.messageText;
        existing.timestamp = data.timestamp;
    } else {
        liveChats.unshift(data);
    }

    renderLiveChats();
    updateLiveChatCount();
}

function renderLiveChats() {
    const container = document.getElementById('chat-list');
    if (!container) return;

    if (liveChats.length === 0) {
        container.innerHTML = '<div class="empty-state">No active chats</div>';
        return;
    }

    container.innerHTML = liveChats.map(chat => `
    <div class="chat-item ${selectedChat === chat.senderId ? 'active' : ''}" 
         onclick="selectChat('${chat.senderId}')">
      <div class="chat-item-header">
        <span class="chat-name">${chat.customerInfo?.name || 'Customer'}</span>
        <span class="chat-time">${formatTime(chat.timestamp)}</span>
      </div>
      <div class="chat-preview">${chat.messageText || chat.lastMessage || ''}</div>
    </div>
  `).join('');
}

async function selectChat(senderId) {
    selectedChat = senderId;
    renderLiveChats();

    // Update header
    const chat = liveChats.find(c => c.senderId === senderId);
    const header = document.getElementById('chat-header');
    header.innerHTML = `<span>${chat?.customerInfo?.name || 'Customer'}</span>`;

    // Show loading
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="loading">Loading messages...</div>';

    try {
        const { data } = await API.getChatHistory(senderId);

        if (data && data.length > 0) {
            renderChatMessages(data);
        } else {
            container.innerHTML = '<div class="empty-state">No messages yet</div>';
        }

        // Load quick replies if available
        if (chat?.suggestedReplies) {
            renderQuickReplies(chat.suggestedReplies);
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
        container.innerHTML = '<div class="error-state">Failed to load messages. Check console for details.</div>';
        showToast('Failed to load chat history', 'error');
    }
}

function renderChatMessages(messages) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = messages.map(msg => `
    <div class="message ${msg.sender}">
      ${msg.text}
    </div>
  `).join('');
    container.scrollTop = container.scrollHeight;
}

function renderQuickReplies(replies) {
    const container = document.getElementById('quick-replies');
    container.innerHTML = replies.map(reply => `
    <button class="quick-reply-btn" onclick="useQuickReply('${escapeHtml(reply.text)}')">
      ${reply.text}
    </button>
  `).join('');
}

function useQuickReply(text) {
    document.getElementById('reply-input').value = text;
}

async function sendReply() {
    const input = document.getElementById('reply-input');
    const text = input.value.trim();

    if (!text || !selectedChat) return;

    try {
        await API.sendReply(selectedChat, text, 'admin');
        input.value = '';

        // Add to chat
        const container = document.getElementById('chat-messages');
        container.innerHTML += `<div class="message staff">${text}</div>`;
        container.scrollTop = container.scrollHeight;

        showToast('Reply sent', 'success');
    } catch (error) {
        showToast('Failed to send reply', 'error');
    }
}

// Customers
async function loadCustomers() {
    try {
        const search = document.getElementById('customer-search')?.value || '';
        const { data } = await API.getCustomers({ search, limit: 50 });

        const container = document.getElementById('customers-table');
        container.innerHTML = `
      <div class="table-row header">
        <div>Name</div>
        <div>Last Contact</div>
        <div>Conversations</div>
        <div>Intents</div>
        <div>Actions</div>
      </div>
      ${data.map(c => `
        <div class="table-row">
          <div>${c.name || c.fb_user_id}</div>
          <div>${formatDate(c.last_contact)}</div>
          <div>${c.total_conversations || 0}</div>
          <div>${(c.detectedIntents || []).slice(0, 2).join(', ')}</div>
          <div><button onclick="viewCustomer('${c.fb_user_id}')" class="btn-primary" style="padding: 6px 12px; font-size: 12px;">View</button></div>
        </div>
      `).join('')}
    `;
    } catch (error) {
        showToast('Failed to load customers', 'error');
    }
}

// Analytics
async function loadAnalytics() {
    try {
        const [daily, hourly, trends] = await Promise.all([
            API.getDaily(30),
            API.getHourly('7d'),
            API.getTrends('7d')
        ]);

        renderDailyChart(daily.data);
        renderHourlyChart(hourly.data);
        renderTrends(trends.data);
    } catch (error) {
        showToast('Failed to load analytics', 'error');
    }
}

function renderDailyChart(data) {
    const ctx = document.getElementById('daily-chart');
    if (!ctx) return;

    if (charts.daily) charts.daily.destroy();

    charts.daily = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.date),
            datasets: [
                { label: 'Customer', data: data.map(d => d.customer), backgroundColor: '#1da1f2' },
                { label: 'AI', data: data.map(d => d.ai), backgroundColor: '#9b59b6' },
                { label: 'Staff', data: data.map(d => d.staff), backgroundColor: '#17bf63' }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { stacked: true, grid: { color: '#2f3b4a' } },
                x: { stacked: true, grid: { display: false } }
            }
        }
    });
}

function renderHourlyChart(data) {
    const ctx = document.getElementById('hourly-chart');
    if (!ctx) return;

    if (charts.hourly) charts.hourly.destroy();

    charts.hourly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => `${d.hour}:00`),
            datasets: [{
                label: 'Messages',
                data: data.map(d => d.count),
                backgroundColor: '#1da1f2'
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } }
        }
    });
}

function renderTrends(data) {
    const container = document.getElementById('trends-content');
    if (!container) return;

    container.innerHTML = `
    <div style="margin-bottom: 16px;">
      <strong>Top Topics:</strong>
      <ul style="margin-top: 8px; padding-left: 20px;">
        ${(data.topTopics || []).slice(0, 5).map(t =>
        `<li>${t.intent}: ${t.count} (${t.percentage}%)</li>`
    ).join('')}
      </ul>
    </div>
    <div>
      <strong>Suggested FAQs:</strong>
      <ul style="margin-top: 8px; padding-left: 20px;">
        ${(data.suggestedFAQs || []).slice(0, 3).map(f =>
        `<li><strong>${f.question}</strong><br><span style="color: var(--text-secondary)">${f.answer}</span></li>`
    ).join('')}
      </ul>
    </div>
  `;
}

// Reports
async function loadReports() {
    try {
        const { data } = await API.getReports(7);

        const container = document.getElementById('reports-list');
        container.innerHTML = data.map(r => `
      <div class="report-card" onclick="viewReport('${r.date}')">
        <div style="display: flex; justify-content: space-between;">
          <strong>${r.displayDate}</strong>
          <span style="color: var(--text-muted)">${r.summary?.totalMessages || 0} messages</span>
        </div>
        <div style="margin-top: 8px; color: var(--text-secondary);">
          AI: ${r.summary?.aiHandledPercent || 0}% | Escalations: ${r.escalations?.total || 0}
        </div>
      </div>
    `).join('');
    } catch (error) {
        showToast('Failed to load reports', 'error');
    }
}

async function viewReport(date) {
    try {
        const { data } = await API.getReport(date);

        const detail = document.getElementById('report-detail');
        detail.innerHTML = `
      <h2 style="margin-bottom: 16px;">${data.displayDate} Report</h2>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-value">${data.summary.totalMessages}</div>
          <div class="stat-label">Messages</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.summary.aiHandledPercent}%</div>
          <div class="stat-label">AI Handled</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.escalations.total}</div>
          <div class="stat-label">Escalations</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.summary.customerSatisfaction}</div>
          <div class="stat-label">Satisfaction</div>
        </div>
      </div>
      <h3>Recommendations</h3>
      <ul style="margin-top: 8px;">
        ${(data.recommendations || []).map(r => `<li>${r.title}: ${r.description}</li>`).join('')}
      </ul>
    `;
    } catch (error) {
        showToast('Failed to load report', 'error');
    }
}

// Menu Editor
async function loadMenuEditor() {
    try {
        const { data } = await API.getMenuOptions();

        const container = document.getElementById('menu-options-list');
        container.innerHTML = data.map(opt => `
      <div class="menu-option-card">
        <span class="menu-drag-handle">⋮⋮</span>
        <span class="menu-emoji">${opt.emoji}</span>
        <div class="menu-info">
          <div class="menu-text">${opt.text}</div>
          <div class="menu-keywords">Keywords: ${opt.keywords.join(', ') || 'None'}</div>
        </div>
        <button onclick="editMenuOption(${opt.id})" style="background: none; border: none; color: var(--accent-primary); cursor: pointer;">Edit</button>
      </div>
    `).join('');
    } catch (error) {
        showToast('Failed to load menu options', 'error');
    }
}

// Campaigns
async function loadCampaigns() {
    // Placeholder - would load from API
    document.getElementById('campaigns-list').innerHTML = '<p>Wake-up campaigns configuration coming soon...</p>';
}

// Pending Messages (Test Mode)
async function loadPending() {
    try {
        const { data, stats, testMode } = await API.getPending();

        // Update stats
        document.getElementById('stat-pending').textContent = stats.pending || 0;
        document.getElementById('stat-approved').textContent = stats.approved || 0;
        document.getElementById('stat-sent').textContent = stats.sent || 0;
        document.getElementById('pending-count').textContent = stats.pending || 0;

        // Update test mode banner
        const banner = document.getElementById('test-mode-banner');
        const toggleBtn = document.getElementById('toggle-test-mode');
        if (testMode) {
            banner.classList.add('active');
            toggleBtn.textContent = 'Disable Test Mode';
        } else {
            banner.classList.remove('active');
            toggleBtn.textContent = 'Enable Test Mode';
        }

        // Render pending messages
        const container = document.getElementById('pending-list');
        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state">No pending messages</div>';
            return;
        }

        container.innerHTML = data.map(msg => `
            <div class="pending-card" data-id="${msg.id}">
                <div class="pending-header">
                    <span class="pending-recipient">${msg.customer_name || msg.recipient_id}</span>
                    <span class="pending-source ${msg.source}">${msg.source}</span>
                    <span class="pending-time">${formatTime(msg.created_at)}</span>
                </div>
                <div class="pending-message">${msg.message}</div>
                <div class="pending-actions">
                    <button class="btn-approve" onclick="approvePendingMsg('${msg.id}')">✓ Approve</button>
                    <button class="btn-reject" onclick="rejectPendingMsg('${msg.id}')">✗ Reject</button>
                    ${msg.status === 'approved' ?
                `<button class="btn-send" onclick="sendPendingMsg('${msg.id}')">📤 Send Now</button>` : ''}
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Failed to load pending:', error);
        showToast('Failed to load pending messages', 'error');
    }
}

async function approvePendingMsg(id) {
    try {
        await API.approvePending(id);
        showToast('Message approved', 'success');
        loadPending();
    } catch (error) {
        showToast('Failed to approve message', 'error');
    }
}

async function rejectPendingMsg(id) {
    try {
        await API.rejectPending(id);
        showToast('Message rejected', 'success');
        loadPending();
    } catch (error) {
        showToast('Failed to reject message', 'error');
    }
}

async function sendPendingMsg(id) {
    try {
        await API.sendPending(id);
        showToast('Message sent!', 'success');
        loadPending();
    } catch (error) {
        showToast('Failed to send message', 'error');
    }
}

async function sendAllApproved() {
    try {
        const result = await API.sendAllPending();
        showToast(result.message, 'success');
        loadPending();
    } catch (error) {
        showToast('Failed to send messages', 'error');
    }
}

async function toggleTestMode() {
    try {
        const { testMode } = await API.getTestMode();
        await API.setTestMode(!testMode);
        showToast(`Test mode ${!testMode ? 'enabled' : 'disabled'}`, 'info');
        loadPending();
    } catch (error) {
        showToast('Failed to toggle test mode', 'error');
    }
}

// Event Listeners
function initEventListeners() {
    // Send reply
    document.getElementById('send-reply-btn')?.addEventListener('click', sendReply);
    document.getElementById('reply-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendReply();
        }
    });

    // Customer search
    document.getElementById('customer-search')?.addEventListener('input', debounce(loadCustomers, 300));

    // Modal close
    document.getElementById('modal-close')?.addEventListener('click', () => {
        document.getElementById('modal-overlay').classList.remove('active');
    });

    // Click outside modal
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') {
            e.target.classList.remove('active');
        }
    });

    // Pending page buttons
    document.getElementById('toggle-test-mode')?.addEventListener('click', toggleTestMode);
    document.getElementById('send-approved-btn')?.addEventListener('click', sendAllApproved);
}

// Utilities
function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('th-TH');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);
}

function updateNotificationCount(add = 0) {
    const el = document.getElementById('notification-count');
    const current = parseInt(el.textContent) || 0;
    el.textContent = current + add;
}

function updateLiveChatCount() {
    document.getElementById('live-chat-count').textContent = liveChats.length;
}

function updateBusinessStatus(status) {
    const el = document.getElementById('business-status');
    const dot = el.querySelector('.status-dot');
    const text = el.querySelector('.status-text');

    if (status.isOpen) {
        dot.classList.remove('closed');
        text.textContent = 'Open (10:00-22:00)';
    } else {
        dot.classList.add('closed');
        text.textContent = 'Closed (AI Active)';
    }
}

function startClock() {
    const updateTime = () => {
        const now = new Date();
        document.getElementById('server-time').textContent =
            now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    };
    updateTime();
    setInterval(updateTime, 1000);
}

async function loadLiveChats() {
    try {
        // Load existing chats from API if liveChats is empty
        if (liveChats.length === 0) {
            const { data } = await API.getChats({ limit: 50, since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() });

            // Group messages by sender
            const chatsBySender = {};
            data.forEach(msg => {
                if (!chatsBySender[msg.sender_id]) {
                    chatsBySender[msg.sender_id] = {
                        senderId: msg.sender_id,
                        messageText: msg.text,
                        timestamp: msg.created_at,
                        customerInfo: { name: msg.customer_name || 'Customer' }
                    };
                } else {
                    // Update with most recent message
                    if (new Date(msg.created_at) > new Date(chatsBySender[msg.sender_id].timestamp)) {
                        chatsBySender[msg.sender_id].messageText = msg.text;
                        chatsBySender[msg.sender_id].timestamp = msg.created_at;
                    }
                }
            });

            liveChats = Object.values(chatsBySender).sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            );
        }

        renderLiveChats();
        updateLiveChatCount();
    } catch (error) {
        console.error('Failed to load chats:', error);
        showToast('Failed to load chats', 'error');
        renderLiveChats();
    }
}

function updateChatWithAI(data) {
    if (selectedChat === data.senderId) {
        const container = document.getElementById('chat-messages');
        container.innerHTML += `<div class="message ai">${data.aiResponse}</div>`;
        container.scrollTop = container.scrollHeight;
    }
}

function viewCustomer(id) {
    // Navigate to customer detail
    showToast('Customer view: ' + id, 'info');
}

function editMenuOption(id) {
    showToast('Edit menu option: ' + id, 'info');
}
