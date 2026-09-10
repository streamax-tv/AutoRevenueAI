const API_BASE = '';

class App {
  constructor() {
    this.token = localStorage.getItem('token');
    this.user = null;
    this.currentTab = 'dashboard';
    this.data = {
      stats: {},
      leads: [],
      inventory: [],
      appointments: [],
      leaks: {}
    };
    this.init();
  }

  async init() {
    const appEl = document.getElementById('app');
    
    if (!this.token) {
      this.showLogin(appEl);
    } else {
      try {
        const meRes = await this.api('GET', '/api/me');
        this.user = meRes.user;
        await this.loadDashboard();
        this.showDashboard(appEl);
      } catch (e) {
        console.error('Auth failed', e);
        this.clearAuth();
        this.showLogin(appEl);
      }
    }
  }

  async api(method, path, body = null) {
    const opts = {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token && { 'authorization': `Bearer ${this.token}` })
      }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${path}`, opts);
    if (res.status === 401) {
      this.clearAuth();
      window.location.reload();
      return;
    }
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  async login(email, password) {
    const res = await this.api('POST', '/api/auth/login', { email, password });
    this.token = res.token;
    this.user = res.user;
    localStorage.setItem('token', this.token);
    return res;
  }

  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
  }

  logout() {
    this.clearAuth();
    location.reload();
  }

  async loadDashboard() {
    try {
      this.data.dashboard = await this.api('GET', '/api/dashboard');
      this.data.leaks = await this.api('GET', '/api/leaks');
    } catch (e) {
      console.error('Load failed', e);
    }
  }

  showLogin(appEl) {
    const html = `
      <div class="login-container">
        <h1>AutoRevenue AI</h1>
        <div id="error-message"></div>
        <form id="login-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="email" placeholder="admin@atlas-cars.ma" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="password" placeholder="admin123" required>
          </div>
          <button type="submit" class="btn">Login</button>
        </form>
      </div>
    `;
    appEl.innerHTML = html;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const errorDiv = document.getElementById('error-message');

      try {
        await this.login(email, password);
        location.reload();
      } catch (e) {
        errorDiv.innerHTML = `<div class="error-message">Invalid credentials</div>`;
      }
    });
  }

  showDashboard(appEl) {
    const dealer = this.data.dashboard?.dealership || {};
    const stats = this.data.dashboard?.stats || {};
    
    const html = `
      <div class="dashboard">
        <div class="navbar">
          <h1>AutoRevenue AI</h1>
          <div class="user-info">
            <span>${this.user?.name} @ ${dealer.name}</span>
            <button class="logout-btn" onclick="app.logout()">Logout</button>
          </div>
        </div>
        <div class="dashboard-content">
          <div class="stats-grid">
            <div class="stat-card">
              <h3>New Leads</h3>
              <div class="value">${stats.newLeads || 0}</div>
            </div>
            <div class="stat-card">
              <h3>Qualified</h3>
              <div class="value">${stats.qualified || 0}</div>
            </div>
            <div class="stat-card">
              <h3>Appointments</h3>
              <div class="value">${stats.appointments || 0}</div>
            </div>
            <div class="stat-card">
              <h3>Available Cars</h3>
              <div class="value">${stats.inventory || 0}</div>
            </div>
            <div class="stat-card">
              <h3>AI Handled</h3>
              <div class="value">${stats.aiHandled || 0}%</div>
            </div>
            <div class="stat-card">
              <h3>Revenue</h3>
              <div class="value">€${(stats.attributedRevenue || 0).toLocaleString()}</div>
            </div>
          </div>

          <div class="tabs">
            <button class="tab active" data-tab="dashboard">Dashboard</button>
            <button class="tab" data-tab="leads">Leads</button>
            <button class="tab" data-tab="inventory">Inventory</button>
            <button class="tab" data-tab="appointments">Appointments</button>
            <button class="tab" data-tab="leaks">Revenue Leaks</button>
          </div>

          <div id="dashboard-tab" class="tab-content active">
            ${this.renderLeaksPreview()}
          </div>

          <div id="leads-tab" class="tab-content">
            ${this.renderLeads()}
          </div>

          <div id="inventory-tab" class="tab-content">
            ${this.renderInventory()}
          </div>

          <div id="appointments-tab" class="tab-content">
            ${this.renderAppointments()}
          </div>

