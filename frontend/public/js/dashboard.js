document.addEventListener('DOMContentLoaded', () => {
  // Initialize API client
  const apiClient = window.apiClient;

  // UI Elements
  const root = document.getElementById('root');
  const loadingContainer = document.querySelector('.loading-container');
  const lastUpdateTime = document.querySelector('.last-update');

  // Token speed indicator
  let tokenSpeedIndicator = null;

  /**
   * Show token speed indicator during streaming
   * @param {number} tokenSpeed - Current token speed in tokens per second
   */
  function showTokenSpeedIndicator(tokenSpeed) {
    if (!tokenSpeedIndicator) {
      tokenSpeedIndicator = document.createElement('div');
      tokenSpeedIndicator.id = 'tokenSpeedIndicator';
      tokenSpeedIndicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 1000;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
      `;
      document.body.appendChild(tokenSpeedIndicator);
    }

    tokenSpeedIndicator.innerHTML = `
      <span style="font-size: 18px;">⚡</span>
      <span id="tokenSpeedValue">${tokenSpeed}</span>
      <span style="font-size: 12px; opacity: 0.8;">tokens/sec</span>
    `;
  }

  /**
   * Hide token speed indicator
   */
  function hideTokenSpeedIndicator() {
    if (tokenSpeedIndicator) {
      tokenSpeedIndicator.remove();
      tokenSpeedIndicator = null;
    }
  }

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
          <div class="card horizontal">
            <div class="card-icon">🖥️</div>
            <div class="card-content">
              <span class="card-title" id="totalBackends">-</span>
              <span class="card-subtitle">Total Backends</span>
            </div>
          </div>

          <div class="card horizontal">
            <div class="card-icon" style="background-color: #dcfce7; color: #166534;">💚</div>
            <div class="card-content">
              <span class="card-title" id="healthyBackends">-</span>
              <span class="card-subtitle">Healthy</span>
            </div>
          </div>

          <div class="card horizontal">
            <div class="card-icon" style="background-color: #fee2e2; color: #991b1b;">💔</div>
            <div class="card-content">
              <span class="card-title" id="unhealthyBackends">-</span>
              <span class="card-subtitle">Unhealthy</span>
            </div>
          </div>

          <div class="card horizontal">
            <div class="card-icon" style="background-color: #fef3c7; color: #92400e;">🔄</div>
            <div class="card-content">
              <span class="card-title" id="busyBackends">-</span>
              <span class="card-subtitle">Busy</span>
            </div>
          </div>

          <div class="card horizontal">
            <div class="card-icon" style="background-color: #d1fae5; color: #065f46;">✅</div>
            <div class="card-content">
              <span class="card-title" id="availableBackends">-</span>
              <span class="card-subtitle">Available</span>
            </div>
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

        <section class="backends-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">Debug</h2>
              <p class="section-description">Request/response content tracking and debugging</p>
            </div>
            <button id="toggleDebug" class="toggle-button">Show Debug</button>
          </div>
          <div id="debugSection" class="debug-section" style="display: none;">
            <div class="debug-stats">
              <div class="debug-stat-item">
                <span class="debug-stat-label">Enabled</span>
                <span class="debug-stat-value" id="debugEnabled">-</span>
              </div>
              <div class="debug-stat-item">
                <span class="debug-stat-label">Total Requests</span>
                <span class="debug-stat-value" id="debugTotalRequests">-</span>
              </div>
            </div>

            <div class="debug-controls">
              <input type="text" id="backendFilter" placeholder="Filter by backend ID..." class="input-field">
              <select id="requestLimit" class="select-field">
                <option value="10">10 requests</option>
                <option value="25">25 requests</option>
                <option value="50" selected>50 requests</option>
                <option value="100">100 requests</option>
              </select>
              <button id="expandAll" class="button button-secondary" title="Expand all sections">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 4v2h12V4H2z"/>
                  <path d="M2 8v2h12V8H2z"/>
                  <path d="M2 12v2h12v-2H2z"/>
                </svg>
                Expand All
              </button>
              <button id="collapseAll" class="button button-secondary" title="Collapse all sections">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 2h8v12H4z"/>
                </svg>
                Collapse All
              </button>
              <button id="refreshDebug" class="button button-secondary">Refresh</button>
              <button id="clearDebug" class="button button-danger">Clear History</button>
            </div>

            <div id="debugRequestsContainer" class="debug-requests-container">
              <p class="debug-empty">Loading debug data...</p>
            </div>
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
    if (healthData.hasHealthyBackends) {
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
      const busyText = backend.activeRequestCount > 0 ? 'Busy' : 'Idle';
      const busyBgClass = backend.activeRequestCount > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';

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
              <span class="info-label">Concurrency</span>
              <span class="info-value">${backend.activeRequestCount || 0}/${backend.maxConcurrency || 0}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Requests</span>
              <span class="info-value">${backend.requestCount || 0}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Errors</span>
              <span class="info-value ${backend.errorCount > 0 ? 'text-danger' : ''}">${backend.errorCount || 0}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Fails</span>
              <span class="info-value ${backend.failCount > 0 ? 'text-danger' : ''}">${backend.failCount || 0}</span>
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
          <div class="card-value" style="font-size: 1rem;">${(config.healthCheckInterval / 1000).toFixed(1)}s</div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Last Health Check</span>
          </div>
          <div class="card-value" style="font-size: 1rem;">
            ${healthCheck.lastCheck ? new Date(healthCheck.lastCheck).toLocaleString() : 'Never'}
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Consecutive Failures</span>
          </div>
          <div class="card-value" style="font-size: 1rem; color: ${healthCheck.consecutiveFailures > 0 ? 'var(--danger-color)' : 'var(--success-color)'};">
            ${healthCheck.consecutiveFailures || 0}
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Max Payload Size</span>
          </div>
          <div class="card-value" style="font-size: 1rem;">${config.maxPayloadSizeMB} MB</div>
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
        <div class="config-card" style="flex: 1; min-width: 250px;">
          <div class="config-label">Frontend URL</div>
          <div class="config-url">${frontendUrl}</div>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Dashboard access point</p>
        </div>

        <div class="config-card" style="flex: 1; min-width: 250px;">
          <div class="config-label">API Base URL</div>
          <div class="config-url">${apiUrl}</div>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Load balancer endpoint for Ollama/Anthropic APIs</p>
        </div>

        <div class="config-card" style="flex: 1; min-width: 250px;">
          <div class="config-label">Application Integration</div>
          <div class="config-url">${frontendUrl}/api</div>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Set your app's BASE_URL to this endpoint</p>
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

  // Show token speed indicator
  function showTokenSpeedIndicator(tokenSpeed) {
    let indicator = document.getElementById('tokenSpeedIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'tokenSpeedIndicator';
      indicator.className = 'token-speed-indicator';
      indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 1000;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      document.body.appendChild(indicator);
    }

    indicator.innerHTML = `
      <span style="font-size: 18px;">⚡</span>
      <span id="tokenSpeedValue">${tokenSpeed}</span>
      <span style="font-size: 12px; opacity: 0.8;">tokens/sec</span>
    `;
  }

  // Hide token speed indicator
  function hideTokenSpeedIndicator() {
    const indicator = document.getElementById('tokenSpeedIndicator');
    if (indicator) {
      indicator.remove();
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

  // Render queue statistics
  function renderQueueStats(queueStats) {
    const statsSection = document.getElementById('statsSection');
    const statsGrid = statsSection.querySelector('.stats-grid');

    if (!queueStats || !statsGrid) return;

    // Aggregate queue stats from per-priority queues
    const pendingRequests = queueStats.queues?.reduce((sum, queue) => sum + (queue.depth || 0), 0) || 0;
    const processingRequests = queueStats.queues?.reduce((sum, queue) => sum + (queue.processing || 0), 0) || 0;
    const maxQueueSize = queueStats.maxQueueSize || 0;
    const queueUtilization = maxQueueSize > 0 ? pendingRequests / maxQueueSize : 0;

    // Check if queue stats already exist, if not create them
    if (!statsGrid.querySelector('.queue-stats-card')) {
      const queueStatsCard = document.createElement('div');
      queueStatsCard.className = 'queue-stats-card';
      queueStatsCard.style.gridColumn = '1 / -1';
      queueStatsCard.style.marginTop = '1rem';

      queueStatsCard.innerHTML = `
        <div class="card-header" style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="card-title">🚦 Queue Statistics</span>
        </div>
        <div class="queue-stats-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
          <div class="queue-stat-item">
            <div class="queue-stat-label">Pending Requests</div>
            <div class="queue-stat-value" style="font-size: 1.5rem; font-weight: 800;">${pendingRequests}</div>
          </div>
          <div class="queue-stat-item">
            <div class="queue-stat-label">Processing Requests</div>
            <div class="queue-stat-value" style="font-size: 1.5rem; font-weight: 800;">${processingRequests}</div>
          </div>
          <div class="queue-stat-item">
            <div class="queue-stat-label">Max Queue Size</div>
            <div class="queue-stat-value" style="font-size: 1.5rem; font-weight: 800;">${maxQueueSize}</div>
          </div>
          <div class="queue-stat-item">
            <div class="queue-stat-label">Queue Utilization</div>
            <div class="queue-stat-value ${getUtilizationColor(queueUtilization)}" style="font-size: 1.5rem; font-weight: 800;">
              ${(queueUtilization * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      `;

      statsGrid.appendChild(queueStatsCard);
    } else {
      // Update existing queue stats
      const queueStatsCard = statsGrid.querySelector('.queue-stats-card');
      if (queueStatsCard) {
        const values = queueStatsCard.querySelectorAll('.queue-stat-value');
        values[0].textContent = pendingRequests;
        values[1].textContent = processingRequests;
        values[2].textContent = maxQueueSize;
        const utilizationEl = values[3];
        utilizationEl.textContent = `${(queueUtilization * 100).toFixed(1)}%`;
        utilizationEl.className = `queue-stat-value ${getUtilizationColor(queueUtilization)}`;
      }
    }
  }

  function getUtilizationColor(percentage) {
    if (percentage >= 0.9) return 'text-danger';
    if (percentage >= 0.7) return 'text-warning';
    return 'text-success';
  }

  // Toggle debug section
  function toggleDebugSection() {
    const debugSection = document.getElementById('debugSection');
    const toggleButton = document.getElementById('toggleDebug');

    if (debugSection.style.display === 'none') {
      debugSection.style.display = 'block';
      toggleButton.textContent = 'Hide Debug';
      toggleButton.classList.add('active');
      loadDebugData();
    } else {
      debugSection.style.display = 'none';
      toggleButton.textContent = 'Show Debug';
      toggleButton.classList.remove('active');
    }
  }

  // Load debug data
  async function loadDebugData() {
    const requestsContainer = document.getElementById('debugRequestsContainer');
    const backendFilter = document.getElementById('backendFilter').value;
    const requestLimit = parseInt(document.getElementById('requestLimit').value);

    // Get debug stats
    const statsResult = await apiClient.getDebugStats();

    if (statsResult.success) {
      document.getElementById('debugEnabled').textContent = statsResult.data.enabled ? 'Yes' : 'No';
      document.getElementById('debugEnabled').style.color = statsResult.data.enabled ? 'var(--success-color)' : 'var(--text-secondary)';
      document.getElementById('debugTotalRequests').textContent = statsResult.data.totalRequests || 0;
    }

    if (!backendFilter) {
      // Load all requests
      const result = await apiClient.getDebugRequests(requestLimit);

      if (result.success) {
        renderDebugRequests(result.data.requests);
      } else {
        requestsContainer.innerHTML = `<p class="debug-empty">Failed to load debug data: ${result.error}</p>`;
      }
    } else {
      // Load requests for specific backend
      const result = await apiClient.getDebugRequestsByBackend(backendFilter, requestLimit);

      if (result.success) {
        renderDebugRequests(result.data.requests);
      } else {
        requestsContainer.innerHTML = `<p class="debug-empty">Failed to load debug data: ${result.error}</p>`;
      }
    }
  }

  // Render debug requests
  function renderDebugRequests(requests) {
    const requestsContainer = document.getElementById('debugRequestsContainer');

    if (!requests || requests.length === 0) {
      requestsContainer.innerHTML = '<p class="debug-empty">No requests found</p>';
      return;
    }

    const methodColors = {
      GET: { bg: '#dcfce7', color: '#166534' },
      POST: { bg: '#dbeafe', color: '#1e40af' },
      PUT: { bg: '#fef3c7', color: '#92400e' },
      DELETE: { bg: '#fee2e2', color: '#991b1b' }
    };

    requestsContainer.innerHTML = requests.map(req => {
      const methodColor = methodColors[req.method] || { bg: '#f1f5f9', color: '#64748b' };
      const statusColor = req.statusCode >= 200 && req.statusCode < 300 ? 'success' : 'error';

      return `
        <div class="debug-request-item">
          <div class="debug-request-header">
            <span class="debug-request-method" style="background-color: ${methodColor.bg}; color: ${methodColor.color};">
              ${req.method}
            </span>
            <span class="debug-request-status ${statusColor}">
              ${req.statusCode} ${req.statusText || ''}
            </span>
            <span class="debug-request-path">${req.route}</span>
            <span class="debug-request-time">${new Date(req.timestamp).toLocaleString()}</span>
          </div>
          ${req.backendId ? `<div class="debug-request-backend">Backend: ${req.backendId}</div>` : ''}
          ${req.tokenCount !== undefined ? `
          <div class="debug-request-tokens">
            <span class="token-label">Tokens:</span>
            <span class="token-count">${req.tokenCount}</span>
          </div>
          ` : ''}
          ${req.responseLength !== undefined ? `
          <div class="debug-request-length">
            <span class="length-label">Length:</span>
            <span class="length-count">${req.responseLength} chars</span>
          </div>
          ` : ''}
          ${req.requestContent ? createCollapsibleSection('Request Body', formatJson(req.requestContent), false) : ''}
          ${req.responseContent ? createCollapsibleSection('Response', formatJson(extractResponseData(req.responseContent).data), false) : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Extract and parse response data from debug object
   * Response content is string: '{"data":"{actual content}","contentType":"...","statusCode":200}'
   */
  function extractResponseData(responseContent) {
    try {
      const parsed = typeof responseContent === 'string'
        ? JSON.parse(responseContent)
        : responseContent;

      return {
        data: parsed.data,
        contentType: parsed.contentType || 'application/json',
        statusCode: parsed.statusCode || 200
      };
    } catch (error) {
      console.error('Failed to parse response content:', error);
      return {
        data: responseContent,
        contentType: 'unknown',
        statusCode: 0
      };
    }
  }

  /**
   * Pretty-print JSON with syntax highlighting
   */
  function formatJson(json, indent = 2) {
    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      const jsonString = JSON.stringify(obj, null, indent);

      // Simple syntax highlighting with regex
      return jsonString
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
          let cls = 'json-key';
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              cls = 'json-key';
            } else {
              cls = 'json-string';
            }
          } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
          } else if (/null/.test(match)) {
            cls = 'json-null';
          } else if (/\d/.test(match)) {
            cls = 'json-number';
          }
          return '<span class="' + cls + '">' + match + '</span>';
        });
    } catch (error) {
      return '<span class="json-error">' + json + '</span>';
    }
  }

  /**
   * Create collapsible section HTML
   * @param {string} title - Header title
   * @param {string} contentHtml - Content to display
   * @param {boolean} isInitiallyExpanded - Whether section is expanded by default
   */
  function createCollapsibleSection(title, contentHtml, isInitiallyExpanded = false) {
    const defaultClass = isInitiallyExpanded ? 'collapsible-section expanded' : 'collapsible-section';
    const iconClass = isInitiallyExpanded ? 'collapsible-icon expanded' : 'collapsible-icon';
    const arrow = isInitiallyExpanded ? '▼' : '▶';

    return `
      <div class="${defaultClass}" data-expanded="${isInitiallyExpanded}">
        <div class="collapsible-header">
          <span class="collapsible-toggle">
            <span class="${iconClass}">${arrow}</span>
          </span>
          <span class="collapsible-title">${title}</span>
        </div>
        <div class="collapsible-content" style="display: ${isInitiallyExpanded ? 'block' : 'none'};">
          <div class="collapsible-body">
            ${contentHtml}
          </div>
        </div>
      </div>
    `;
  }

  // Clear debug history
  async function clearDebugHistory() {
    const result = await apiClient.clearDebugHistory();

    if (result.success) {
      showNotification('Debug history cleared successfully', 'success');
      loadDebugData();
    } else {
      showNotification(`Failed to clear debug history: ${result.error}`, 'error');
    }
  }

  // Render dashboard with data
  function renderDashboard() {
    const data = apiClient.getData();

    if (!data) {
      return;
    }

    renderOverview(data.health);
    renderBackends(data.backends);
    renderStats(data.stats);
    renderQueueStats(data.queueStats);
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

    // Add event listener for debug toggle
    const toggleButton = document.getElementById('toggleDebug');
    if (toggleButton) {
      toggleButton.addEventListener('click', toggleDebugSection);
    }

    // Add event listeners for debug controls
    const refreshButton = document.getElementById('refreshDebug');
    const clearButton = document.getElementById('clearDebug');
    const backendFilter = document.getElementById('backendFilter');
    const requestLimit = document.getElementById('requestLimit');

    if (refreshButton) {
      refreshButton.addEventListener('click', loadDebugData);
    }

    if (clearButton) {
      clearButton.addEventListener('click', clearDebugHistory);
    }

    if (backendFilter) {
      backendFilter.addEventListener('change', loadDebugData);
    }

    if (requestLimit) {
      requestLimit.addEventListener('change', loadDebugData);
    }

    // Add event listener for collapsible sections
    const debugSection = document.getElementById('debugSection');
    if (debugSection) {
      debugSection.addEventListener('click', (e) => {
        const header = e.target.closest('.collapsible-header');
        if (header) {
          const section = header.parentElement;
          const content = section.querySelector('.collapsible-content');
          const icon = section.querySelector('.collapsible-icon');
          const isExpanded = section.classList.contains('expanded');

          if (isExpanded) {
            section.classList.remove('expanded');
            content.style.display = 'none';
            icon.classList.remove('expanded');
            icon.textContent = '▶';
            section.setAttribute('data-expanded', 'false');
          } else {
            section.classList.add('expanded');
            content.style.display = 'block';
            icon.classList.add('expanded');
            icon.textContent = '▼';
            section.setAttribute('data-expanded', 'true');
          }
        }
      });
    }

    // Add event listeners for expand/collapse all
    const expandAllButton = document.getElementById('expandAll');
    const collapseAllButton = document.getElementById('collapseAll');

    if (expandAllButton) {
      expandAllButton.addEventListener('click', () => {
        document.querySelectorAll('.collapsible-section').forEach(section => {
          section.classList.add('expanded');
          const content = section.querySelector('.collapsible-content');
          const icon = section.querySelector('.collapsible-icon');
          if (content) content.style.display = 'block';
          if (icon) {
            icon.classList.add('expanded');
            icon.textContent = '▼';
          }
          section.setAttribute('data-expanded', 'true');
        });
      });
    }

    if (collapseAllButton) {
      collapseAllButton.addEventListener('click', () => {
        document.querySelectorAll('.collapsible-section').forEach(section => {
          section.classList.remove('expanded');
          const content = section.querySelector('.collapsible-content');
          const icon = section.querySelector('.collapsible-icon');
          if (content) content.style.display = 'none';
          if (icon) {
            icon.classList.remove('expanded');
            icon.textContent = '▶';
          }
          section.setAttribute('data-expanded', 'false');
        });
      });
    }

    // Start polling

    // Initial data fetch
    const [healthData, statsData, backendsData, queueStatsData] = await Promise.all([
      apiClient.getHealth(),
      apiClient.getStats(),
      apiClient.getBackends(),
      apiClient.getQueueStats()
    ]);

    if (healthData.success && statsData.success && backendsData.success && queueStatsData.success) {
      const data = {
        health: healthData.data,
        stats: statsData.data,
        backends: backendsData.data,
        queueStats: queueStatsData.data
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
