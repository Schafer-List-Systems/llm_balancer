document.addEventListener('DOMContentLoaded', () => {
  // Initialize API client
  const apiClient = window.apiClient;

  // UI Elements
  const root = document.getElementById('root');
  const loadingContainer = document.querySelector('.loading-container');
  const lastUpdateTime = document.querySelector('.last-update');

  // Create dashboard structure
  function createDashboard() {
    root.innerHTML = `
      <header class="header">
        <div class="header-content">
          <div class="logo">🧠 LLM Balancer</div>
          <div class="header-info">
            <div id="connectionStatus" class="status-badge disconnected">
              <span class="status-dot"></span>
              <span>Connecting...</span>
            </div>
            <div class="last-update">
              Last update: <span id="updateTime">Never</span>
            </div>
          </div>
        </div>
        <button id="refreshButton" class="refresh-button">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 8a6 6 0 0 1 6-6v6l4-4"/>
            <path d="M6 8a6 6 0 0 1 6-6v6l-4-4"/>
          </svg>
          Refresh
        </button>
      </header>

      <main class="main-content">
        <section class="overview-section">
          <div class="card">
            <div class="card-header">
              <div class="card-icon">🖥️</div>
              <span class="card-title">Total Backends</span>
            </div>
            <div class="card-value" id="totalBackends">-</div>
            <div class="card-subtitle">Backends configured</div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-icon" style="background-color: #dcfce7; color: #166534;">💚</div>
              <span class="card-title">Healthy</span>
            </div>
            <div class="card-value" id="healthyBackends">-</div>
            <div class="card-subtitle">Operational backends</div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-icon" style="background-color: #fee2e2; color: #991b1b;">💔</div>
              <span class="card-title">Unhealthy</span>
            </div>
            <div class="card-value" id="unhealthyBackends">-</div>
            <div class="card-subtitle">Failed backends</div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-icon" style="background-color: #fef3c7; color: #92400e;">🔄</div>
              <span class="card-title">Busy</span>
            </div>
            <div class="card-value" id="busyBackends">-</div>
            <div class="card-subtitle">Currently processing</div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-icon" style="background-color: #d1fae5; color: #065f46;">✅</div>
              <span class="card-title">Available</span>
            </div>
            <div class="card-value" id="availableBackends">-</div>
            <div class="card-subtitle">Ready to accept requests</div>
          </div>
        </section>

        <section class="backends-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">Backends</h2>
              <p class="section-description">Individual backend status and metrics</p>
            </div>
          </div>
          <div id="backendsGrid" class="backends-grid">
            <!-- Backend cards will be rendered here -->
          </div>
        </section>

        <section class="backends-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">Statistics</h2>
              <p class="section-description">System-wide statistics and metrics</p>
            </div>
          </div>
          <div id="statsSection" class="stats-section">
            <!-- Stats will be rendered here -->
          </div>
        </section>

        <section class="backends-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">Configuration</h2>
              <p class="section-description">API endpoint URL for your applications</p>
            </div>
          </div>
          <div id="configSection" class="config-section">
            <!-- Configuration will be rendered here -->
          </div>
        </section>
      </main>

      <footer class="footer">
        <p>LLM Balancer Dashboard • Running on port 3080</p>
      </footer>
    `;

    // Add event listener for refresh button
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.addEventListener('click', handleRefresh);
  }

  // Handle refresh button click
  async function handleRefresh() {
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.classList.add('spinning');

    const result = await apiClient.manualRefresh();

    refreshButton.classList.remove('spinning');

    if (result.success) {
      renderDashboard();
      showNotification('Dashboard refreshed successfully', 'success');
    } else {
      showNotification(`Failed to refresh: ${result.error}`, 'error');
    }
  }

  // Render overview statistics
  function renderOverview(healthData) {
    document.getElementById('totalBackends').textContent = healthData.totalBackends || 0;
    document.getElementById('healthyBackends').textContent = healthData.healthyBackends || 0;
    document.getElementById('unhealthyBackends').textContent = healthData.totalBackends - (healthData.healthyBackends || 0);
    document.getElementById('busyBackends').textContent = healthData.busyBackends || 0;
    document.getElementById('availableBackends').textContent = healthData.idleBackends || 0;

    // Update connection status
    const connectionStatus = document.getElementById('connectionStatus');
    if (healthData.hasAvailableBackends) {
      connectionStatus.className = 'status-badge connected';
      connectionStatus.querySelector('span:last-child').textContent = 'Connected';
    } else {
      connectionStatus.className = 'status-badge disconnected';
      connectionStatus.querySelector('span:last-child').textContent = 'No Available Backends';
    }
  }

  // Render backend cards
  function renderBackends(backendsData) {
    const backendsGrid = document.getElementById('backendsGrid');

    if (!backendsData.backends || backendsData.backends.length === 0) {
      backendsGrid.innerHTML = `
        <div class="card">
          <p>No backends configured</p>
        </div>
      `;
      return;
    }

    backendsGrid.innerHTML = backendsData.backends.map(backend => {
      const healthClass = backend.healthy ? 'healthy' : 'unhealthy';
      const healthText = backend.healthy ? 'Healthy' : 'Unhealthy';
      const busyText = backend.busy ? 'Busy' : 'Idle';
      const busyClass = backend.busy ? 'text-warning' : 'text-success';
      const busyBgClass = backend.busy ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';

      return `
        <div class="backend-card">
          <div class="backend-url">${backend.url}</div>
          <div class="backend-info">
            <div class="info-row">
              <span class="info-label">Health</span>
              <span class="health-indicator ${healthClass}">
                ${backend.healthy ? '✓' : '✗'} ${healthText}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">Status</span>
              <span class="info-value">${busyText}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Request Count</span>
              <span class="info-value">${backend.requestCount || 0}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Error Count</span>
              <span class="info-value">${backend.errorCount || 0}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Fail Count</span>
              <span class="info-value">${backend.failCount || 0}</span>
            </div>
          </div>
          ${backend.models && backend.models.length > 0 ? `
            <div class="models-list">
              ${backend.models.map(model => `
                <span class="model-tag">${model}</span>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // Render statistics section
  function renderStats(statsData) {
    const statsSection = document.getElementById('statsSection');

    if (!statsData) {
      statsSection.innerHTML = '<p>Statistics not available</p>';
      return;
    }

    const { balancer, healthCheck, config } = statsData;

    statsSection.innerHTML = `
      <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Health Check Interval</span>
          </div>
          <div class="card-value">${(config.healthCheckInterval / 1000).toFixed(1)}s</div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Last Health Check</span>
          </div>
          <div class="card-value" style="font-size: 1.25rem;">
            ${healthCheck.lastCheck ? new Date(healthCheck.lastCheck).toLocaleString() : 'Never'}
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Consecutive Failures</span>
          </div>
          <div class="card-value" style="font-size: 1.25rem; color: ${healthCheck.consecutiveFailures > 0 ? 'var(--danger-color)' : 'var(--success-color)'};">
            ${healthCheck.consecutiveFailures || 0}
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Max Payload Size</span>
          </div>
          <div class="card-value">${config.maxPayloadSizeMB} MB</div>
        </div>
      </div>
    `;
  }

  function renderConfig() {
    const configSection = document.getElementById('configSection');

    const frontendUrl = 'http://localhost:3080';
    const apiUrl = 'http://localhost:3001';

    configSection.innerHTML = `
      <div class="config-container">
        <div class="config-card">
          <div class="config-label">Frontend URL (for dashboard)</div>
          <div class="config-value">${frontendUrl}</div>
        </div>

        <div class="config-card">
          <div class="config-label">API Base URL (backend)</div>
          <div class="config-value">${apiUrl}</div>
        </div>

        <div class="config-card config-card--wide">
          <div class="config-label">Application Configuration</div>
          <div class="config-url">${frontendUrl}/api</div>
          <div class="config-instructions">
            <p>Configure your applications to use:</p>
            <code>BASE_URL=${frontendUrl}/api</code>
          </div>
        </div>
      </div>
    `;
  }

  // Update last update time
  function updateLastUpdateTime(lastUpdateTime) {
    if (lastUpdateTime) {
      document.getElementById('updateTime').textContent = new Date(lastUpdateTime).toLocaleString();
    }
  }

  // Show notification
  function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 1rem;
      right: 1rem;
      padding: 1rem 1.5rem;
      background-color: ${type === 'success' ? '#dcfce7' : '#fee2e2'};
      color: ${type === 'success' ? '#166534' : '#991b1b'};
      border-radius: 0.5rem;
      box-shadow: var(--shadow-md);
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Render dashboard with data
  function renderDashboard() {
    const data = apiClient.getData();

    if (!data) {
      return;
    }

    renderOverview(data.health);
    renderBackends(data.backends);
    renderStats(data.stats);
    renderConfig();
    updateLastUpdateTime(apiClient.getLastUpdateTime());
  }

  // Initialize
  async function init() {
    createDashboard();

    // Ensure apiClient is loaded

    if (!window.apiClient) {
      loadingContainer.innerHTML = '<p>Error: API client not loaded</p>';
      return;
    }

    const apiClient = window.apiClient;

    // Start polling

    // Initial data fetch
    const [healthData, statsData, backendsData] = await Promise.all([
      apiClient.getHealth(),
      apiClient.getStats(),
      apiClient.getBackends()
    ]);

    if (healthData.success && statsData.success && backendsData.success) {
      const data = {
        health: healthData.data,
        stats: statsData.data,
        backends: backendsData.data
      };

      apiClient.dataCache = data;

      renderDashboard();
      updateLastUpdateTime(apiClient.getLastUpdateTime());

      loadingContainer.style.display = 'none';

      // Start polling for automatic refresh
      apiClient.setUpdateCallback((updatedData) => {
        renderDashboard();
        updateLastUpdateTime(new Date());
      });
      apiClient.startPolling();
    } else {
      showNotification('Failed to load dashboard data', 'error');
    }
  }

  // Start the dashboard
  init();
});