          <div id="leaks-tab" class="tab-content">
            ${this.renderLeaks()}
          </div>
        </div>
      </div>
    `;

    appEl.innerHTML = html;

    // Attach tab click handlers
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        const tabName = e.target.dataset.tab;
        document.getElementById(`${tabName}-tab`).classList.add('active');
      });
    });
  }

  renderLeads() {
    const leads = this.data.dashboard?.leads || [];
    if (leads.length === 0) {
      return '<div class="empty-state"><p>No leads yet</p></div>';
    }

    let html = '<div class="table-container"><table><thead><tr><th>Name</th><th>Phone</th><th>Channel</th><th>Score</th><th>Status</th><th>Budget</th><th>Timeline</th></tr></thead><tbody>';
    leads.forEach(lead => {
      html += `
        <tr>
          <td>${lead.name}</td>
          <td>${lead.phone}</td>
          <td>${lead.channel}</td>
          <td><span class="badge ${lead.score.toLowerCase()}">${lead.score}</span></td>
          <td>${lead.status}</td>
          <td>€${lead.budget ? lead.budget.toLocaleString() : 'N/A'}</td>
          <td>${lead.timeline}</td>
        </tr>
      `;
    });
    html += '</tbody></table></div>';
    return html;
  }

  renderInventory() {
    const inv = this.data.dashboard?.inventory || [];
    if (inv.length === 0) {
      return '<div class="empty-state"><p>No vehicles</p></div>';
    }

    let html = '<div class="table-container"><table><thead><tr><th>Make/Model</th><th>Year</th><th>Km</th><th>Fuel</th><th>Price</th><th>Status</th><th>Stock</th></tr></thead><tbody>';
    inv.forEach(v => {
      html += `
        <tr>
          <td>${v.make} ${v.model}</td>
          <td>${v.year}</td>
          <td>${v.km.toLocaleString()}</td>
          <td>${v.fuel}</td>
          <td>€${v.price.toLocaleString()}</td>
          <td><span class="badge ${v.status.toLowerCase()}">${v.status}</span></td>
          <td>${v.stock}</td>
        </tr>
      `;
    });
    html += '</tbody></table></div>';
    return html;
  }

  renderAppointments() {
    const apts = this.data.dashboard?.appointments || [];
    if (apts.length === 0) {
      return '<div class="empty-state"><p>No appointments</p></div>';
    }

    let html = '<div class="table-container"><table><thead><tr><th>Lead ID</th><th>Vehicle ID</th><th>Start</th><th>Status</th><th>Notes</th></tr></thead><tbody>';
    apts.forEach(a => {
      const start = new Date(a.start).toLocaleString();
      html += `
        <tr>
          <td>${a.leadId}</td>
          <td>${a.vehicleId || 'N/A'}</td>
          <td>${start}</td>
          <td><span class="badge ${a.status.toLowerCase()}">${a.status}</span></td>
          <td>${a.notes}</td>
        </tr>
      `;
    });
    html += '</tbody></table></div>';
    return html;
  }

  renderLeaksPreview() {
    const leaks = this.data.leaks;
    if (!leaks.items || leaks.items.length === 0) {
      return '<div class="empty-state"><p>No revenue leaks detected</p></div>';
    }

    let html = `
      <div class="leak-summary">
        <div>
          <h3>Revenue Leaks Detected</h3>
          <p>${leaks.count} issue${leaks.count !== 1 ? 's' : ''} costing €${leaks.total.toLocaleString()}</p>
        </div>
        <button class="btn" onclick="app.fixAllLeaks()" style="width: auto;">Fix All</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>Type</th><th>Lead</th><th>Estimated Loss</th><th>Action</th></tr></thead>
          <tbody>
    `;

    leaks.items.slice(0, 5).forEach(leak => {
      const lead = this.data.dashboard?.leads.find(l => l.id === leak.leadId);
      html += `
        <tr>
          <td>${leak.type}</td>
          <td>${lead?.name || 'Unknown'}</td>
          <td>€${leak.amount.toLocaleString()}</td>
          <td>${leak.action}</td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    return html;
  }

  renderLeaks() {
    const leaks = this.data.leaks;
    if (!leaks.items || leaks.items.length === 0) {
      return '<div class="empty-state"><p>No revenue leaks</p></div>';
    }

    let html = `
      <div class="leak-summary">
        <div>
          <h3>Total Revenue at Risk</h3>
          <div class="leak-total">€${leaks.total.toLocaleString()}</div>
          <p>${leaks.count} opportunities</p>
        </div>
        <button class="fix-all-btn" onclick="app.fixAllLeaks()">Fix All Leaks</button>
      </div>
    `;

    leaks.items.forEach(leak => {
      const lead = this.data.dashboard?.leads.find(l => l.id === leak.leadId);
      html += `
        <div class="leak-item">
          <div class="leak-details">
            <h4>${leak.type}</h4>
            <p>Lead: <strong>${lead?.name || 'Unknown'}</strong></p>
            <p>Action: ${leak.action}</p>
          </div>
          <div class="leak-amount">€${leak.amount.toLocaleString()}</div>
        </div>
      `;
    });

    return html;
  }

  async fixAllLeaks() {
    try {
      const res = await this.api('POST', '/api/leaks/fix-all');
      this.data.leaks = res.remaining;
      this.showDashboard(document.getElementById('app'));
      alert(`Fixed ${res.fixed} revenue leaks!`);
    } catch (e) {
      alert('Error fixing leaks');
    }
  }
}

const app = new App();

