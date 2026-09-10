// AutoRevenue AI Frontend
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('root');
  
  try {
    // Fetch health status
    const healthRes = await fetch('/api/health');
    const health = await healthRes.json();
    
    // Render the dashboard
    root.innerHTML = `
      <div class="container">
        <div class="header">
          <h1>🚗 AutoRevenue AI</h1>
          <p>AI-Powered Automotive Sales Platform</p>
        </div>
        <div class="content">
          <div class="status-grid">
            <div class="stat-card">
              <div class="stat-value">92</div>
              <div class="stat-label">AI Handled</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">€186k</div>
              <div class="stat-label">Attributed Revenue</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">98%</div>
              <div class="stat-label">Response Rate</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">v${health.version}</div>
              <div class="stat-label">API Version</div>
            </div>
          </div>
          
          <div class="info-section">
            <h3>🔧 System Status</h3>
            <div class="info-item">
              <span class="info-label">API Health</span>
              <span><span class="health-indicator"></span>Operational</span>
            </div>
            <div class="info-item">
              <span class="info-label">Server Time</span>
              <span class="info-value">${new Date(health.time).toLocaleString()}</span>
            </div>
            <div class="info-item">
              <span class="info-label">AI Engine</span>
              <span>${health.ai ? '✓ Enabled' : '✗ Disabled'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">WhatsApp Integration</span>
              <span>${health.whatsapp ? '✓ Enabled' : '✗ Disabled'}</span>
            </div>
          </div>
          
          <div style="text-align: center;">
            <p style="color: #6c757d; margin-top: 20px; font-size: 0.95rem;">
              Frontend files are now properly served. Log in to access the full dashboard.
            </p>
          </div>
        </div>
        <div class="footer">
          <p>AutoRevenue AI • Dealership Sales Intelligence Platform</p>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Failed to fetch health status:', error);
    root.innerHTML = `
      <div class="container">
        <div class="header">
          <h1>⚠️ Connection Error</h1>
          <p>Unable to connect to API</p>
        </div>
        <div class="content">
          <p style="color: #6c757d;">Please check that the server is running and try again.</p>
        </div>
      </div>
    `;
  }
});

