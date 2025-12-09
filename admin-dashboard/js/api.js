/**
 * API Client for Admin Dashboard
 * Handles all API calls to backend
 */

const API = {
    baseUrl: localStorage.getItem('apiUrl') || 'http://localhost:3000',
    token: localStorage.getItem('apiToken') || '',

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            ...options.headers
        };

        try {
            const response = await fetch(url, { ...options, headers });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // Dashboard
    getDashboard: () => API.request('/api/admin/dashboard'),

    // Analytics
    getTrends: (period = '7d') => API.request(`/api/admin/analytics/trends?period=${period}`),
    getIntents: (period = '7d') => API.request(`/api/admin/analytics/intents?period=${period}`),
    getHourly: (period = '7d') => API.request(`/api/admin/analytics/hourly?period=${period}`),
    getDaily: (days = 30) => API.request(`/api/admin/analytics/daily?days=${days}`),

    // Customers
    getCustomers: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return API.request(`/api/customers?${query}`);
    },
    getCustomer: (id) => API.request(`/api/customers/${id}`),
    updateCustomer: (id, data) => API.request(`/api/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),

    // Chats
    getChats: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return API.request(`/api/chats?${query}`);
    },
    getChatHistory: (senderId) => API.request(`/api/chats/${senderId}`),
    sendReply: (senderId, text, staffId) => API.request(`/api/chats/${senderId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text, staffId })
    }),

    // Menu Options
    getMenuOptions: () => API.request('/api/admin/menu'),
    createMenuOption: (data) => API.request('/api/admin/menu', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateMenuOption: (id, data) => API.request(`/api/admin/menu/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    deleteMenuOption: (id) => API.request(`/api/admin/menu/${id}`, {
        method: 'DELETE'
    }),

    // Reports
    getReports: (limit = 7) => API.request(`/api/reports?limit=${limit}`),
    getReport: (date) => API.request(`/api/reports/${date}`),
    generateReport: (date) => API.request('/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ date })
    }),

    // Settings
    getSettings: () => API.request('/api/admin/settings'),

    // Pending Messages (Test Mode)
    getPending: (status = 'pending') => API.request(`/api/pending?status=${status}`),
    getPendingStats: () => API.request('/api/pending/stats'),
    approvePending: (id) => API.request(`/api/pending/${id}/approve`, { method: 'POST' }),
    rejectPending: (id) => API.request(`/api/pending/${id}/reject`, { method: 'POST' }),
    sendPending: (id) => API.request(`/api/pending/${id}/send`, { method: 'POST' }),
    sendAllPending: () => API.request('/api/pending/send-all', { method: 'POST' }),
    getTestMode: () => API.request('/api/pending/test-mode'),
    setTestMode: (enabled) => API.request('/api/pending/test-mode', {
        method: 'POST',
        body: JSON.stringify({ enabled })
    })
};

// Config functions
function setApiConfig(url, token) {
    API.baseUrl = url;
    API.token = token;
    localStorage.setItem('apiUrl', url);
    localStorage.setItem('apiToken', token);
}

function showConfigModal() {
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const footer = document.getElementById('modal-footer');

    title.textContent = 'API Configuration';
    body.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">API URL</label>
        <input type="text" id="config-url" value="${API.baseUrl}" 
          style="width: 100%; padding: 12px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 8px; color: white;">
      </div>
      <div>
        <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">API Token</label>
        <input type="password" id="config-token" value="${API.token}"
          style="width: 100%; padding: 12px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 8px; color: white;">
      </div>
    </div>
  `;
    footer.innerHTML = `
    <button class="btn-primary" onclick="saveConfig()">Save</button>
  `;

    modal.classList.add('active');
}

function saveConfig() {
    const url = document.getElementById('config-url').value;
    const token = document.getElementById('config-token').value;
    setApiConfig(url, token);
    document.getElementById('modal-overlay').classList.remove('active');
    location.reload();
}
