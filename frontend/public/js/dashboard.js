document.addEventListener('DOMContentLoaded', () => {
  // Initialize API client
  const apiClient = window.apiClient;

  // UI Elements
  const root = document.getElementById('root');
  const loadingContainer = document.querySelector('.loading-container');

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
          </div>
        </div>
        <button id="darkModeToggle" class="dark-mode-toggle" aria-label="Toggle dark mode">
          <!-- Sun icon (visible in light mode) -->
          <svg class="mode-icon sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          <!-- Moon icon (visible in dark mode) -->
          <svg class="mode-icon moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
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
              <span class="card-subtitle">Ready for Requests</span>
            </div>
          </div>
        </section>

        <section class="backends-section">
          <div class="section-header">
            <h2 class="section-title">Backends <span class="section-subtitle">(Individual backend status and metrics)</span></h2>
          </div>
          <div id="backendsGrid" class="backends-grid">
            <!-- Backend cards will be rendered here -->
          </div>
        </section>

        <section class="backends-section">
          <div class="section-header">
            <h2 class="section-title">Statistics <span class="section-subtitle">(System-wide statistics and metrics)</span></h2>
          </div>
          <div id="statsSection" class="stats-section">
            <!-- Stats will be rendered here -->
          </div>
        </section>

        <section class="backends-section">
          <div class="section-header">
            <h2 class="section-title">Configuration <span class="section-subtitle">(API endpoint URL for your applications)</span></h2>
          </div>
          <div id="configSection" class="config-section">
            <!-- Configuration will be rendered here -->
          </div>
        </section>

        <section class="backends-section">
          <div class="section-header">
            <h2 class="section-title">Debug <span class="section-subtitle">(Prompt cache statistics and performance metrics)</span></h2>
            <button id="toggleDebug" class="toggle-button">Show Debug</button>
          </div>
          <div id="debugSection" class="debug-section" style="display: none;">
            <div class="debug-stats">
              <div class="debug-stat-item">
                <span class="debug-stat-label">Debug Enabled</span>
                <span class="debug-stat-value" id="debugEnabled">-</span>
              </div>
            </div>

            <div class="debug-controls">
              <button id="refreshDebug" class="button button-secondary">Refresh</button>
            </div>

            <div id="debugBackendStatsContainer" class="debug-backend-stats-container">
              <p class="debug-empty">Loading debug data...</p>
            </div>
          </div>
        </section>
      </main>

      <footer class="footer">
        <p>LLM Balancer Dashboard • Running on port 3080</p>
      </footer>
    `;
  }

  // Render overview statistics
  function renderOverview(healthData) {
    document.getElementById('totalBackends').textContent = healthData.totalBackends || 0;
    document.getElementById('healthyBackends').textContent = healthData.healthyBackends || 0;
    document.getElementById('unhealthyBackends').textContent = healthData.totalBackends - (healthData.healthyBackends || 0);
    document.getElementById('busyBackends').textContent = healthData.busyBackends || 0;
    // Available = healthy backends that can still take requests (not at max concurrency)
    document.getElementById('availableBackends').textContent = healthData.availableBackends || healthData.healthyBackends || 0;

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

  // Format tokens per second for display
  function formatTokensPerSecond(tps) {
    if (!tps || tps === 0) return 'N/A';
    // Round to nearest integer and add k suffix for thousands
    const rounded = Math.round(tps);
    return rounded >= 1000 ? `${(rounded / 1000).toFixed(2)}k` : rounded;
  }

  // Render backend cards with performance metrics (incremental updates to preserve hover/scroll)
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

    // Initialize cards if they don't exist
    if (!backendsGrid.querySelector('.backend-card')) {
      backendsGrid.innerHTML = backendsData.backends.map((backend, index) => `
        <div class="backend-card" data-backend-url="${encodeURIComponent(backend.url)}">
          <div class="backend-url">${backend.url}</div>
          <div class="api-badges"></div>
          <div class="backend-info">
            <div class="info-row" data-field="health">
              <span class="info-label">Health</span>
              <span class="info-value"></span>
            </div>
            <div class="info-row" data-field="status">
              <span class="info-label">Status</span>
              <span class="info-value"></span>
            </div>
            <div class="info-row" data-field="concurrency">
              <span class="info-label">Concurrency</span>
              <span class="info-value"></span>
            </div>
            <div class="info-row" data-field="requests">
              <span class="info-label">Requests</span>
              <span class="info-value"></span>
            </div>
            <div class="info-row" data-field="errors">
              <span class="info-label">Errors</span>
              <span class="info-value"></span>
            </div>
            <div class="info-row" data-field="fails">
              <span class="info-label">Fails</span>
              <span class="info-value"></span>
            </div>
          </div>
          <div class="performance-metrics performance-placeholder">
            <div class="perf-section">
              <div class="perf-section-title">⏱️ No Data Yet</div>
              <div class="perf-metric-row">
                <span class="perf-metric-label">Waiting for requests...</span>
              </div>
            </div>
          </div>
          <div class="models-list models-placeholder">
            <span class="model-tag">No models available</span>
          </div>
        </div>
      `).join('');
      return;
    }

    // Incremental updates - update existing cards without destroying DOM
    backendsData.backends.forEach(backend => {
      const healthClass = backend.healthy ? 'healthy' : 'unhealthy';
      const healthText = backend.healthy ? 'Healthy' : 'Unhealthy';
      const busyText = backend.activeRequestCount > 0 ? 'Busy' : 'Idle';

      const card = backendsGrid.querySelector(`[data-backend-url="${encodeURIComponent(backend.url)}"]`);
      if (!card) return;

      // Update health class on card
      card.classList.remove('healthy', 'unhealthy');
      card.classList.add(healthClass);

      // Update text values using textContent (preserves event listeners)
      const urlEl = card.querySelector('.backend-url');
      if (urlEl) urlEl.textContent = backend.url;

      // Update health row
      const healthRow = card.querySelector('[data-field="health"] .info-value');
      if (healthRow) {
        healthRow.textContent = healthText;
        healthRow.className = `info-value ${healthClass}`;
      }

      // Update status row
      const statusRow = card.querySelector('[data-field="status"] .info-value');
      if (statusRow) statusRow.textContent = busyText;

      // Update concurrency row
      const concurrencyRow = card.querySelector('[data-field="concurrency"] .info-value');
      if (concurrencyRow) concurrencyRow.textContent = `${backend.activeRequestCount || 0}/${backend.maxConcurrency || 0}`;

      // Update requests row
      const requestsRow = card.querySelector('[data-field="requests"] .info-value');
      if (requestsRow) requestsRow.textContent = backend.requestCount || 0;

      // Update errors row
      const errorsRow = card.querySelector('[data-field="errors"] .info-value');
      if (errorsRow) {
        errorsRow.textContent = backend.errorCount || 0;
        errorsRow.className = `info-value ${backend.errorCount > 0 ? 'text-danger' : ''}`;
      }

      // Update fails row
      const failsRow = card.querySelector('[data-field="fails"] .info-value');
      if (failsRow) {
        failsRow.textContent = backend.failCount || 0;
        failsRow.className = `info-value ${backend.failCount > 0 ? 'text-danger' : ''}`;
      }

      // Update performance metrics section
      const perfMetrics = card.querySelector('.performance-metrics');
      const perfStats = backend.performanceStats || {};

      if (shouldUpdatePerformanceMetrics(perfMetrics, perfStats)) {
        const { html, hasData } = buildPerformanceMetricsHTML(perfStats);
        if (hasData) {
          perfMetrics.className = 'performance-metrics';
          perfMetrics.innerHTML = html;
        } else {
          perfMetrics.className = 'performance-metrics performance-placeholder';
          perfMetrics.innerHTML = `
            <div class="perf-section">
              <div class="perf-section-title">⏱️ No Data Yet</div>
              <div class="perf-metric-row">
                <span class="perf-metric-label">Waiting for requests...</span>
              </div>
            </div>
          `;
        }
      }

      // Update models list incrementally (preserve scroll position)
      const modelsList = card.querySelector('.models-list');
      const currentModels = Array.from(modelsList.querySelectorAll('.model-tag')).map(tag => tag.textContent);
      const newModels = backend.models || [];

      // Check if models changed
      const modelsChanged = currentModels.length !== newModels.length ||
                            currentModels.some((m, i) => m !== newModels[i]);

      if (modelsChanged) {
        if (newModels.length > 0) {
          modelsList.className = 'models-list';
          modelsList.innerHTML = newModels.map(model => `
            <span class="model-tag">${model}</span>
          `).join('');
        } else {
          modelsList.className = 'models-list models-placeholder';
          modelsList.innerHTML = '<span class="model-tag">No models available</span>';
        }
      }
    });
  }

  // Helper: check if performance metrics need updating
  function shouldUpdatePerformanceMetrics(perfMetricsEl, perfStats) {
    if (!perfMetricsEl) return false;
    const hasTimeStats = perfStats.timeStats?.avgTotalTimeMs !== undefined;
    const hasRates = perfStats.rateStats?.totalRate?.count > 0 || perfStats.rateStats?.promptRate?.count > 0 || perfStats.rateStats?.generationRate?.count > 0;
    const hasTokens = perfStats.tokenStats?.avgPromptTokens !== null && perfStats.tokenStats?.avgPromptTokens !== undefined;
    return hasTimeStats || hasRates || hasTokens || perfMetricsEl.classList.contains('performance-placeholder');
  }

  // Helper: build performance metrics HTML
  function buildPerformanceMetricsHTML(perfStats) {
    const timeStats = perfStats.timeStats || {};
    const rateStats = perfStats.rateStats || {};
    const tokenStats = perfStats.tokenStats || {};

    function formatMs(ms) {
      if (ms === undefined || ms === null || isNaN(ms)) return 'N/A';
      if (ms < 1) return `${(ms * 1000).toFixed(1)}µs`;
      if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
      return `${Math.round(ms)}ms`;
    }

    function formatRate(rate) {
      if (!rate || !rate.count || rate.count === 0 || !rate.avgTokensPerSecond) return 'N/A';
      const rounded = Math.round(rate.avgTokensPerSecond);
      if (rounded >= 1000) return `${(rounded / 1000).toFixed(2)}k`;
      return rounded;
    }

    let hasData = false;
    let html = '';

    // Time Metrics Section
    const hasTimeStats = timeStats.avgTotalTimeMs !== undefined || timeStats.avgPromptProcessingTimeMs !== undefined || timeStats.avgGenerationTimeMs !== undefined;
    if (hasTimeStats) {
      hasData = true;
      html += `
        <div class="perf-section">
          <div class="perf-section-title">⏱️ Avg Time Metrics</div>
          <div class="perf-metric-row">
            <span class="perf-metric-label">Total Time</span>
            <span class="perf-metric-value">${formatMs(timeStats.avgTotalTimeMs)}</span>
          </div>
          <div class="perf-metric-row">
            <span class="perf-metric-label">Prompt Processing</span>
            <span class="perf-metric-value">${formatMs(timeStats.avgPromptProcessingTimeMs)}</span>
          </div>
          <div class="perf-metric-row">
            <span class="perf-metric-label">Generation</span>
            <span class="perf-metric-value">${formatMs(timeStats.avgGenerationTimeMs)}</span>
          </div>
        </div>
      `;
    }

    // Token Rates Section
    const hasAnyRate = rateStats.totalRate?.count > 0 || rateStats.promptRate?.count > 0 || rateStats.generationRate?.count > 0;
    if (hasAnyRate) {
      hasData = true;
      const tooltipText = `The numbers shown are averages calculated from multiple requests.\nHover over each rate to see the sample count used.\n\nTotal Rate: ${rateStats.totalRate?.count || 0} samples\nPrompt Rate: ${rateStats.promptRate?.count || 0} samples\nGeneration Rate: ${rateStats.generationRate?.count || 0} samples`;
      html += `
        <div class="perf-section">
          <div class="perf-section-title with-tooltip" data-tooltip="${tooltipText}">⚡ Avg Token Rates (tokens/sec)</div>
          ${rateStats.totalRate?.count > 0 ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Total Rate</span>
              <span class="perf-metric-value">${formatRate(rateStats.totalRate)}</span>
            </div>
          ` : ''}
          ${rateStats.promptRate?.count > 0 ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Prompt Rate</span>
              <span class="perf-metric-value">${formatRate(rateStats.promptRate)}</span>
            </div>
          ` : ''}
          ${rateStats.generationRate?.count > 0 ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Generation Rate</span>
              <span class="perf-metric-value">${formatRate(rateStats.generationRate)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Token Counts Section
    const hasTokenStats = tokenStats.avgPromptTokens !== null && tokenStats.avgPromptTokens !== undefined || tokenStats.avgCompletionTokens !== null && tokenStats.avgCompletionTokens !== undefined || tokenStats.avgTotalTokens !== null && tokenStats.avgTotalTokens !== undefined;
    if (hasTokenStats) {
      hasData = true;
      html += `
        <div class="perf-section">
          <div class="perf-section-title">📊 Avg Tokens Processed</div>
          ${tokenStats.avgPromptTokens !== null && tokenStats.avgPromptTokens !== undefined ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Prompt</span>
              <span class="perf-metric-value">${tokenStats.avgPromptTokens.toFixed(1)}</span>
            </div>
          ` : ''}
          ${tokenStats.avgCompletionTokens !== null && tokenStats.avgCompletionTokens !== undefined ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Completion</span>
              <span class="perf-metric-value">${tokenStats.avgCompletionTokens.toFixed(1)}</span>
            </div>
          ` : ''}
          ${tokenStats.avgTotalTokens !== null && tokenStats.avgTotalTokens !== undefined ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Total</span>
              <span class="perf-metric-value">${tokenStats.avgTotalTokens.toFixed(1)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    return { html, hasData };
  }

  // Render statistics section (incremental updates to preserve hover states)
  function renderStats(statsData) {
    const statsSection = document.getElementById('statsSection');

    if (!statsData) {
      statsSection.innerHTML = '<p>Statistics not available</p>';
      return;
    }

    const { balancer, healthCheck, config } = statsData;

    // Initialize grid if it doesn't exist
    if (!statsSection.querySelector('.stats-grid')) {
      statsSection.innerHTML = `
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
          <div class="card stats-card" data-stat="health-interval">
            <div class="card-header">
              <span class="card-title">Health Check Interval</span>
            </div>
            <div class="card-value stat-value" style="font-size: 1rem;"></div>
          </div>
          <div class="card stats-card" data-stat="last-check">
            <div class="card-header">
              <span class="card-title">Last Health Check</span>
            </div>
            <div class="card-value stat-value" style="font-size: 1rem;"></div>
          </div>
          <div class="card stats-card" data-stat="consecutive-failures">
            <div class="card-header">
              <span class="card-title">Consecutive Failures</span>
            </div>
            <div class="card-value stat-value" style="font-size: 1rem;"></div>
          </div>
          <div class="card stats-card" data-stat="max-payload">
            <div class="card-header">
              <span class="card-title">Max Payload Size</span>
            </div>
            <div class="card-value stat-value" style="font-size: 1rem;"></div>
          </div>
        </div>
      `;
      return;
    }

    // Incremental updates - only update values, preserve DOM elements
    const healthIntervalValue = statsSection.querySelector('[data-stat="health-interval"] .stat-value');
    const lastCheckValue = statsSection.querySelector('[data-stat="last-check"] .stat-value');
    const failuresValue = statsSection.querySelector('[data-stat="consecutive-failures"] .stat-value');
    const payloadValue = statsSection.querySelector('[data-stat="max-payload"] .stat-value');

    if (healthIntervalValue) {
      healthIntervalValue.textContent = `${(config.healthCheckInterval / 1000).toFixed(1)}s`;
    }
    if (lastCheckValue) {
      lastCheckValue.textContent = healthCheck.lastCheck ? new Date(healthCheck.lastCheck).toLocaleString() : 'Never';
    }
    if (failuresValue) {
      failuresValue.textContent = healthCheck.consecutiveFailures || 0;
      failuresValue.style.color = healthCheck.consecutiveFailures > 0 ? 'var(--danger-color)' : 'var(--success-color)';
    }
    if (payloadValue) {
      payloadValue.textContent = `${config.maxPayloadSizeMB} MB`;
    }
  }

  function renderConfig() {
    const configSection = document.getElementById('configSection');

    // Config is static - only render once on init
    if (configSection.querySelector('.config-card')) {
      return;
    }

    const frontendUrl = 'http://localhost:3080';
    const apiUrl = 'http://localhost:3001';

    configSection.innerHTML = `
      <div class="config-container">
        <div class="config-card" data-config="frontend" style="flex: 1; min-width: 250px;">
          <div class="config-label">Frontend URL</div>
          <div class="config-url">${frontendUrl}</div>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Dashboard access point</p>
        </div>

        <div class="config-card" data-config="api" style="flex: 1; min-width: 250px;">
          <div class="config-label">API Base URL</div>
          <div class="config-url">${apiUrl}</div>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Load balancer endpoint for Ollama/Anthropic APIs</p>
        </div>

        <div class="config-card" data-config="integration" style="flex: 1; min-width: 250px;">
          <div class="config-label">Application Integration</div>
          <div class="config-url">${frontendUrl}/api</div>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Set your app's BASE_URL to this endpoint</p>
        </div>
      </div>
    `;
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

  // Format URL for display (shorten to hostname:port)
  function formatUrl(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}:${parsed.port}`;
    } catch {
      return url;
    }
  }

  // Format milliseconds to human readable
  function formatMs(ms) {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  // Format JSON for display in UI (plain text with line breaks)
  function formatJsonDisplay(jsonStr) {
    try {
      const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      const formatted = JSON.stringify(obj, null, 2);
      // Escape HTML and preserve line breaks
      return formatted
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    } catch (error) {
      return '<span class="json-error">' + jsonStr.substring(0, 500) + '</span>';
    }
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

  // Load debug data (now shows prompt cache stats)
  async function loadDebugData() {
    const container = document.getElementById('debugBackendStatsContainer');

    // Get debug stats
    const statsResult = await apiClient.getDebugStats();

    if (statsResult.success && statsResult.data) {
      // Update debug enabled status
      document.getElementById('debugEnabled').textContent = statsResult.data.enabled ? 'Yes' : 'No';
      document.getElementById('debugEnabled').style.color = statsResult.data.enabled ? 'var(--success-color)' : 'var(--text-secondary)';

      // Render backend stats with performance and prompt cache info
      renderBackendStats(statsResult.data.backendStats || []);
      console.log('Debug stats received:', statsResult.data);
    } else {
      container.innerHTML = `<p class="debug-empty">Failed to load debug data: ${statsResult.error || 'Unknown error'}</p>`;
    }
  }

  // Render backend stats with performance and prompt cache metrics
  function renderBackendStats(backendStats) {
    const container = document.getElementById('debugBackendStatsContainer');

    if (!backendStats || backendStats.length === 0) {
      container.innerHTML = '<p class="debug-empty">No backend stats available</p>';
      return;
    }

    container.innerHTML = backendStats.map(backend => {
      const pc = backend.promptCacheStats || {};
      const perf = backend.performanceStats || {};

      // Calculate cache hit rate
      const totalCacheOps = (pc.hits || 0) + (pc.misses || 0);
      const hitRate = totalCacheOps > 0 ? ((pc.hits / totalCacheOps) * 100).toFixed(1) : 0;

      // Build cache status indicator
      let cacheStatus = 'No data';
      let cacheStatusClass = '';
      if (totalCacheOps === 0) {
        cacheStatus = 'Learning';
        cacheStatusClass = 'neutral';
      } else if (hitRate >= 50) {
        cacheStatus = `Hit Rate: ${hitRate}%`;
        cacheStatusClass = 'success';
      } else if (hitRate >= 20) {
        cacheStatus = `Hit Rate: ${hitRate}%`;
        cacheStatusClass = 'warning';
      } else {
        cacheStatus = `Hit Rate: ${hitRate}%`;
        cacheStatusClass = 'error';
      }

      return `
        <div class="backend-stats-card">
          <div class="backend-stats-header">
            <h3 class="backend-name">${formatUrl(backend.url)}</h3>
            <span class="backend-request-count">Requests: ${backend.requestCount || 0}</span>
          </div>

          <div class="stats-grid">
            <!-- Performance Stats -->
            <div class="stat-section">
              <h4 class="section-header">Performance</h4>
              <div class="stat-row">
                <span class="stat-label">Avg Total Time</span>
                <span class="stat-value">${formatMs(perf.timeStats?.avgTotalTimeMs || 0)}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Avg Prompt Time</span>
                <span class="stat-value">${formatMs(perf.timeStats?.avgPromptProcessingTimeMs || 0)}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Avg Generation Time</span>
                <span class="stat-value">${formatMs(perf.timeStats?.avgGenerationTimeMs || 0)}</span>
              </div>
            </div>

            <!-- Token Stats -->
            <div class="stat-section">
              <h4 class="section-header">Tokens</h4>
              <div class="stat-row">
                <span class="stat-label">Avg Prompt</span>
                <span class="stat-value">${perf.tokenStats?.avgPromptTokens ? Math.round(perf.tokenStats.avgPromptTokens) : '-'}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Avg Completion</span>
                <span class="stat-value">${perf.tokenStats?.avgCompletionTokens ? Math.round(perf.tokenStats.avgCompletionTokens) : '-'}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Avg Total</span>
                <span class="stat-value">${perf.tokenStats?.avgTotalTokens ? Math.round(perf.tokenStats.avgTotalTokens) : '-'}</span>
              </div>
            </div>

            <!-- Rate Stats -->
            <div class="stat-section">
              <h4 class="section-header">Throughput</h4>
              <div class="stat-row">
                <span class="stat-label">Total Rate</span>
                <span class="stat-value">${perf.rateStats?.totalRate?.avgTokensPerSecond ? perf.rateStats.totalRate.avgTokensPerSecond.toFixed(1) : '-'}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Generation Rate</span>
                <span class="stat-value">${perf.rateStats?.generationRate?.avgTokensPerSecond ? perf.rateStats.generationRate.avgTokensPerSecond.toFixed(1) : '-'}</span>
              </div>
            </div>

            <!-- Prompt Cache Stats -->
            <div class="stat-section">
              <h4 class="section-header">Prompt Cache</h4>
              <div class="stat-row">
                <span class="stat-label">Status</span>
                <span class="stat-value cache-status ${cacheStatusClass}">${cacheStatus}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Hits</span>
                <span class="stat-value">${pc.hits || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Misses</span>
                <span class="stat-value">${pc.misses || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Evictions</span>
                <span class="stat-value">${pc.evictions || 0}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Cache Size</span>
                <span class="stat-value">${pc.size || 0} / ${pc.maxSize || 5}</span>
              </div>
            </div>
          </div>

          <!-- Cached Prompts -->
          ${pc.cachedPrompts && pc.cachedPrompts.length > 0 ? `
            <div class="prompt-cache-prompts">
              <h4 class="section-header">Cached Prompts (${pc.cachedPrompts.length})</h4>
              ${pc.cachedPrompts.map((cp, idx) => `
                <div class="cached-prompt-item">
                  <div class="cached-prompt-header">
                    <span class="cached-prompt-model">${cp.model}</span>
                    <span class="cached-prompt-info">Accessed: ${new Date(cp.lastAccessed).toLocaleTimeString()} | Hits: ${cp.hitCount}</span>
                  </div>
                  <div class="cached-prompt-content">${formatJsonDisplay(cp.prompt)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // Clear debug history - now a no-op since we don't track requests
  async function clearDebugHistory() {
    showNotification('Debug request tracking has been replaced with prompt cache statistics. No clearing needed.', 'info');
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
  }

  // Initialize dark mode toggle
  function initDarkMode() {
    const toggleBtn = document.getElementById('darkModeToggle');

    if (!toggleBtn) return;

    // Default to dark mode
    document.body.classList.add('dark-mode');

    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('darkMode', isDark);
    });
  }

  // Initialize
  async function init() {
    createDashboard();
    initDarkMode();

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

      loadingContainer.style.display = 'none';

      // Start polling for automatic refresh
      apiClient.setUpdateCallback((updatedData) => {
        renderDashboard();
      });
      apiClient.startPolling();
    } else {
      showNotification('Failed to load dashboard data', 'error');
    }
  }

  // Start the dashboard
  init();
});
