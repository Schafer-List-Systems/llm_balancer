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

  // Navigation state
  let currentSection = 'overview';
  let sidebarCollapsed = false;

  // Section configuration
  const sectionConfig = {
    'overview': {
      label: 'Overview',
      icon: '📊',
      title: 'Overview',
      subtitle: 'System health and backend status'
    },
    'statistics': {
      label: 'Statistics',
      icon: '📈',
      title: 'Statistics',
      subtitle: 'Deep-dive analytics and visualizations'
    },
    'benchmarks': {
      label: 'Benchmarks',
      icon: '⚡',
      title: 'Benchmarks',
      subtitle: 'Performance testing for backends'
    },
    'debug': {
      label: 'Debug',
      icon: '🔧',
      title: 'Debug',
      subtitle: 'Prompt cache statistics and performance metrics'
    },
    'configuration': {
      label: 'Configuration',
      icon: '⚙️',
      title: 'Configuration',
      subtitle: 'API endpoint URL for your applications'
    }
  };

  // Create dashboard structure with sidebar navigation
  function createDashboard() {
    root.innerHTML = `
      <div class="app-layout">
        <!-- Sidebar Navigation -->
        <aside class="sidebar ${sidebarCollapsed ? 'collapsed' : ''}" id="sidebar">
          <nav class="sidebar-nav" id="sidebarNav">
            ${Object.entries(sectionConfig).filter(([key]) => key !== 'backends').map(([key, config]) => `
              <button class="nav-item ${currentSection === key ? 'active' : ''}" data-section="${key}">
                <span class="nav-icon">${config.icon}</span>
                <span class="nav-label" ${sidebarCollapsed ? 'style="display: none;"' : ''}>${config.label}</span>
                ${currentSection === key ? '<span class="nav-indicator"></span>' : ''}
              </button>
            `).join('')}
          </nav>

          <div class="sidebar-footer">
            <button id="collapseSidebarBtn" class="collapse-btn" aria-label="${sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
              <svg class="collapse-icon expanded" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 4L6 8l4 4"/>
              </svg>
              <svg class="collapse-icon collapsed" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 12l4-4-4-4"/>
              </svg>
            </button>
          </div>
        </aside>

        <!-- Main Content Area -->
        <div class="main-wrapper">
          <header class="header">
            <button class="mobile-menu-btn" aria-label="Open menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12h18M3 6h18M3 18h18"/>
              </svg>
            </button>
            <div class="header-content">
              <div class="header-title">
                <h1 id="currentPageTitle">${sectionConfig.overview.title}</h1>
                <span id="currentPageSubtitle">${sectionConfig.overview.subtitle}</span>
              </div>
              <div class="header-info">
                <div id="backendLedsContainer" class="backend-leds-container"></div>
                <div id="connectionStatus" class="status-badge disconnected">
                  <span class="status-dot"></span>
                  <span>Connecting...</span>
                </div>
                <button id="darkModeToggle" class="dark-mode-toggle" aria-label="Toggle dark mode">
                  <svg class="mode-icon sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                  <svg class="mode-icon moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                </button>
              </div>
            </div>
          </header>

          <main class="main-content">
            <!-- Overview Section -->
            <section id="overviewSection" class="section-content active" data-section="overview">
              <div class="overview-stats-container">
                <!-- Overview Cards -->
                <section class="overview-section">
                  <h2 class="section-title">Overview <span class="section-subtitle">(System health summary)</span></h2>
                  <div class="overview-cards">
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
                  </div>
                </section>

                <!-- Backend Cards Section -->
                <section class="backend-section">
                  <h2 class="section-title">Backends <span class="section-subtitle">(Individual backend status)</span></h2>
                  <div id="backendsGrid" class="backends-grid">
                    <!-- Backend cards will be rendered here -->
                  </div>
                </section>
              </div>
            </section>

            <!-- Statistics Section -->
            <section id="statisticsSection" class="section-content" data-section="statistics">
              <!-- Stats Grid -->
              <div id="statsSection">
                <!-- Stats will be rendered here -->
              </div>

              <!-- Chart Visualization Section -->
              <div id="statsVisualizationSection" class="page-section">

                  <!-- Filter Controls -->
                  <div id="chartFilters" class="filter-container" style="display: none;">
                    <div class="filter-item">
                      <label for="timeRangeSelect">Time Range:</label>
                      <select id="timeRangeSelect" class="time-range-selector">
                        <option value="all">All Data</option>
                        <option value="20">Last 20 Requests</option>
                        <option value="10">Last 10 Requests</option>
                      </select>
                    </div>
                    <div class="filter-item backend-filter" id="backendFilter">
                      <!-- Backend checkboxes rendered dynamically -->
                    </div>
                    <div class="export-buttons">
                      <button class="export-btn" id="exportChartsBtn">📷 Export All Charts</button>
                      <button class="export-btn" id="exportDataBtn">📄 Export Data</button>
                    </div>
                  </div>

                  <!-- Time Metrics Charts -->
                  <section id="timeMetricsSection" class="stats-section" style="margin-top: 2rem;">
                    <h3 class="section-title">⏱️ Time Metrics</h3>
                    <div class="chart-grid" id="timeMetricsGrid">
                      <div class="chart-container">
                        <div class="chart-title">📈 Total Time Over Requests</div>
                        <canvas id="totalTimeChart" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">⚡ Generation Time Over Requests</div>
                        <canvas id="generationTimeChart" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">🌐 Network Latency Over Requests</div>
                        <canvas id="networkLatencyChart" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">✍️ Prompt Processing Time Over Requests</div>
                        <canvas id="promptProcessingChart" class="chart-canvas"></canvas>
                      </div>
                    </div>
                  </section>

                  <!-- Token Metrics Charts -->
                  <section id="tokenMetricsSection" class="stats-section">
                    <h3 class="section-title">📊 Token Metrics</h3>
                    <div class="chart-grid">
                      <div class="chart-container token-comparison-chart">
                        <div class="chart-title">🔢 Token Count Comparison (by Backend)</div>
                        <canvas id="tokenComparisonChart" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">🍩 Token Distribution (Per Backend)</div>
                        <canvas id="tokenDistributionChart" class="chart-canvas"></canvas>
                      </div>
                    </div>
                  </section>

                  <!-- Rate Metrics Charts -->
                  <section id="rateMetricsSection" class="stats-section">
                    <h3 class="section-title">⚡ Rate Metrics</h3>
                    <div class="chart-grid">
                      <div class="chart-container rate-comparison-chart">
                        <div class="chart-title">🔄 Generation Rate Comparison (tokens/sec)</div>
                        <canvas id="generationRateChart" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">📊 Total Rate Over Time</div>
                        <canvas id="totalRateChart" class="chart-canvas"></canvas>
                      </div>
                    </div>
                  </section>

                  <!-- Health & Cache Charts -->
                  <section id="healthMetricsSection" class="stats-section">
                    <h3 class="section-title">💚 Health & Cache Metrics</h3>
                    <div class="chart-grid">
                      <div class="chart-container">
                        <div class="chart-title">🎯 Cache Hit/Miss Ratio</div>
                        <canvas id="cacheEfficiencyChart" class="chart-canvas"></canvas>
                      </div>
                    </div>
                  </section>

                  <!-- Distribution & Percentile Charts -->
                  <section id="distributionSection" class="stats-section">
                    <h3 class="section-title">📈 Distribution & Percentile Charts</h3>
                    <div class="chart-grid">
                      <div class="chart-container">
                        <div class="chart-title">📊 Total Time Box Plot (by Backend)</div>
                        <canvas id="totalTimeBoxPlot" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">⚡ Generation Rate Distribution</div>
                        <canvas id="generationRateHistogram" class="chart-canvas"></canvas>
                      </div>
                    </div>
                  </section>

                </div>
              </section>
            </section>

            <!-- Benchmarks Section -->
            <section id="benchmarksSection" class="section-content" data-section="benchmarks">
              <section class="backends-section">
                <div class="section-header">
                  <h2 class="section-title">Benchmarks <span class="section-subtitle">(Performance testing for backends)</span></h2>
                </div>
                <div id="benchmarkSection" class="benchmark-section">
                  <!-- Single Backend Benchmarks -->
                  <div id="singleBackendBenchmarks" class="benchmark-panel">
                    <h3 class="benchmark-panel-title">Single Backend Benchmarks</h3>
                    <p class="benchmark-panel-description">Run performance tests on individual backends</p>

                    <div id="benchmarkBackendsGrid" class="benchmark-backends-grid">
                      <!-- Benchmark cards will be rendered here -->
                    </div>
                  </div>

                  <!-- Multi-Backend Benchmarks -->
                  <div id="multiBackendBenchmarks" class="benchmark-panel">
                    <h3 class="benchmark-panel-title">Multi-Backend Benchmarks</h3>
                    <p class="benchmark-panel-description">Run benchmarks that test the balancer's coordination across backends</p>

                    <div class="benchmark-controls">
                      <div class="benchmark-option-group">
                        <label class="benchmark-option-label">Number of Prompts</label>
                        <input type="number" id="benchmarkNumPrompts" class="benchmark-option-input" value="4" min="1" max="16" />
                      </div>

                      <div class="benchmark-option-group">
                        <label class="benchmark-option-label">Tokens per Prompt</label>
                        <input type="number" id="benchmarkTokens" class="benchmark-option-input" value="5000" min="100" max="50000" />
                      </div>

                      <div class="benchmark-option-group">
                        <label class="benchmark-option-label">Model</label>
                        <input type="text" id="benchmarkModel" class="benchmark-option-input" value="qwen/qwen3.5-35b-a3b" />
                      </div>

                      <button id="runPromptCachingBenchmark" class="button button-primary">
                        Run Prompt Caching Benchmark
                      </button>
                    </div>

                    <div id="multiBenchmarkProgress" class="benchmark-progress" style="display: none;">
                      <div class="benchmark-progress-bar">
                        <div class="benchmark-progress-fill" id="benchmarkProgressFill"></div>
                      </div>
                      <span id="benchmarkProgressText" class="benchmark-progress-text">Running benchmark...</span>
                    </div>
                  </div>

                  <!-- Benchmark Results -->
                  <div id="benchmarkResults" class="benchmark-panel">
                    <div class="benchmark-panel-header">
                      <h3 class="benchmark-panel-title">Benchmark Results</h3>
                      <button id="refreshBenchmarkResults" class="button button-secondary button-small">
                        Refresh Results
                      </button>
                      <button id="clearBenchmarkResults" class="button button-secondary button-small">
                        Clear All
                      </button>
                    </div>

                    <div id="benchmarkResultsList" class="benchmark-results-list">
                      <p class="benchmark-empty">No benchmark results yet. Run a benchmark to see results here.</p>
                    </div>
                  </div>
                </div>
              </section>
            </section>

            <!-- Debug Section -->
            <section id="debugSection" class="section-content" data-section="debug">
              <section class="backends-section">
                <div class="section-header">
                  <h2 class="section-title">Debug <span class="section-subtitle">(Prompt cache statistics and performance metrics)</span></h2>
                </div>
                <div id="debugSectionInner" class="debug-section">
                  <div class="debug-header-controls" style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                    <button id="refreshDebug" class="button button-secondary">Refresh</button>
                  </div>

                  <div class="debug-stats">
                    <div class="debug-stat-item">
                      <span class="debug-stat-label">Debug Enabled</span>
                      <span class="debug-stat-value" id="debugEnabled">-</span>
                    </div>
                  </div>

                  <!-- Cache Control Buttons -->
                  <div id="cacheControls" class="debug-controls" style="display: none;">
                    <h3 class="debug-section-header">Cache Management</h3>
                    <div class="cache-management-buttons">
                      <button id="clearAllCache" class="button button-danger">Clear All Caches</button>
                      <button id="clearAllStats" class="button button-danger">Clear All Stats</button>
                    </div>
                  </div>

                  <!-- Queue Viewer -->
                  <div id="queueViewer" class="queue-viewer" style="display: none;">
                    <h3 class="debug-section-header">Request Queue</h3>
                    <div id="queueStatsSummary" class="queue-stats-summary"></div>
                    <div id="queueContents" class="queue-contents"></div>
                  </div>

                  <div id="debugBackendStatsContainer" class="debug-backend-stats-container">
                    <p class="debug-empty">Loading debug data...</p>
                  </div>
                </div>
              </section>
            </section>

            <!-- Configuration Section -->
            <section id="configurationSection" class="section-content" data-section="configuration">
              <section class="backends-section">
                <div class="section-header">
                  <h2 class="section-title">Configuration <span class="section-subtitle">(API endpoint URL for your applications)</span></h2>
                </div>
                <div id="configSection" class="config-section">
                  <!-- Configuration will be rendered here -->
                </div>
              </section>
            </section>
          </main>

          <footer class="footer">
            <p>LLM Balancer Dashboard • Running on port 3080</p>
          </footer>
        </div>
      </div>
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

    // Update backend cards on overview page
    const backendsData = apiClient.getData()?.backends;
    if (backendsData && backendsData.backends && currentSection === 'overview') {
      renderBackendCards(backendsData);
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
  // ============================================================
  // LED FUNCTIONS - Updates LED indicators regardless of section
  // ============================================================

  function updateBackendLeds(backendsData) {
    const backendLedsContainer = document.getElementById('backendLedsContainer');

    if (!backendLedsContainer || !backendsData.backends || backendsData.backends.length === 0) {
      return;
    }

    // Initialize LED container if it doesn't exist
    if (backendLedsContainer.innerHTML === '') {
      backendLedsContainer.innerHTML = backendsData.backends.map((backend, index) => `
        <div class="backend-led" data-backend-url="${encodeURIComponent(backend.url)}" title="Loading..."></div>
      `).join('');
    }

    // Update LED states for each backend
    backendsData.backends.forEach(backend => {
      const led = backendLedsContainer.querySelector(`[data-backend-url="${encodeURIComponent(backend.url)}"]`);
      if (led) {
        let ledState = 'idle';
        let ledTitle = `${backend.name || 'Backend'} - Idle`;

        if (!backend.healthy) {
          ledState = 'unhealthy';
          ledTitle = `${backend.name || 'Backend'} - Unhealthy`;
        } else if ((backend.activeStreamingRequests || 0) > 0) {
          ledState = 'streaming';
          ledTitle = `${backend.name || 'Backend'} - Streaming`;
        } else if ((backend.activeNonStreamingRequests || 0) > 0) {
          ledState = 'non-streaming';
          ledTitle = `${backend.name || 'Backend'} - Non-Streaming`;
        }

        led.classList.remove('unhealthy', 'idle', 'streaming', 'non-streaming', 'green-glowing');
        led.classList.add(ledState);
        led.title = ledTitle;
      }
    });
  }

  /**
   * Render backend cards (only when Backends section is active)
   */
  function renderBackendCards(backendsData) {
    const backendsGrid = document.getElementById('backendsGrid');

    if (!backendsGrid || !backendsData.backends || backendsData.backends.length === 0) {
      return;
    }

    // Initialize cards if they don't exist
    if (!backendsGrid.querySelector('.backend-card')) {
      backendsGrid.innerHTML = backendsData.backends.map((backend, index) => `
        <div class="backend-card" data-backend-url="${encodeURIComponent(backend.url)}">
          <div class="backend-name">${backend.name || 'Backend ' + (index + 1)}</div>
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
    }

    // Incremental updates - update existing cards without destroying DOM
    backendsData.backends.forEach((backend, index) => {
      const healthClass = backend.healthy ? 'healthy' : 'unhealthy';
      const healthText = backend.healthy ? 'Healthy' : 'Unhealthy';
      const isBusy = backend.activeRequestCount > 0;
      const busyText = isBusy ? 'Busy' : 'Idle';

      const card = backendsGrid.querySelector(`[data-backend-url="${encodeURIComponent(backend.url)}"]`);
      if (!card) return;

      // Update health class on card
      card.classList.remove('healthy', 'unhealthy');
      card.classList.add(healthClass);

      // Remove all status classes before adding new ones
      card.classList.remove('busy', 'streaming-active', 'non-streaming-active');

      // Add mode-specific classes for visual feedback
      if (isBusy) {
        card.classList.add('busy');
        // Prioritize streaming mode (rotating) over non-streaming (pulsating)
        if ((backend.activeStreamingRequests || 0) > 0) {
          card.classList.add('streaming-active');
        } else if ((backend.activeNonStreamingRequests || 0) > 0) {
          card.classList.add('non-streaming-active');
        }
      }

      // Update text values using textContent (preserves event listeners)
      const nameEl = card.querySelector('.backend-name');
      if (nameEl) nameEl.textContent = backend.name || `Backend ${index + 1}`;

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

      // Update API badges
      const apiBadgesContainer = card.querySelector('.api-badges');
      if (apiBadgesContainer && backend.apiTypes && Array.isArray(backend.apiTypes)) {
        const apiTypeLabels = {
          'openai': 'OpenAI',
          'anthropic': 'Anthropic',
          'google': 'Gemini',
          'ollama': 'Ollama',
          'groq': 'Groq'
        };

        apiBadgesContainer.innerHTML = backend.apiTypes
          .filter(apiType => apiType && apiType !== 'unknown')
          .map(apiType =>
            `<div class="api-badge ${apiType}">${apiTypeLabels[apiType] || apiType.toUpperCase()}</div>`
          ).join('');
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
    const hasTimeStats = timeStats.avgTotalTimeMs !== undefined || timeStats.avgPromptProcessingTimeMs !== undefined || timeStats.avgGenerationTimeMs !== undefined || timeStats.avgNetworkLatencyMs !== undefined;
    if (hasTimeStats) {
      hasData = true;
      // Build tooltip with sample counts for time metrics
      const timeSampleCounts = [
        `Network Latency: ${timeStats.avgNetworkLatencyMs !== undefined && timeStats.avgNetworkLatencyMs > 0 ? 'samples tracked' : 'none'}`,
        `Prompt Processing: ${timeStats.avgPromptProcessingTimeMs !== undefined && timeStats.avgPromptProcessingTimeMs > 0 ? 'samples tracked' : 'none'}`,
        `Generation: ${timeStats.avgGenerationTimeMs !== undefined && timeStats.avgGenerationTimeMs > 0 ? 'samples tracked (corrected for n tokens)' : 'none'}`,
        `Total Time: ${timeStats.avgTotalTimeMs !== undefined && timeStats.avgTotalTimeMs > 0 ? 'samples tracked' : 'none'}`
      ].filter(s => s.includes('samples') || s.includes('none'));
      const tooltipText = `The numbers shown are averages calculated from multiple requests.\nHover over each metric to see the sample count used.\n\n${timeSampleCounts.join('\n')}`;

      html += `
        <div class="perf-section">
          <div class="perf-section-title with-tooltip" data-tooltip="${tooltipText}">⏱️ Avg Time Metrics</div>
          <div class="perf-metric-row">
            <span class="perf-metric-label">Network Latency</span>
            <span class="perf-metric-value">${formatMs(timeStats.avgNetworkLatencyMs)}</span>
          </div>
          <div class="perf-metric-row">
            <span class="perf-metric-label">Prompt Processing</span>
            <span class="perf-metric-value">${formatMs(timeStats.avgPromptProcessingTimeMs)}</span>
          </div>
          <div class="perf-metric-row">
            <span class="perf-metric-label">Generation</span>
            <span class="perf-metric-value">${formatMs(timeStats.avgGenerationTimeMs)}</span>
          </div>
          <div class="perf-metric-row">
            <span class="perf-metric-label">Total Time</span>
            <span class="perf-metric-value">${formatMs(timeStats.avgTotalTimeMs)}</span>
          </div>
        </div>
      `;
    }

    // Token Counts Section
    const hasTokenStats = tokenStats.avgPromptTokens !== null && tokenStats.avgPromptTokens !== undefined || tokenStats.avgCompletionTokens !== null && tokenStats.avgCompletionTokens !== undefined || tokenStats.avgTotalTokens !== null && tokenStats.avgTotalTokens !== undefined || tokenStats.avgNonCachedPromptTokens !== null && tokenStats.avgNonCachedPromptTokens !== undefined;
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
          ${tokenStats.avgNonCachedPromptTokens !== null && tokenStats.avgNonCachedPromptTokens !== undefined ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">~Non-Cached Prompt</span>
              <span class="perf-metric-value">${tokenStats.avgNonCachedPromptTokens.toFixed(1)}</span>
            </div>
          ` : ''}
          ${tokenStats.avgCompletionTokens !== null && tokenStats.avgCompletionTokens !== undefined ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Generation</span>
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

    // Token Rates Section
    const hasAnyRate = rateStats.totalRate?.count > 0 || rateStats.promptRate?.count > 0 || rateStats.generationRate?.count > 0 || rateStats.nonCachedPromptRate?.count > 0;
    if (hasAnyRate) {
      hasData = true;
      const tooltipText = `The numbers shown are averages calculated from multiple requests.\nHover over each rate to see the sample count used.\n\nPrompt Rate: ${rateStats.promptRate?.count || 0} samples\n~Non-Cached Prompt Rate: ${rateStats.nonCachedPromptRate?.count || 0} samples\nGeneration Rate: ${rateStats.generationRate?.count || 0} samples\nTotal Rate: ${rateStats.totalRate?.count || 0} samples`;
      html += `
        <div class="perf-section">
          <div class="perf-section-title with-tooltip" data-tooltip="${tooltipText}">⚡ Avg Token Rates (tokens/sec)</div>
          ${rateStats.promptRate?.count > 0 ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Prompt Rate</span>
              <span class="perf-metric-value">${formatRate(rateStats.promptRate)}</span>
            </div>
          ` : ''}
          ${rateStats.nonCachedPromptRate?.count > 0 ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">~Non-Cached Prompt Rate</span>
              <span class="perf-metric-value">${formatRate(rateStats.nonCachedPromptRate)}</span>
            </div>
          ` : ''}
          ${rateStats.generationRate?.count > 0 ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Generation Rate</span>
              <span class="perf-metric-value">${formatRate(rateStats.generationRate)}</span>
            </div>
          ` : ''}
          ${rateStats.totalRate?.count > 0 ? `
            <div class="perf-metric-row">
              <span class="perf-metric-label">Total Rate</span>
              <span class="perf-metric-value">${formatRate(rateStats.totalRate)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    return { html, hasData };
  }

  // Navigate to a specific section
  function navigateToSection(sectionId) {
    if (currentSection === sectionId) return;

    // Update current section
    currentSection = sectionId;

    // Update URL without reload
    const newPath = '/' + sectionId;
    history.pushState({ section: sectionId }, '', newPath);

    // Update sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.section === sectionId) {
        item.classList.add('active');
      }
    });

    // Update page title and subtitle
    const config = sectionConfig[sectionId];
    if (config) {
      document.getElementById('currentPageTitle').textContent = config.title;
      document.getElementById('currentPageSubtitle').textContent = config.subtitle;
    }

    // Update section visibility
    document.querySelectorAll('.section-content').forEach(section => {
      section.classList.remove('active');
      if (section.dataset.section === sectionId) {
        section.classList.add('active');
      }
    });

    // Load section-specific data
    loadDataForSection(sectionId);
  }

  // Load data for specific section
  function loadDataForSection(sectionId) {
    switch (sectionId) {
      case 'overview':
        // Render backends cards when overview is active
        const backendsData = apiClient.getData()?.backends;
        if (backendsData && backendsData.backends) {
          renderBackendCards(backendsData);
        }
        break;
      case 'statistics':
        // Load stats data
        const statsData = apiClient.getData()?.stats;
        renderStats(statsData);
        break;
      case 'benchmarks':
        // Render benchmark backends if not already done
        if (!document.getElementById('benchmarkBackendsGrid').querySelector('.benchmark-card')) {
          renderBenchmarkBackends();
        }
        break;
      case 'debug':
        // Load debug data when section is navigated to
        loadDebugData();
        if (window.debugAvailable) loadQueueContents();
        break;
      case 'configuration':
        renderConfig();
        break;
      default:
        // Overview - already rendered
        break;
    }
  }

  // Render statistics section (incremental updates to preserve hover states)
  function renderStats(statsData) {
    const statsSection = document.getElementById('statsSection');

    // Return if stats section doesn't exist (section not active)
    if (!statsSection) return;

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
      const intervalMs = config.healthCheck?.interval || 30000;
      healthIntervalValue.textContent = `${(intervalMs / 1000).toFixed(1)}s`;
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

  // ============================================================
  // CONFIGURATION SECTION - FULL CONFIG DISPLAY WITH EDITING
  // ============================================================

  let globalConfig = null;
  let editedFields = new Map(); // Track edited fields: path -> originalValue

  /**
   * Render the full configuration section
   */
  async function renderConfig() {
    const configSection = document.getElementById('configSection');

    // Only render once on init
    if (configSection.querySelector('.config-section-title')) {
      return;
    }

    try {
      const result = await window.apiClient.getConfig();
      if (!result.success || !result.data) {
        configSection.innerHTML = `<div class="config-field">Error loading configuration: ${result.error}</div>`;
        return;
      }

      globalConfig = result.data;
      renderFullConfigUI(configSection, globalConfig);
    } catch (error) {
      configSection.innerHTML = `<div class="config-field">Error loading configuration: ${error.message}</div>`;
    }
  }

  /**
   * Render the full configuration UI
   */
  function renderFullConfigUI(container, config) {
    container.innerHTML = `
      <div class="config-container-full">
        <div class="config-section-info">
          <strong>Note:</strong> Configuration changes are saved to config.json but require server restart to take effect.
          After making changes, click "Save Configuration" then restart the backend.
        </div>

        <!-- General Section -->
        <div class="config-section">
          <h3 class="config-section-title">General</h3>
          <div class="config-field-group">
            ${renderConfigField('version', config.version, false, 'Application version')}
            ${renderConfigField('port', config.port, true, 'Port the balancer listens on')}
            ${renderConfigField('maxRetries', config.maxRetries, true, 'Maximum retry attempts for failed requests')}
            ${renderConfigField('maxStatsSamples', config.maxStatsSamples, true, 'Number of samples to keep for statistics')}
          </div>
        </div>

        <!-- Performance Section -->
        <div class="config-section">
          <h3 class="config-section-title">Performance</h3>
          <div class="config-field-group">
            ${renderConfigField('maxPayloadSize', config.maxPayloadSize, true, 'Maximum request payload size in bytes')}
            ${renderConfigField('maxPayloadSizeMB', config.maxPayloadSizeMB, false, 'Maximum payload size in MB (calculated)')}
          </div>
        </div>

        <!-- Health Check Section -->
        <div class="config-section">
          <h3 class="config-section-title">Health Check</h3>
          <div class="config-field-group">
            ${renderConfigNestedField('healthCheck', config.healthCheck, {
              interval: { editable: true, label: 'Check Interval (ms)', type: 'number' },
              timeout: { editable: true, label: 'Timeout (ms)', type: 'number' },
              maxRetries: { editable: true, label: 'Max Retries', type: 'number' },
              retryDelay: { editable: true, label: 'Retry Delay (ms)', type: 'number' },
              staggerDelay: { editable: true, label: 'Stagger Delay (ms)', type: 'number' }
            })}
          </div>
        </div>

        <!-- Queue Section -->
        <div class="config-section">
          <h3 class="config-section-title">Queue</h3>
          <div class="config-field-group">
            ${renderConfigNestedField('queue', config.queue, {
              timeout: { editable: true, label: 'Queue Timeout (ms)', type: 'number' },
              depthHistorySize: { editable: true, label: 'Depth History Size', type: 'number' }
            })}
          </div>
        </div>

        <!-- Request Section -->
        <div class="config-section">
          <h3 class="config-section-title">Request</h3>
          <div class="config-field-group">
            ${renderConfigNestedField('request', config.request, {
              timeout: { editable: true, label: 'Request Timeout (ms)', type: 'number' }
            })}
          </div>
        </div>

        <!-- Debug Section -->
        <div class="config-section">
          <h3 class="config-section-title">Debug</h3>
          <div class="config-field-group">
            ${renderConfigNestedField('debug', config.debug, {
              enabled: { editable: true, label: 'Enable Debug Mode', type: 'boolean' },
              requestHistorySize: { editable: true, label: 'Request History Size', type: 'number' }
            })}
          </div>
        </div>

        <!-- Prompt Cache Section -->
        <div class="config-section">
          <h3 class="config-section-title">Prompt Cache</h3>
          <div class="config-field-group">
            ${renderConfigNestedField('prompt.cache', config.prompt?.cache || {}, {
              maxSize: { editable: true, label: 'Cache Max Size', type: 'number' },
              similarityThreshold: { editable: true, label: 'Similarity Threshold', type: 'number', step: 0.01 },
              minHitThreshold: { editable: true, label: 'Min Hit Threshold (tokens)', type: 'number' }
            })}
          </div>
        </div>

        <!-- Backends Section -->
        <div class="config-section">
          <h3 class="config-section-title">Backends</h3>
          <div id="backendsConfigContainer" style="margin-bottom: 1rem;">
            ${renderBackendsList(config.backends || [])}
          </div>
          <button class="config-array-add-btn" onclick="window.addBackend()">
            + Add Backend
          </button>
        </div>

        <!-- Save Button -->
        <div style="margin-top: 2rem; text-align: center;">
          <button class="config-field-btn save" style="width: 200px; padding: 1rem; font-size: 1rem;"
            onclick="window.saveAllConfig()">
            Save Configuration
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render a simple editable config field
   */
  function renderConfigField(name, value, editable, description) {
    const fieldName = formatFieldName(name);
    const displayValue = typeof value === 'number' ? value : `"${value}"`;
    const isBoolean = typeof value === 'boolean';

    return `
      <div class="config-field" data-field="${name}">
        <div class="config-field-header">
          <span class="config-field-name">${fieldName}</span>
          <button class="config-field-toggle" onclick="window.toggleEdit(this, '${name}', ${editable})">
            Edit
          </button>
        </div>
        <div class="config-field-value" id="value-${name}">${displayValue}</div>
        <div class="config-field-input-container" id="input-${name}" style="display: none;">
          ${isBoolean
            ? `<input type="checkbox" class="config-field-input" id="input-${name}" ${value ? 'checked' : ''} onchange="window.updateField('${name}', this.checked)">`
            : `<input type="number" class="config-field-input" id="input-${name}" value="${value}" onchange="window.updateField('${name}', this.value)">`
          }
        </div>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">${description}</p>
      </div>
    `;
  }

  /**
   * Render a nested config object field
   */
  function renderConfigNestedField(path, value, fields) {
    const fieldName = formatFieldName(path);
    const hasEditable = Object.values(fields).some(f => f.editable);

    return `
      <div class="config-field" data-field="${path}">
        <div class="config-field-header">
          <span class="config-field-name">${fieldName}</span>
          ${hasEditable
            ? `<button class="config-field-toggle" onclick="window.toggleEdit(this, '${path}', true)">Edit</button>`
            : `<span style="font-size: 0.75rem; color: var(--text-secondary);">Read-only</span>`
          }
        </div>
        <div class="config-field-value" id="value-${path}">${formatNestedValue(value)}</div>
        <div class="config-field-input-container" id="input-${path}" style="display: none;">
          ${renderNestedFieldsInput(path, value, fields)}
        </div>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Configuration object for ${fieldName}</p>
      </div>
    `;
  }

  /**
   * Render input fields for nested config
   */
  function renderNestedFieldsInput(path, value, fields) {
    let html = '';

    for (const [key, config] of Object.entries(fields)) {
      const fieldValue = value[key];
      const fieldType = config.type || 'number';
      const step = config.step || '';
      const inputLabel = config.label || key;

      if (fieldType === 'boolean') {
        html += `
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <input type="checkbox" class="config-field-input" id="${path}.${key}" ${fieldValue ? 'checked' : ''}
              onchange="window.updateNestedField('${path}', '${key}', this.checked)">
            <label style="font-size: 0.875rem; color: var(--text-primary);">${inputLabel}</label>
          </div>
        `;
      } else {
        html += `
          <div style="margin-bottom: 0.5rem;">
            <label style="display: block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${inputLabel}</label>
            <input type="number" ${step ? `step="${step}"` : ''} class="config-field-input"
              id="${path}.${key}" value="${fieldValue}"
              onchange="window.updateNestedField('${path}', '${key}', this.value)">
          </div>
        `;
      }
    }

    return html;
  }

  /**
   * Render backends list
   */
  function renderBackendsList(backends) {
    if (!backends || backends.length === 0) {
      return '<p style="font-size: 0.875rem; color: var(--text-secondary);">No backends configured</p>';
    }

    return backends.map((backend, index) => `
      <div class="config-array-item" data-backend="${index}">
        <div class="config-array-item-header">
          <span class="config-array-item-name">${backend.name || `Backend ${index + 1}`}</span>
          <button class="config-array-item-remove" onclick="window.removeBackend(${index})">Remove</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem;">
          ${renderBackendField('url', backend.url, index)}
          ${renderBackendField('priority', backend.priority, index)}
          ${renderBackendField('maxConcurrency', backend.maxConcurrency, index)}
        </div>
      </div>
    `).join('');
  }

  /**
   * Render editable backend field
   */
  function renderBackendField(field, value, index) {
    const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
    return `
      <div>
        <label style="font-size: 0.75rem; color: var(--text-secondary);">${fieldName}</label>
        <input type="${field === 'url' ? 'text' : 'number'}" class="config-field-input"
          id="backend-${index}-${field}" value="${value}"
          onchange="window.updateBackendField(${index}, '${field}', this.value)"
          style="width: 100%; margin-top: 0.25rem;">
      </div>
    `;
  }

  /**
   * Format field name for display
   */
  function formatFieldName(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
  }

  /**
   * Format nested value for display
   */
  function formatNestedValue(value) {
    if (typeof value === 'object') {
      return Object.entries(value)
        .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : `"${v}"`}`)
        .join(', ');
    }
    return typeof value === 'number' ? value : `"${value}"`;
  }

  /**
   * Toggle edit mode for a field
   */
  window.toggleEdit = function(button, path, editable) {
    if (!editable) return;

    const valueContainer = document.getElementById(`value-${path}`);
    const inputContainer = document.getElementById(`input-${path}`);

    if (inputContainer.style.display === 'none') {
      // Enter edit mode
      button.textContent = 'Save';
      button.classList.add('editing');
      inputContainer.style.display = 'block';

      // Focus first input
      const firstInput = inputContainer.querySelector('.config-field-input');
      if (firstInput) firstInput.focus();
    } else {
      // Exit edit mode without saving
      button.textContent = 'Edit';
      button.classList.remove('editing');
      inputContainer.style.display = 'none';
    }
  };

  /**
   * Update a simple field value (preview)
   */
  window.updateField = function(name, value) {
    const input = document.getElementById(`input-${name}`);
    if (input) {
      document.getElementById(`value-${name}`).textContent = typeof value === 'number' ? value : `"${value}"`;
    }
  };

  /**
   * Update a nested field value (preview)
   */
  window.updateNestedField = function(path, key, value) {
    const container = document.getElementById(`value-${path}`);
    if (container) {
      // Recalculate and update display
      const currentValue = getNestedValue(globalConfig, path);
      currentValue[key] = value;
      container.textContent = formatNestedValue(currentValue);
    }
  };

  /**
   * Update a backend field value
   */
  window.updateBackendField = function(index, field, value) {
    const backends = globalConfig.backends || [];
    if (backends[index]) {
      backends[index][field] = field === 'priority' || field === 'maxConcurrency' ? parseInt(value) : value;
      document.getElementById(`value-${field}`).textContent = backends[index][field];
    }
  };

  /**
   * Get nested value from object
   */
  function getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  }

  /**
   * Set nested value in object
   */
  function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] === undefined) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Add a new backend
   */
  window.addBackend = function() {
    if (!globalConfig.backends) {
      globalConfig.backends = [];
    }

    const container = document.getElementById('backendsConfigContainer');
    const newIndex = globalConfig.backends.length;

    globalConfig.backends.push({
      url: 'http://',
      name: 'New Backend',
      priority: 1,
      maxConcurrency: 10
    });

    container.insertAdjacentHTML('beforeend', renderBackendItem(newIndex, globalConfig.backends[newIndex]));
  };

  /**
   * Remove a backend
   */
  window.removeBackend = function(index) {
    if (!globalConfig.backends || globalConfig.backends.length <= 1) {
      alert('At least one backend is required');
      return;
    }

    globalConfig.backends.splice(index, 1);

    const container = document.getElementById('backendsConfigContainer');
    const item = container.querySelector(`[data-backend="${index}"]`);
    if (item) {
      item.remove();
    }
  };

  /**
   * Render a single backend item
   */
  function renderBackendItem(index, backend) {
    return `
      <div class="config-array-item" data-backend="${index}">
        <div class="config-array-item-header">
          <span class="config-array-item-name">${backend.name || `Backend ${index + 1}`}</span>
          <button class="config-array-item-remove" onclick="window.removeBackend(${index})">Remove</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem;">
          <div>
            <label style="font-size: 0.75rem; color: var(--text-secondary);">URL</label>
            <input type="text" class="config-field-input" id="backend-${index}-url"
              value="${backend.url}" onchange="window.updateBackendField(${index}, 'url', this.value)"
              style="width: 100%; margin-top: 0.25rem;">
          </div>
          <div>
            <label style="font-size: 0.75rem; color: var(--text-secondary);">Priority</label>
            <input type="number" class="config-field-input" id="backend-${index}-priority"
              value="${backend.priority}" onchange="window.updateBackendField(${index}, 'priority', this.value)"
              style="width: 100%; margin-top: 0.25rem;">
          </div>
          <div>
            <label style="font-size: 0.75rem; color: var(--text-secondary);">Max Concurrency</label>
            <input type="number" class="config-field-input" id="backend-${index}-maxConcurrency"
              value="${backend.maxConcurrency}" onchange="window.updateBackendField(${index}, 'maxConcurrency', this.value)"
              style="width: 100%; margin-top: 0.25rem;">
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Save all configuration changes
   */
  window.saveAllConfig = async function() {
    const btn = document.querySelector('button[onclick="window.saveAllConfig()"]');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
      const result = await window.apiClient.updateConfig(globalConfig);

      if (result.success) {
        alert('Configuration saved successfully! Remember to restart the server for changes to take effect.');
        btn.textContent = 'Saved!';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 2000);
      } else {
        alert('Failed to save configuration: ' + result.error);
        btn.textContent = originalText;
        btn.disabled = false;
      }
    } catch (error) {
      alert('Error saving configuration: ' + error.message);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  };

  // ============================================================
  // END CONFIGURATION SECTION
  // ============================================================

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

  // Render queue statistics (includes performance metrics merged in)
  function renderQueueStats(queueStats, statsData) {
    const statsSection = document.getElementById('statsSection');

    // Return if stats section doesn't exist (section not active)
    if (!statsSection) return;

    const statsGrid = statsSection.querySelector('.stats-grid');

    if (!queueStats || !statsGrid) return;

    // Aggregate queue stats from per-priority queues
    const pendingRequests = queueStats.queues?.reduce((sum, queue) => sum + (queue.depth || 0), 0) || 0;
    const processingRequests = queueStats.queues?.reduce((sum, queue) => sum + (queue.processing || 0), 0) || 0;
    const maxQueueSize = queueStats.maxQueueSize || 0;
    const queueUtilization = maxQueueSize > 0 ? pendingRequests / maxQueueSize : 0;

    // Calculate performance metrics from statsData for merged card
    const backends = statsData?.backendDetails?.filter(b => b.performanceStats) || [];
    const avgGenRate = backends.length > 0
      ? backends.reduce((sum, b) => {
          const samples = b.performanceStats.rawSamples?.rateStats?.generationRate || [];
          return sum + (samples.length > 0 ? samples.reduce((a, c) => a + c, 0) / samples.length : 0);
        }, 0) / backends.length
      : 0;

    const avgTotalTime = backends.length > 0
      ? backends.reduce((sum, b) => {
          const samples = b.performanceStats.rawSamples?.timeStats?.totalTimeMs || [];
          return sum + (samples.length > 0 ? samples.reduce((a, c) => a + c, 0) / samples.length : 0);
        }, 0) / backends.length
      : 0;

    const overallCacheHitRate = backends.length > 0
      ? backends.reduce((sum, b) => {
          const cache = b.promptCacheStats || {};
          const total = (cache.totalHits || 0) + (cache.totalMisses || 0);
          return sum + (total > 0 ? (cache.totalHits || 0) / total : 0);
        }, 0) / backends.length * 100
      : 0;

    const totalConc = statsData?.stats?.totalConcurrency || 0;
    const maxConc = statsData?.stats?.maxConcurrency || 100;
    const utilization = (totalConc / maxConc) * 100;
    const utilizationPercent = totalConc / maxConc;

    // Check if queue stats already exist, if not create them
    if (!statsGrid.querySelector('.queue-stats-card')) {
      const queueStatsCard = document.createElement('div');
      queueStatsCard.className = 'queue-stats-card';
      queueStatsCard.style.gridColumn = '1 / -1';
      queueStatsCard.style.marginTop = '1rem';

      queueStatsCard.innerHTML = `
        <div class="card-header" style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="card-title">🚦 Queue & Performance Statistics</span>
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
        <div class="queue-stats-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
          <div class="queue-stat-item">
            <div class="queue-stat-label">Avg Generation Rate</div>
            <div class="queue-stat-value" style="font-size: 1.5rem; font-weight: 800;">${avgGenRate.toFixed(1)} t/s</div>
          </div>
          <div class="queue-stat-item">
            <div class="queue-stat-label">Avg Total Time</div>
            <div class="queue-stat-value" style="font-size: 1.5rem; font-weight: 800;">${avgTotalTime.toFixed(0)} ms</div>
          </div>
          <div class="queue-stat-item">
            <div class="queue-stat-label">Cache Hit Rate</div>
            <div class="queue-stat-value" style="font-size: 1.5rem; font-weight: 800;">${overallCacheHitRate.toFixed(1)}%</div>
          </div>
          <div class="queue-stat-item">
            <div class="queue-stat-label">System Utilization</div>
            <div class="queue-stat-value ${getUtilizationColor(utilizationPercent)}" style="font-size: 1.5rem; font-weight: 800;">
              ${utilization.toFixed(0)}%
            </div>
          </div>
        </div>
      `;

      statsGrid.appendChild(queueStatsCard);
    } else {
      // Update existing queue stats
      const queueStatsCard = statsGrid.querySelector('.queue-stats-card');
      if (queueStatsCard) {
        const allValues = queueStatsCard.querySelectorAll('.queue-stat-value');
        // First 4 values: queue stats
        allValues[0].textContent = pendingRequests;
        allValues[1].textContent = processingRequests;
        allValues[2].textContent = maxQueueSize;
        const utilizationEl = allValues[3];
        utilizationEl.textContent = `${(queueUtilization * 100).toFixed(1)}%`;
        utilizationEl.className = `queue-stat-value ${getUtilizationColor(queueUtilization)}`;
        // Next 4 values: performance metrics
        allValues[4].textContent = `${avgGenRate.toFixed(1)} t/s`;
        allValues[5].textContent = `${avgTotalTime.toFixed(0)} ms`;
        allValues[6].textContent = `${overallCacheHitRate.toFixed(1)}%`;
        const sysUtilEl = allValues[7];
        sysUtilEl.textContent = `${utilization.toFixed(0)}%`;
        sysUtilEl.className = `queue-stat-value ${getUtilizationColor(utilizationPercent)}`;
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

  // Format age in milliseconds to human readable
  function formatAge(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  // Show toast notification
  function showToast(message, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.getElementById('toastNotification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--danger-color)' : 'var(--primary-color)'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      z-index: 10000;
      font-size: 14px;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Clear all caches
  async function clearAllCaches() {
    const result = await apiClient.resetCache(null);
    if (result.success) {
      showToast('All caches cleared successfully', 'success');
      loadDebugData(); // Refresh stats
      if (debugAvailable) loadQueueContents();
    } else {
      showToast(`Failed to clear caches: ${result.error}`, 'error');
    }
  }

  // Clear all stats
  async function clearAllStats() {
    const result = await apiClient.resetStats(null);
    if (result.success) {
      showToast('All stats cleared successfully', 'success');
      loadDebugData(); // Refresh stats
    } else {
      showToast(`Failed to clear stats: ${result.error}`, 'error');
    }
  }

  // Clear specific backend cache
  async function clearBackendCache(backendUrl) {
    const result = await apiClient.resetCache(backendUrl);
    if (result.success) {
      showToast(`Cache cleared for ${formatUrl(backendUrl)}`, 'success');
      loadDebugData();
      if (debugAvailable) loadQueueContents();
    } else {
      showToast(`Failed to clear cache: ${result.error}`, 'error');
    }
  }

  // Clear specific backend stats
  async function clearBackendStats(backendUrl) {
    const result = await apiClient.resetStats(backendUrl);
    if (result.success) {
      showToast(`Stats cleared for ${formatUrl(backendUrl)}`, 'success');
      loadDebugData();
    } else {
      showToast(`Failed to clear stats: ${result.error}`, 'error');
    }
  }

  // Load queue contents
  async function loadQueueContents() {
    const [statsResult, contentsResult] = await Promise.all([
      apiClient.getQueueStats(),
      apiClient.getQueueContents()
    ]);

    // Display stats summary
    const statsSummary = document.getElementById('queueStatsSummary');
    if (statsResult.success && statsResult.data) {
      const { maxQueueSize, queueTimeout, queues } = statsResult.data;
      const totalQueued = contentsResult.data?.totalQueued || 0;

      statsSummary.innerHTML = `
        <div class="queue-stat-item">
          <span class="queue-stat-label">Max Queue Size</span>
          <span class="queue-stat-value">${maxQueueSize}</span>
        </div>
        <div class="queue-stat-item">
          <span class="queue-stat-label">Queue Timeout</span>
          <span class="queue-stat-value">${queueTimeout}ms</span>
        </div>
        <div class="queue-stat-item">
          <span class="queue-stat-label">Total Queued</span>
          <span class="queue-stat-value">${totalQueued}</span>
        </div>
      `;
    }

    // Display queue contents
    const queueContents = document.getElementById('queueContents');
    if (contentsResult.success && contentsResult.data) {
      const { contents, totalQueued, maxQueueSize } = contentsResult.data;

      if (contents.length === 0) {
        queueContents.innerHTML = '<p class="debug-empty">Queue is empty</p>';
        return;
      }

      queueContents.innerHTML = contents.map(req => `
        <div class="queue-item">
          <div class="queue-item-header">
            <span class="queue-index">#${req.index}</span>
            <span class="queue-age">${formatAge(req.age)} old</span>
          </div>
          <div class="queue-item-info">
            <div class="queue-info-row">
              <span class="queue-label">Criterion</span>
              <span class="queue-value">${typeof req.criterion === 'string' ? req.criterion : JSON.stringify(req.criterion)}</span>
            </div>
            <div class="queue-info-row">
              <span class="queue-label">Client IP</span>
              <span class="queue-value">${req.clientIp || 'unknown'}</span>
            </div>
            <div class="queue-info-row">
              <span class="queue-label">API Type</span>
              <span class="queue-value">${req.requestData?.apiType || 'unknown'}</span>
            </div>
            <div class="queue-info-row">
              <span class="queue-label">Timed Out</span>
              <span class="queue-value">${req.timedOut ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // Toggle debug section
  function toggleDebugSection() {
    // Debug section is no longer collapsible - always visible when navigated to
    // This function is kept for backward compatibility but does nothing now
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

    // Store the HTML to render
    const html = backendStats.map(backend => {
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
            <div class="backend-actions">
              <button class="cache-clear-btn-inline button button-secondary button-small" data-backend-url="${backend.url}" data-type="cache">Clear Cache</button>
              <button class="cache-clear-btn-inline button button-secondary button-small" data-backend-url="${backend.url}" data-type="stats">Clear Stats</button>
            </div>
          </div>

          <div class="stats-grid">
            <!-- Performance Stats -->
            <div class="stat-section">
              <h4 class="section-header">Performance</h4>
              ${(perf.timeStats?.avgNetworkLatencyMs != null) ? `
              <div class="stat-row">
                <span class="stat-label">Avg Network Latency</span>
                <span class="stat-value">${formatMs(perf.timeStats.avgNetworkLatencyMs)}</span>
              </div>` : ''}
              ${(perf.timeStats?.avgPromptProcessingTimeMs != null) ? `
              <div class="stat-row">
                <span class="stat-label">Avg Prompt Time</span>
                <span class="stat-value">${formatMs(perf.timeStats.avgPromptProcessingTimeMs)}</span>
              </div>` : ''}
              ${(perf.timeStats?.avgGenerationTimeMs != null) ? `
              <div class="stat-row">
                <span class="stat-label">Avg Generation Time</span>
                <span class="stat-value">${formatMs(perf.timeStats.avgGenerationTimeMs)}</span>
              </div>` : ''}
              <div class="stat-row">
                <span class="stat-label">Avg Total Time</span>
                <span class="stat-value">${formatMs(perf.timeStats?.avgTotalTimeMs ?? 0)}</span>
              </div>
            </div>

            <!-- Token Stats -->
            <div class="stat-section">
              <h4 class="section-header">Tokens</h4>
              ${(perf.tokenStats?.avgPromptTokens != null) ? `
              <div class="stat-row">
                <span class="stat-label">Avg Prompt</span>
                <span class="stat-value">${Math.round(perf.tokenStats.avgPromptTokens)}</span>
              </div>` : ''}
              ${(perf.tokenStats?.avgNonCachedPromptTokens != null) ? `
              <div class="stat-row">
                <span class="stat-label">~Avg Non-Cached Prompt</span>
                <span class="stat-value">${Math.round(perf.tokenStats.avgNonCachedPromptTokens)}</span>
              </div>` : ''}
              ${(perf.tokenStats?.avgCompletionTokens != null) ? `
              <div class="stat-row">
                <span class="stat-label">Avg Generation</span>
                <span class="stat-value">${Math.round(perf.tokenStats.avgCompletionTokens)}</span>
              </div>` : ''}
              ${(perf.tokenStats?.avgTotalTokens != null) ? `
              <div class="stat-row">
                <span class="stat-label">Avg Total</span>
                <span class="stat-value">${Math.round(perf.tokenStats.avgTotalTokens)}</span>
              </div>` : ''}
            </div>

            <!-- Rate Stats -->
            <div class="stat-section">
              <h4 class="section-header">Throughput</h4>
              ${(perf.rateStats?.promptRate?.avgTokensPerSecond != null) ? `
              <div class="stat-row">
                <span class="stat-label">Prompt Rate</span>
                <span class="stat-value">${perf.rateStats.promptRate.avgTokensPerSecond.toFixed(1)}</span>
              </div>` : ''}
              ${(perf.rateStats?.nonCachedPromptRate?.avgTokensPerSecond != null) ? `
              <div class="stat-row">
                <span class="stat-label">~Non-Cached Prompt Rate</span>
                <span class="stat-value">${perf.rateStats.nonCachedPromptRate.avgTokensPerSecond.toFixed(1)}</span>
              </div>` : ''}
              ${(perf.rateStats?.generationRate?.avgTokensPerSecond != null) ? `
              <div class="stat-row">
                <span class="stat-label">Generation Rate</span>
                <span class="stat-value">${perf.rateStats.generationRate.avgTokensPerSecond.toFixed(1)}</span>
              </div>` : ''}
              ${(perf.rateStats?.totalRate?.avgTokensPerSecond != null) ? `
              <div class="stat-row">
                <span class="stat-label">Total Rate</span>
                <span class="stat-value">${perf.rateStats.totalRate.avgTokensPerSecond.toFixed(1)}</span>
              </div>` : ''}
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

    // Render the HTML
    container.innerHTML = html;

    // Add event listeners for cache/stats clear buttons
    container.querySelectorAll('.cache-clear-btn-inline').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const backendUrl = btn.dataset.backendUrl;
        const clearType = btn.dataset.type;
        if (clearType === 'stats') {
          clearBackendStats(backendUrl);
        } else {
          clearBackendCache(backendUrl);
        }
      });
    });
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

    // Only render overview content (5 cards) - this is always visible
    renderOverview(data.health);

    // Always update LEDs regardless of which section is active
    if (data.backends && data.backends.backends) {
      updateBackendLeds(data.backends);
    }

    // Render backends cards only if overview section is active
    if (currentSection === 'overview') {
      renderBackendCards(data.backends);
    }

    // Only render stats if the statistics section is active
    if (currentSection === 'statistics') {
      renderStats(data.stats);
      renderQueueStats(data.queueStats, data.stats);
      // Update chart visualizations (only if function is available)
      if (typeof updateStatsVisualization === 'function') {
        updateStatsVisualization(data.stats);
        // Populate backend filter checkboxes after visualization update
        if (typeof populateBackendFilter === 'function') {
          populateBackendFilter(data.stats.backendDetails || []);
        }
      }
    }

    // Don't render config here - it's rendered when section is viewed

    // Render benchmark backends if benchmarks section is active
    if (currentSection === 'benchmarks') {
      renderBenchmarkBackends();
    }
  }

  // Initialize sidebar collapse
  function initSidebar() {
    const collapseBtn = document.getElementById('collapseSidebarBtn');
    const sidebar = document.getElementById('sidebar');

    if (!collapseBtn) return;

    // Load saved sidebar state
    const savedCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (savedCollapsed) {
      sidebarCollapsed = true;
      sidebar.classList.add('collapsed');
    }

    collapseBtn.addEventListener('click', () => {
      sidebarCollapsed = !sidebarCollapsed;
      sidebar.classList.toggle('collapsed', sidebarCollapsed);

      // Toggle nav label visibility
      document.querySelectorAll('.nav-label').forEach(label => {
        label.style.display = sidebarCollapsed ? 'none' : 'block';
      });

      // Toggle logo text visibility
      const logoText = document.querySelector('.logo-text');
      if (logoText) {
        logoText.style.display = sidebarCollapsed ? 'none' : 'block';
      }

      // Save state
      localStorage.setItem('sidebarCollapsed', sidebarCollapsed);

      // Update aria-label
      collapseBtn.setAttribute('aria-label', sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    });
  }

  // Initialize navigation
  function initNavigation() {
    const sidebarNav = document.getElementById('sidebarNav');

    if (!sidebarNav) return;

    // Add click handlers for navigation items
    sidebarNav.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const sectionId = item.dataset.section;
        navigateToSection(sectionId);
      });
    });

    // Mobile menu button
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');

    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });

      // Close sidebar when clicking on nav item (mobile)
      sidebarNav.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
          sidebar.classList.remove('mobile-open');
        });
      });

      // Close sidebar when clicking outside (mobile)
      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
          sidebar.classList.remove('mobile-open');
        }
      });
    }

    // Handle URL path-based navigation on initial load (without history changes)
    const path = window.location.pathname.replace(/^\//, '');
    const validSections = ['overview', 'statistics', 'benchmarks', 'debug', 'configuration'];
    console.log('[Dashboard] Initial path:', path);
    if (path && validSections.includes(path) && path !== 'overview') {
      console.log('[Dashboard] Navigating to:', path);
      // Don't set currentSection before calling navigateToSection or it will return early
      navigateToSection(path);
    }
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
    initSidebar();
    initNavigation();
    initDarkMode();

    // Ensure apiClient is loaded
    if (!window.apiClient) {
      loadingContainer.innerHTML = '<p>Error: API client not loaded</p>';
      return;
    }

    const apiClient = window.apiClient;

    // Check if debug endpoints are available
    const debugCheck = await apiClient.checkDebugAvailability();
    window.debugAvailable = debugCheck.debugAvailable;

    // Add event listener for refresh debug button
    const refreshDebugBtn = document.getElementById('refreshDebug');
    if (refreshDebugBtn) {
      refreshDebugBtn.addEventListener('click', () => {
        loadDebugData();
        if (window.debugAvailable) loadQueueContents();
      });
    }

    // Add event listener for cache clear all button
    const clearAllCacheBtn = document.getElementById('clearAllCache');
    if (clearAllCacheBtn) {
      clearAllCacheBtn.addEventListener('click', clearAllCaches);
    }

    // Add event listener for stats clear all button
    const clearAllStatsBtn = document.getElementById('clearAllStats');
    if (clearAllStatsBtn) {
      clearAllStatsBtn.addEventListener('click', clearAllStats);
    }

    // ============================================================
    // BENCHMARK SECTION INITIALIZATION
    // ============================================================

    // Refresh benchmark results button
    const refreshBenchmarkResultsBtn = document.getElementById('refreshBenchmarkResults');
    if (refreshBenchmarkResultsBtn) {
      refreshBenchmarkResultsBtn.addEventListener('click', () => {
        loadBenchmarkResults();
      });
    }

    // Clear benchmark results button
    const clearBenchmarkResultsBtn = document.getElementById('clearBenchmarkResults');
    if (clearBenchmarkResultsBtn) {
      clearBenchmarkResultsBtn.addEventListener('click', () => {
        if (confirm('Clear all benchmark results?')) {
          // Clear all results by deleting each one
          apiClient.listBenchmarkResults().then(result => {
            if (result.success && result.data?.results) {
              result.data.results.forEach(r => {
                apiClient.deleteBenchmarkResult(r.jobId).catch(() => {});
              });
            }
            loadBenchmarkResults();
          });
        }
      });
    }

    // Run prompt caching benchmark button
    const runPromptCachingBtn = document.getElementById('runPromptCachingBenchmark');
    if (runPromptCachingBtn) {
      runPromptCachingBtn.addEventListener('click', () => {
        runPromptCachingBenchmark();
      });
    }

    // Start polling for benchmark results (when section is visible)
    setInterval(() => {
      if (currentSection === 'benchmarks') {
        // Check for completed benchmark jobs
        apiClient.listBenchmarkResults().then(result => {
          if (result.success && result.data?.results) {
            const container = document.getElementById('benchmarkResultsList');
            if (container && container.querySelector('.benchmark-empty')) {
              if (result.data.results.length > 0) {
                loadBenchmarkResults();
              }
            }
          }
        });
      }
    }, 2000);

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

      // Show/hide debug controls based on availability
      const cacheControls = document.getElementById('cacheControls');
      const queueViewer = document.getElementById('queueViewer');
      if (debugCheck.debugAvailable) {
        if (cacheControls) cacheControls.style.display = 'block';
        if (queueViewer) queueViewer.style.display = 'block';
      }

      // Start polling for automatic refresh
      apiClient.setUpdateCallback((updatedData) => {
        renderDashboard();
      });
      apiClient.startPolling();
    } else {
      showNotification('Failed to load dashboard data', 'error');
    }
  }

  // ============================================================
  // BENCHMARK FUNCTIONS
  // ============================================================

  /**
   * Render benchmark backend cards
   */
  function renderBenchmarkBackends() {
    const container = document.getElementById('benchmarkBackendsGrid');
    if (!container) return;

    // Get backend data from cache
    const data = apiClient.getData();
    if (!data?.backends?.backends) {
      container.innerHTML = '<p class="benchmark-empty">No backend data available</p>';
      return;
    }

    const backends = data.backends.backends;

    if (backends.length === 0) {
      container.innerHTML = '<p class="benchmark-empty">No backends configured</p>';
      return;
    }

    // Build benchmark cards
    container.innerHTML = backends.map(backend => `
      <div class="benchmark-card" data-backend-url="${encodeURIComponent(backend.url)}">
        <div class="benchmark-card-header">
          <div class="benchmark-card-title">
            <span class="benchmark-backend-name">${getBackendName(backend)}</span>
            <span class="benchmark-backend-status ${backend.healthy ? 'healthy' : 'unhealthy'}">
              ${backend.healthy ? 'Healthy' : 'Unhealthy'}
            </span>
          </div>
        </div>

        <div class="benchmark-card-controls">
          <div class="benchmark-type-select">
            <select class="benchmark-type-dropdown" data-backend-url="${encodeURIComponent(backend.url)}">
              <option value="">Select benchmark type...</option>
              <option value="speed">Speed Test</option>
              <option value="streaming">Streaming Test</option>
            </select>
          </div>

          <button class="benchmark-run-btn button button-secondary button-small" data-backend-url="${encodeURIComponent(backend.url)}" disabled>
            Run Benchmark
          </button>
        </div>

        <div class="benchmark-card-status" data-backend-url="${encodeURIComponent(backend.url)}">
          <span class="benchmark-status-text">Ready</span>
        </div>
      </div>
    `).join('');

    // Add event listeners for benchmark run buttons
    container.querySelectorAll('.benchmark-run-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const backendUrl = decodeURIComponent(btn.dataset.backendUrl);
        const card = container.querySelector(`[data-backend-url="${encodeURIComponent(backendUrl)}"]`);
        const select = card ? card.querySelector('select') : null;

        if (!select) {
          showNotification('Unable to find benchmark select control', 'error');
          return;
        }

        const type = select.value;

        if (!type) {
          showNotification('Please select a benchmark type', 'error');
          return;
        }

        runSingleBackendBenchmark(backendUrl, type);
      });
    });

    // Update button state when dropdown changes
    container.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', (e) => {
        const backendUrl = decodeURIComponent(e.target.dataset.backendUrl);
        const btn = container.querySelector(`[data-backend-url="${encodeURIComponent(backendUrl)}"] .benchmark-run-btn`);
        if (btn) {
          btn.disabled = !e.target.value;
        }
      });
    });
  }

  /**
   * Run a single-backend benchmark (speed or streaming)
   */
  async function runSingleBackendBenchmark(backendUrl, type) {
    const container = document.getElementById('benchmarkBackendsGrid');
    const card = container ? container.querySelector(`[data-backend-url="${encodeURIComponent(backendUrl)}"]`) : null;

    if (!card) {
      showNotification('Unable to find benchmark card', 'error');
      return;
    }

    const statusEl = card.querySelector('.benchmark-status-text');
    const btn = card.querySelector('.benchmark-run-btn');

    if (!statusEl || !btn) {
      showNotification('Unable to find benchmark controls', 'error');
      return;
    }

    statusEl.textContent = 'Running...';
    btn.disabled = true;

    let result;
    if (type === 'speed') {
      result = await apiClient.runSpeedBenchmark(backendUrl, { tokens: 5000, maxTokens: 10 });
    } else if (type === 'streaming') {
      result = await apiClient.runStreamingBenchmark(backendUrl, { tokens: 2000, maxTokens: 50 });
    }

    if (result.success) {
      statusEl.textContent = 'Benchmark started (job: ' + result.data.jobId.slice(0, 8) + '...)';
      // Poll for result
      pollBenchmarkResult(result.data.jobId);
    } else {
      statusEl.textContent = 'Error: ' + result.error;
      btn.disabled = false;
    }
  }

  /**
   * Poll for a benchmark result
   */
  async function pollBenchmarkResult(jobId) {
    const poll = async () => {
      const result = await apiClient.getBenchmarkResult(jobId);

      if (result.success) {
        const data = result.data;

        if (data.status === 'completed') {
          // Add result to results list
          loadBenchmarkResults();
          // Remove from polling
          return;
        } else if (data.status === 'failed') {
          showNotification('Benchmark failed: ' + (data.error || 'Unknown error'), 'error');
          return;
        }
      }

      // Continue polling
      setTimeout(poll, 500);
    };

    poll();
  }

  /**
   * Run prompt caching benchmark
   */
  async function runPromptCachingBenchmark() {
    const progress = document.getElementById('multiBenchmarkProgress');
    const progressFill = document.getElementById('benchmarkProgressFill');
    const progressText = document.getElementById('benchmarkProgressText');
    const btn = document.getElementById('runPromptCachingBenchmark');

    // Get options
    const numPrompts = parseInt(document.getElementById('benchmarkNumPrompts').value) || 4;
    const tokens = parseInt(document.getElementById('benchmarkTokens').value) || 5000;
    const model = document.getElementById('benchmarkModel').value || 'qwen/qwen3.5-35b-a3b';

    progress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Initializing benchmark...';
    btn.disabled = true;

    const result = await apiClient.runPromptCachingBenchmark({ numPrompts, tokens, model });

    if (result.success) {
      progressFill.style.width = '10%';
      progressText.textContent = 'Benchmark started (job: ' + result.data.jobId.slice(0, 8) + '...)';

      // Poll for completion
      const poll = async () => {
        const checkResult = await apiClient.getBenchmarkResult(result.data.jobId);

        if (checkResult.success) {
          const data = checkResult.data;

          if (data.status === 'completed') {
            progressFill.style.width = '100%';
            progressText.textContent = 'Benchmark completed!';
            loadBenchmarkResults();
            btn.disabled = false;

            // Hide progress after 3 seconds
            setTimeout(() => {
              progress.style.display = 'none';
            }, 3000);
            return;
          } else if (data.status === 'failed') {
            progressFill.style.width = '0%';
            progressText.textContent = 'Benchmark failed: ' + (data.error || 'Unknown error');
            btn.disabled = false;

            setTimeout(() => {
              progress.style.display = 'none';
            }, 5000);
            return;
          }

          // Update progress based on status
          const progressPct = data.status === 'running' ? 50 : 25;
          progressFill.style.width = progressPct + '%';
          progressText.textContent = 'Running benchmark...' + (data.status === 'running' ? ' (testing ' + numPrompts + ' backends)' : '');
        }

        setTimeout(poll, 500);
      };

      poll();
    } else {
      progress.style.display = 'none';
      btn.disabled = false;
      showNotification('Failed to start benchmark: ' + result.error, 'error');
    }
  }

  /**
   * Load and display benchmark results
   */
  async function loadBenchmarkResults() {
    const container = document.getElementById('benchmarkResultsList');
    if (!container) return;

    const result = await apiClient.listBenchmarkResults();

    if (!result.success || !result.data?.results || result.data.results.length === 0) {
      container.innerHTML = '<p class="benchmark-empty">No benchmark results yet. Run a benchmark to see results here.</p>';
      return;
    }

    // Render results
    container.innerHTML = result.data.results.map(item => {
      const statusClass = item.status === 'completed' ? 'status-completed' : (item.status === 'failed' ? 'status-failed' : 'status-running');
      const statusText = item.status === 'completed' ? 'Completed' : (item.status === 'failed' ? 'Failed' : 'Running');

      const resultData = item.result || {};
      const results = resultData.results || {};

      let resultPreview = '';
      if (item.type === 'speed' && results.firstRequest) {
        const first = results.firstRequest;
        const second = results.secondRequest || {};
        resultPreview = `
          <div class="benchmark-result-speed">
            <div class="result-row">
              <span class="result-label">First Request</span>
              <span class="result-value">${first.elapsed_ms ? first.elapsed_ms.toFixed(0) + 'ms' : 'N/A'} (${first.prompt_speed.toFixed(1)} t/s)</span>
            </div>
            <div class="result-row">
              <span class="result-label">Second Request</span>
              <span class="result-value">${second.elapsed_ms ? second.elapsed_ms.toFixed(0) + 'ms' : 'N/A'} (${second.prompt_speed.toFixed(1)} t/s)</span>
            </div>
            <div class="result-row">
              <span class="result-label">Speedup</span>
              <span class="result-value">${results.speedup ? results.speedup.toFixed(2) + 'x' : 'N/A'}</span>
            </div>
          </div>
        `;
      } else if (item.type === 'streaming') {
        const streaming = results || {};
        resultPreview = `
          <div class="benchmark-result-streaming">
            <div class="result-row">
              <span class="result-label">Time to First Chunk</span>
              <span class="result-value">${streaming.timeToFirstChunkMs ? streaming.timeToFirstChunkMs.toFixed(0) + 'ms' : 'N/A'}</span>
            </div>
            <div class="result-row">
              <span class="result-label">Throughput</span>
              <span class="result-value">${streaming.throughputTokensPerSecond ? streaming.throughputTokensPerSecond + ' t/s' : 'N/A'}</span>
            </div>
          </div>
        `;
      } else if (item.type === 'prompt-caching') {
        const caching = results || {};
        resultPreview = `
          <div class="benchmark-result-prompt-caching">
            <div class="result-row">
              <span class="result-label">Successful Pairs</span>
              <span class="result-value">${caching.successfulPairs || 0}/${caching.totalPairs || 0}</span>
            </div>
            <div class="result-row">
              <span class="result-label">Overall Speedup</span>
              <span class="result-value">${caching.overallSpeedup ? caching.overallSpeedup + 'x' : 'N/A'}</span>
            </div>
            <div class="result-row">
              <span class="result-label">Improvement</span>
              <span class="result-value">${caching.improvementPercent ? caching.improvementPercent + '%' : 'N/A'}</span>
            </div>
          </div>
        `;
      }

      return `
        <div class="benchmark-result-card" data-job-id="${item.jobId}">
          <div class="benchmark-result-header">
            <div class="benchmark-result-meta">
              <span class="benchmark-result-type">${item.type}</span>
              <span class="benchmark-result-status ${statusClass}">${statusText}</span>
              <span class="benchmark-result-time">${new Date(item.createdAt).toLocaleString()}</span>
            </div>
            <div class="benchmark-result-actions">
              ${item.status === 'completed' ? `
                <button class="button button-secondary button-small result-actions-btn" data-job-id="${item.jobId}" data-action="view">
                  View Details
                </button>
                <button class="button button-secondary button-small result-actions-btn" data-job-id="${item.jobId}" data-action="download">
                  Download
                </button>
              ` : ''}
              <button class="button button-danger button-small result-actions-btn" data-job-id="${item.jobId}" data-action="delete">
                Delete
              </button>
            </div>
          </div>

          ${item.status === 'completed' ? resultPreview : ''}

          <div class="benchmark-result-details" data-job-id="${item.jobId}" style="display: none;">
            <pre>${JSON.stringify(item, null, 2)}</pre>
          </div>

          ${item.error ? `<div class="benchmark-result-error">Error: ${item.error}</div>` : ''}
        </div>
      `;
    }).join('');

    // Add event listeners
    container.querySelectorAll('.result-actions-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const jobId = e.target.dataset.jobId;
        const action = e.target.dataset.action;

        if (action === 'delete') {
          if (confirm('Delete this benchmark result?')) {
            await apiClient.deleteBenchmarkResult(jobId);
            loadBenchmarkResults();
          }
        } else if (action === 'view') {
          const details = container.querySelector(`.benchmark-result-details[data-job-id="${jobId}"]`);
          details.style.display = details.style.display === 'none' ? 'block' : 'none';
        } else if (action === 'download') {
          const result = await apiClient.getBenchmarkResult(jobId);
          if (result.success && result.data) {
            const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `benchmark-${jobId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }
        }
      });
    });
  }

  // ============================================================
  // CHART VISUALIZATION FUNCTIONS (Chart.js integration)
  // ============================================================

  /**
   * Chart instances registry for cleanup
   */
  const chartInstances = {};

  /**
   * Last rendered data snapshot for change detection
   * This tracks the last rendered state to avoid unnecessary re-renders
   * Uses JSON serialization to compare data snapshots
   */
  let lastRenderedSnapshot = null;

  /**
   * Compute a hash/snapshot of the current stats data for change detection
   * @param {Object} statsData - Statistics data from API
   * @returns {string} Hash of relevant data fields
   */
  function computeDataSnapshot(statsData) {
    if (!statsData?.backendDetails) return null;

    // Only track relevant data fields that affect charts
    const snapshot = statsData.backendDetails.map(b => ({
      url: b.url,
      name: b.name,
      totalTimeMs: b.performanceStats?.rawSamples?.timeStats?.totalTimeMs?.length || 0,
      generationTimeMs: b.performanceStats?.rawSamples?.generationTimeMs?.length || 0,
      totalTokens: b.performanceStats?.rawSamples?.tokenStats?.totalTokens?.length || 0,
      generationRate: b.performanceStats?.rawSamples?.rateStats?.generationRate?.length || 0,
      cacheHits: b.promptCacheStats?.totalHits || 0
    }));

    return JSON.stringify(snapshot);
  }

  /**
   * Clean up a chart instance before creating a new one
   * @param {string} canvasId - The ID of the canvas element
   */
  function cleanupChart(canvasId) {
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }
  }

  /**
   * Clean up a chart instance before creating a new one
   * @param {string} canvasId - The ID of the canvas element
   */
  function cleanupChart(canvasId) {
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }
  }

  /**
   * Format URL for display in chart labels
   * @param {string} url - The URL to format
   * @returns {string} Formatted URL
   */
  function formatUrl(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}:${parsed.port || parsed.protocol === 'https:' ? '443' : '80'}`;
    } catch {
      return url;
    }
  }

  /**
   * Get backend name for display, falling back to formatted URL if not available
   * @param {Object} backend - The backend object with name and url properties
   * @returns {string} Backend name or formatted URL
   */
  function getBackendName(backend) {
    if (backend.name && backend.name.trim()) {
      return backend.name;
    }
    return formatUrl(backend.url);
  }

  /**
   * Render time metrics line charts (Total Time, Generation Time, Network Latency, Prompt Processing)
   * Uses incremental updates pattern - returns early if DOM doesn't exist
   * @param {Object} statsData - Statistics data from API
   */
  function renderTimeMetricsCharts(statsData) {
    // Return early if section not active
    if (!isChartSectionActive()) return;

    let backendDetails = statsData?.backendDetails || [];
    if (backendDetails.length === 0) return;

    // Apply backend filter
    backendDetails = getFilteredBackends(backendDetails);
    if (backendDetails.length === 0) return;

    // Cleanup existing charts
    ['totalTime', 'generationTime', 'networkLatency', 'promptProcessing'].forEach(type => {
      cleanupChart(`${type}Chart`);
    });

    // Check if any backend has data for each metric type
    const hasTotalTime = backendDetails.some(b => b.performanceStats?.rawSamples?.timeStats?.totalTimeMs?.length > 0);
    const hasGenerationTime = backendDetails.some(b => b.performanceStats?.rawSamples?.timeStats?.generationTimeMs?.length > 0);
    const hasNetworkLatency = backendDetails.some(b => b.performanceStats?.rawSamples?.timeStats?.networkLatencyMs?.length > 0);
    const hasPromptProcessing = backendDetails.some(b => b.performanceStats?.rawSamples?.timeStats?.promptProcessingTimeMs?.length > 0);

    // Total Time Chart - Show all filtered backends
    const totalTimeCanvas = document.getElementById('totalTimeChart');
    if (totalTimeCanvas && hasTotalTime) {
      const ctx = totalTimeCanvas.getContext('2d');
      const datasets = backendDetails.map((backend, index) => {
        const totalTimeMs = getFilteredSamples(backend.performanceStats?.rawSamples?.timeStats?.totalTimeMs || []);
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];
        return {
          label: `${getBackendName(backend)} - Total Time`,
          data: totalTimeMs,
          borderColor: colors[index % colors.length],
          backgroundColor: `rgba(${(index * 60 + 59) % 256}, ${(index * 40 + 130) % 256}, ${(index * 30 + 246) % 256}, 0.1)`,
          borderWidth: 2,
          fill: true,
          tension: 0.3
        };
      });
      chartInstances.totalTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: backendDetails[0].performanceStats?.rawSamples?.timeStats?.totalTimeMs?.map((_, i) => `#${i + 1}`) || [],
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)} ms`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Time (ms)' }
            }
          }
        }
      });
    } else if (totalTimeCanvas) {
      totalTimeCanvas.parentElement.innerHTML = '<p class="chart-no-data">No time data available yet</p>';
    }

    // Generation Time Chart - Show all filtered backends
    const generationTimeCanvas = document.getElementById('generationTimeChart');
    if (generationTimeCanvas && hasGenerationTime) {
      const ctx = generationTimeCanvas.getContext('2d');
      const datasets = backendDetails.map((backend, index) => {
        const generationTimeMs = getFilteredSamples(backend.performanceStats?.rawSamples?.timeStats?.generationTimeMs || []);
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];
        return {
          label: `${getBackendName(backend)} - Generation Time`,
          data: generationTimeMs,
          borderColor: colors[index % colors.length],
          backgroundColor: `rgba(${(index * 60 + 59) % 256}, ${(index * 40 + 130) % 256}, ${(index * 30 + 246) % 256}, 0.1)`,
          borderWidth: 2,
          fill: true,
          tension: 0.3
        };
      });
      chartInstances.generationTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: backendDetails[0].performanceStats?.rawSamples?.timeStats?.generationTimeMs?.map((_, i) => `#${i + 1}`) || [],
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)} ms`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Time (ms)' }
            }
          }
        }
      });
    } else if (generationTimeCanvas) {
      generationTimeCanvas.parentElement.innerHTML = '<p class="chart-no-data">No generation time data available yet</p>';
    }

    // Network Latency Chart - Show all filtered backends
    const networkLatencyCanvas = document.getElementById('networkLatencyChart');
    if (networkLatencyCanvas && hasNetworkLatency) {
      const ctx = networkLatencyCanvas.getContext('2d');
      const datasets = backendDetails.map((backend, index) => {
        const networkLatencyMs = getFilteredSamples(backend.performanceStats?.rawSamples?.timeStats?.networkLatencyMs || []);
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];
        return {
          label: `${getBackendName(backend)} - Network Latency`,
          data: networkLatencyMs,
          borderColor: colors[index % colors.length],
          backgroundColor: `rgba(${(index * 60 + 59) % 256}, ${(index * 40 + 130) % 256}, ${(index * 30 + 246) % 256}, 0.1)`,
          borderWidth: 2,
          fill: true,
          tension: 0.3
        };
      });
      chartInstances.networkLatencyChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: backendDetails[0].performanceStats?.rawSamples?.timeStats?.networkLatencyMs?.map((_, i) => `#${i + 1}`) || [],
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)} ms`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Time (ms)' }
            }
          }
        }
      });
    } else if (networkLatencyCanvas) {
      networkLatencyCanvas.parentElement.innerHTML = '<p class="chart-no-data">No network latency data available yet</p>';
    }

    // Prompt Processing Chart - Show all filtered backends
    const promptProcessingCanvas = document.getElementById('promptProcessingChart');
    if (promptProcessingCanvas && hasPromptProcessing) {
      const ctx = promptProcessingCanvas.getContext('2d');
      const datasets = backendDetails.map((backend, index) => {
        const promptProcessingMs = getFilteredSamples(backend.performanceStats?.rawSamples?.timeStats?.promptProcessingTimeMs || []);
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];
        return {
          label: `${getBackendName(backend)} - Prompt Processing`,
          data: promptProcessingMs,
          borderColor: colors[index % colors.length],
          backgroundColor: `rgba(${(index * 60 + 59) % 256}, ${(index * 40 + 130) % 256}, ${(index * 30 + 246) % 256}, 0.1)`,
          borderWidth: 2,
          fill: true,
          tension: 0.3
        };
      });
      chartInstances.promptProcessingChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: backendDetails[0].performanceStats?.rawSamples?.timeStats?.promptProcessingTimeMs?.map((_, i) => `#${i + 1}`) || [],
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)} ms`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Time (ms)' }
            }
          }
        }
      });
    } else if (promptProcessingCanvas) {
      promptProcessingCanvas.parentElement.innerHTML = '<p class="chart-no-data">No prompt processing data available yet</p>';
    }
  }

  /**
   * Render token metrics bar charts
   * Uses incremental updates pattern - returns early if DOM doesn't exist
   * @param {Object} statsData - Statistics data from API
   */
  function renderTokenMetricsCharts(statsData) {
    // Return early if section not active
    if (!isChartSectionActive()) return;

    let backendDetails = statsData?.backendDetails || [];
    if (backendDetails.length === 0) return;

    // Apply backend filter
    backendDetails = getFilteredBackends(backendDetails);
    if (backendDetails.length === 0) return;

    // Token Comparison Chart (Grouped Bar)
    cleanupChart('tokenComparisonChart');

    const backends = backendDetails.filter(b => b.performanceStats?.rawSamples);
    if (backends.length === 0) return;

    const tokenComparisonCanvas = document.getElementById('tokenComparisonChart');
    if (tokenComparisonCanvas) {
      const promptTokens = backends.map(b => {
        const samples = b.performanceStats.rawSamples.tokenStats;
        const arr = samples?.promptTokens || [];
        return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      });
      const completionTokens = backends.map(b => {
        const samples = b.performanceStats.rawSamples.tokenStats;
        const arr = samples?.completionTokens || [];
        return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      });
      const totalTokens = backends.map(b => {
        const samples = b.performanceStats.rawSamples.tokenStats;
        const arr = samples?.totalTokens || [];
        return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      });

      const ctx = tokenComparisonCanvas.getContext('2d');
      chartInstances.tokenComparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: backends.map(b => getBackendName(b)),
          datasets: [
            {
              label: 'Avg Prompt Tokens',
              data: promptTokens,
              backgroundColor: 'rgba(59, 130, 246, 0.8)',
              borderColor: 'rgba(59, 130, 246, 1)',
              borderWidth: 1
            },
            {
              label: 'Avg Completion Tokens',
              data: completionTokens,
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              borderColor: 'rgba(16, 185, 129, 1)',
              borderWidth: 1
            },
            {
              label: 'Avg Total Tokens',
              data: totalTokens,
              backgroundColor: 'rgba(107, 114, 128, 0.8)',
              borderColor: 'rgba(107, 114, 128, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Average Token Count' }
            }
          }
        }
      });
    }

    // Token Distribution Chart (Per Backend) - Bar chart comparing all backends
    cleanupChart('tokenDistributionChart');
    const tokenDistributionCanvas = document.getElementById('tokenDistributionChart');
    if (tokenDistributionCanvas && backends.length > 0) {
      const ctx = tokenDistributionCanvas.getContext('2d');

      // Calculate average token counts for each backend
      const promptTokens = backends.map(b => {
        const samples = b.performanceStats.rawSamples.tokenStats;
        const prompt = samples?.promptTokens || [];
        return prompt.length > 0 ? prompt.reduce((a, b) => a + b, 0) / prompt.length : 0;
      });

      const completionTokens = backends.map(b => {
        const samples = b.performanceStats.rawSamples.tokenStats;
        const completion = samples?.completionTokens || [];
        return completion.length > 0 ? completion.reduce((a, b) => a + b, 0) / completion.length : 0;
      });

      chartInstances.tokenDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: backends.map(b => getBackendName(b)),
          datasets: [
            {
              label: 'Avg Prompt Tokens',
              data: promptTokens,
              backgroundColor: 'rgba(59, 130, 246, 0.8)',
              borderColor: 'rgba(59, 130, 246, 1)',
              borderWidth: 1
            },
            {
              label: 'Avg Completion Tokens',
              data: completionTokens,
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              borderColor: 'rgba(16, 185, 129, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: true, text: 'Average Token Counts Comparison (All Backends)' }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Average Token Count' }
            }
          }
        }
      });
    }
  }

  /**
   * Render rate metrics comparison charts
   * Uses incremental updates pattern - returns early if DOM doesn't exist
   * @param {Object} statsData - Statistics data from API
   */
  function renderRateMetricsCharts(statsData) {
    // Return early if section not active
    if (!isChartSectionActive()) return;

    let backendDetails = statsData?.backendDetails || [];
    if (backendDetails.length === 0) return;

    // Apply backend filter
    backendDetails = getFilteredBackends(backendDetails);
    if (backendDetails.length === 0) return;

    // Generation Rate Chart
    cleanupChart('generationRateChart');

    const backends = backendDetails.filter(b => b.performanceStats?.rawSamples);
    const generationRateCanvas = document.getElementById('generationRateChart');
    if (generationRateCanvas) {
      const rates = backends.map(b => {
        const samples = b.performanceStats.rawSamples.rateStats;
        const arr = samples?.generationRate || [];
        return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      });

      const ctx = generationRateCanvas.getContext('2d');
      chartInstances.generationRateChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: backends.map(b => getBackendName(b)),
          datasets: [{
            label: 'Avg Generation Rate (tokens/sec)',
            data: rates,
            backgroundColor: 'rgba(139, 92, 246, 0.8)',
            borderColor: 'rgba(139, 92, 246, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Tokens/Second' }
            }
          }
        }
      });
    }

    // Total Rate Over Time Chart - Show all filtered backends
    cleanupChart('totalRateChart');
    const totalRateCanvas = document.getElementById('totalRateChart');
    if (totalRateCanvas && backends.length > 0) {
      const ctx = totalRateCanvas.getContext('2d');
      const datasets = backends.map((backend, index) => {
        const samples = backend.performanceStats.rawSamples.rateStats;
        const totalRate = getFilteredSamples(samples?.totalRate || []);
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];
        return {
          label: `${getBackendName(backend)} - Total Rate`,
          data: totalRate,
          borderColor: colors[index % colors.length],
          backgroundColor: `rgba(${(index * 60 + 236) % 256}, 72, 153, 0.1)`,
          borderWidth: 2,
          fill: true,
          tension: 0.3
        };
      });
      chartInstances.totalRateChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: backends[0].performanceStats?.rawSamples?.rateStats?.totalRate?.map((_, i) => `#${i + 1}`) || [],
          datasets
        },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                  legend: { display: true, position: 'top' }
              },
              scales: {
                  y: {
                      beginAtZero: true,
                      title: { display: true, text: 'Tokens/Second' }
                  }
              }
          }
      });
    } else {
        totalRateCanvas.parentElement.innerHTML = '<p class="chart-no-data">No rate data available yet</p>';
    }
  }

  /**
   * Create a gauge chart for backend utilization
   * Uses a doughnut chart with masked second dataset to create gauge effect
   * @param {HTMLCanvasElement} canvas - The canvas element for the gauge
   * @param {number} value - Current value (0-100%)
   * @param {string} label - Label to display
   * @param {string} statusText - Status text (Normal/Warning/Critical)
   */
  function createGaugeChart(canvas, value, label, statusText) {
    if (!canvas) return null;

    // Normalize value to 0-1 range for chart
    const normalizedValue = value / 100;

    // Determine color based on utilization thresholds
    let gaugeColor;
    if (value < 70) {
      gaugeColor = '#10b981'; // Green - Low utilization
    } else if (value < 90) {
      gaugeColor = '#f59e0b'; // Yellow - Medium utilization
    } else {
      gaugeColor = '#ef4444'; // Red - High utilization
    }

    const ctx = canvas.getContext('2d');

    // Create gauge using doughnut chart with two datasets:
    // 1. Actual value (partial arc from 0 to value)
    // 2. Mask (full circle, covers first dataset except visible portion)
    const gaugeChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Used', 'Remaining'],
        datasets: [
          {
            data: [normalizedValue, 0],
            backgroundColor: gaugeColor,
            borderWidth: 0,
            circumference: 180,
            rotation: 0,
            cutout: '80%',
            spacing: 0
          },
          {
            data: [1, 0],
            backgroundColor: '#e5e7eb',
            borderWidth: 0,
            circumference: 180,
            rotation: 180,
            cutout: '80%',
            spacing: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { enabled: false },
          legend: { display: false },
          title: {
            display: true,
            text: `${label}\n${value.toFixed(0)}% ${statusText}`,
            font: { size: 13 },
            padding: { bottom: 10 }
          }
        },
        layout: {
          padding: { top: 5, bottom: 10 }
        }
      }
    });

    return gaugeChart;
  }

  /**
   * Render health metrics charts including cache efficiency
   * @param {Object} statsData - Statistics data from API
   */
  function renderHealthMetricsCharts(statsData) {
    // Return early if section not active
    if (!isChartSectionActive()) return;

    const backendDetails = statsData?.backendDetails || [];
    if (backendDetails.length === 0) return;

    // Cache Efficiency Chart (Bar chart showing hit rate per backend)
    cleanupChart('cacheEfficiencyChart');
    const cacheChartCanvas = document.getElementById('cacheEfficiencyChart');
    if (cacheChartCanvas && backendDetails.length > 0) {
      const ctx = cacheChartCanvas.getContext('2d');

      // Calculate cache hit rate for each backend
      const hitRates = backendDetails.map(b => {
        const cacheStats = b.promptCacheStats || {};
        const hits = cacheStats.totalHits || 0;
        const misses = cacheStats.totalMisses || 0;
        const total = hits + misses;
        return total > 0 ? (hits / total) * 100 : 0;
      });

      const totalRequests = backendDetails.map(b => {
        const cacheStats = b.promptCacheStats || {};
        return (cacheStats.totalHits || 0) + (cacheStats.totalMisses || 0);
      });

      chartInstances.cacheEfficiencyChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: backendDetails.map(b => getBackendName(b)),
          datasets: [
            {
              label: 'Cache Hit Rate (%)',
              data: hitRates,
              backgroundColor: backendDetails.map(b => {
                const cacheStats = b.promptCacheStats || {};
                const hits = cacheStats.totalHits || 0;
                const misses = cacheStats.totalMisses || 0;
                const total = hits + misses;
                const rate = total > 0 ? (hits / total) * 100 : 0;
                return rate >= 80 ? '#10b981' : (rate >= 50 ? '#f59e0b' : '#ef4444');
              }),
              borderColor: backendDetails.map(b => {
                const cacheStats = b.promptCacheStats || {};
                const hits = cacheStats.totalHits || 0;
                const misses = cacheStats.totalMisses || 0;
                const total = hits + misses;
                const rate = total > 0 ? (hits / total) * 100 : 0;
                return rate >= 80 ? '#059669' : (rate >= 50 ? '#d97706' : '#dc2626');
              }),
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Cache Hit Rate by Backend' },
            tooltip: {
              callbacks: {
                afterLabel: (context) => {
                  const index = context.dataIndex;
                  const totalReq = totalRequests[index];
                  return [`Total Requests: ${totalReq}`];
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              title: { display: true, text: 'Hit Rate (%)' },
              ticks: { callback: (value) => `${value}%` }
            }
          }
        }
      });
    } else if (cacheChartCanvas) {
      cacheChartCanvas.parentElement.innerHTML = '<p class="chart-no-data">No cache data available yet</p>';
    }
  }

  /**
   * Check if chart visualization section is active (overview section is visible)
   * @returns {boolean} True if the overview section is currently active
   */
  function isChartSectionActive() {
    return (currentSection === 'overview' || currentSection === 'statistics') && document.getElementById('statsVisualizationSection') !== null;
  }

  /**
   * Update chart visualizations incrementally (preserves DOM, prevents re-render flicker)
   * This uses the "incremental updates" pattern - only update values when DOM exists
   * AND when data actually changes (change detection)
   * @param {Object} statsData - Statistics data from API
   */
  function updateStatsVisualization(statsData) {
    // Return early if section not active (DOM not rendered)
    if (!isChartSectionActive()) return;

    // Change detection for main stats: compute snapshot and compare with last rendered
    const currentSnapshot = computeDataSnapshot(statsData);
    const hasChanged = currentSnapshot !== lastRenderedSnapshot;

    // Only re-render if data has changed
    if (hasChanged) {
      lastRenderedSnapshot = currentSnapshot;
      renderTimeMetricsCharts(statsData);
      renderTokenMetricsCharts(statsData);
      renderRateMetricsCharts(statsData);
      renderHealthMetricsCharts(statsData);
      renderDistributionCharts(statsData);
    }
  }

  /**
   * Render distribution charts
   * Uses incremental updates pattern - returns early if DOM doesn't exist
   * @param {Object} statsData - Statistics data from API
   */
  function renderDistributionCharts(statsData) {
    // Return early if section not active
    if (!isChartSectionActive()) return;

    let backendDetails = statsData?.backendDetails || [];
    if (backendDetails.length === 0) return;

    // Apply backend filter
    backendDetails = getFilteredBackends(backendDetails);
    if (backendDetails.length === 0) return;

    // Total Time Box Plot
    cleanupChart('totalTimeBoxPlot');
    const boxPlotCanvas = document.getElementById('totalTimeBoxPlot');
    if (boxPlotCanvas && backendDetails.length > 0) {
      // Prepare box plot data for each backend
      const backends = backendDetails.filter(b => b.performanceStats?.rawSamples?.timeStats?.totalTimeMs);

      if (backends.length > 0) {
        const ctx = boxPlotCanvas.getContext('2d');

        // Calculate quartiles for each backend
        const backendStats = backends.map(backend => {
          const totalTimeMs = backend.performanceStats.rawSamples.timeStats.totalTimeMs;
          const sorted = [...totalTimeMs].sort((a, b) => a - b);
          const n = sorted.length;
          return {
            name: getBackendName(backend),
            min: sorted[0],
            q1: sorted[Math.floor(n * 0.25)],
            median: sorted[Math.floor(n * 0.5)],
            q3: sorted[Math.floor(n * 0.75)],
            max: sorted[n - 1],
            avg: totalTimeMs.reduce((a, b) => a + b, 0) / totalTimeMs.length
          };
        });

        chartInstances.totalTimeBoxPlot = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: backendStats.map(s => s.name),
            datasets: [
              {
                label: 'Average',
                data: backendStats.map(s => s.avg),
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
                stack: 'Stack 0',
                order: 2
              },
              {
                label: 'P50 (Median)',
                data: backendStats.map(s => s.median),
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1,
                stack: 'Stack 0',
                order: 1
              },
              {
                label: 'P25',
                data: backendStats.map(s => s.q1),
                backgroundColor: 'rgba(245, 158, 11, 0.5)',
                borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 1,
                stack: 'Stack 1',
                order: 3,
                pointRadius: 3
              },
              {
                label: 'P75',
                data: backendStats.map(s => s.q3),
                backgroundColor: 'rgba(139, 92, 246, 0.5)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1,
                stack: 'Stack 1',
                order: 4,
                pointRadius: 3
              }
            ]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: true, position: 'top' },
              tooltip: {
                callbacks: {
                  title: (context) => `Backend: ${context[0].label}`,
                  label: (context) => {
                    const stat = backendStats[context.datasetIndex];
                    if (stat) {
                      return `${context.dataset.label}: ${Math.round(context.raw)}ms`;
                    }
                    return '';
                  }
                }
              }
            },
            scales: {
              x: {
                title: { display: true, text: 'Time (ms)' },
                stacked: true
              },
              y: {
                stacked: true
              }
            }
          }
        });
      } else {
        boxPlotCanvas.parentElement.innerHTML = '<p class="chart-no-data">No time data available yet</p>';
      }
    }

    // Generation Rate Distribution Histogram
    cleanupChart('generationRateHistogram');
    const rateHistogramCanvas = document.getElementById('generationRateHistogram');
    if (rateHistogramCanvas && backendDetails.length > 0) {
      const backends = backendDetails.filter(b => b.performanceStats?.rawSamples?.rateStats?.generationRate);

      if (backends.length > 0) {
        // Combine all generation rates from all backends
        const allRates = [];
        backends.forEach(backend => {
          const rates = backend.performanceStats.rawSamples.rateStats.generationRate;
          allRates.push(...rates);
        });

        // Create histogram bins
        const bins = [
          { range: '0-10', label: '0-10', count: 0 },
          { range: '10-20', label: '10-20', count: 0 },
          { range: '20-30', label: '20-30', count: 0 },
          { range: '30-40', label: '30-40', count: 0 },
          { range: '40-50', label: '40-50', count: 0 },
          { range: '50+', label: '50+', count: 0 }
        ];

        allRates.forEach(rate => {
          if (rate <= 10) bins[0].count++;
          else if (rate <= 20) bins[1].count++;
          else if (rate <= 30) bins[2].count++;
          else if (rate <= 40) bins[3].count++;
          else if (rate <= 50) bins[4].count++;
          else bins[5].count++;
        });

        const ctx = rateHistogramCanvas.getContext('2d');
        chartInstances.generationRateHistogram = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: bins.map(b => b.label),
            datasets: [{
              label: 'Generation Rate Distribution',
              data: bins.map(b => b.count),
              backgroundColor: 'rgba(59, 130, 246, 0.7)',
              borderColor: 'rgba(59, 130, 246, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.parsed.y} requests in ${bins[ctx.dataIndex].range} t/s`
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: { display: true, text: 'Number of Samples' }
              },
              x: {
                title: { display: true, text: 'Generation Rate (tokens/sec)' }
              }
            }
          }
        });
      } else {
        rateHistogramCanvas.parentElement.innerHTML = '<p class="chart-no-data">No rate data available yet</p>';
      }
    }
  }

  /**
   * P12: Interactive filtering and time range selection
   * Enables users to filter charts by time range and backends
   * @type {Object}
   */
  const chartFilterState = {
    timeRange: 'all',
    selectedBackends: []
  };

  /**
   * Populate backend filter checkboxes based on available backends
   * @param {Array} backendDetails - Array of backend details from API
   */
  function populateBackendFilter(backendDetails) {
    const backendFilterContainer = document.getElementById('backendFilter');
    if (!backendFilterContainer || !backendDetails || backendDetails.length === 0) {
      return;
    }

    // Clear existing checkboxes
    backendFilterContainer.innerHTML = '';

    // Create checkboxes for each backend
    backendDetails.forEach(backend => {
      const backendId = `backend-${backend.id || backend.url}`;
      const label = document.createElement('label');
      label.className = 'backend-checkbox-label';
      label.style.display = 'block';
      label.style.margin = '0.25rem 0';
      label.style.cursor = 'pointer';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = backendId;
      checkbox.value = backend.id || backend.url;
      checkbox.checked = true; // Select all by default
      checkbox.addEventListener('change', handleBackendFilterChange);

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(getBackendName(backend)));

      backendFilterContainer.appendChild(label);
    });

    // Set initial state from checked boxes
    updateBackendFilterState();
  }

  /**
   * Handle backend filter checkbox changes
   */
  function handleBackendFilterChange() {
    updateBackendFilterState();
    refreshChartsWithFilters();
  }

  /**
   * Update backend filter state from checkboxes
   */
  function updateBackendFilterState() {
    const checkboxes = document.querySelectorAll('#backendFilter input[type="checkbox"]:checked');
    chartFilterState.selectedBackends = Array.from(checkboxes).map(cb => cb.value);
  }

  /**
   * Refresh all charts with current filter settings
   */
  function refreshChartsWithFilters() {
    // Reload the current stats data to apply filters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'stats') {
      const url = '/api/v1/stats';
      fetch(url)
        .then(res => res.json())
        .then(data => {
          updateStatsVisualization(data.stats);
        })
        .catch(err => {
          console.error('[Filter] Failed to refresh charts:', err);
        });
    }
  }

  /**
   * Get filtered backend details based on current filter state
   * @param {Array} backendDetails - All backend details
   * @returns {Array} Filtered backend details
   */
  function getFilteredBackends(backendDetails) {
    if (!chartFilterState.selectedBackends.length) {
      return backendDetails;
    }
    return backendDetails.filter(backend =>
      chartFilterState.selectedBackends.includes(backend.id || backend.url)
    );
  }

  /**
   * Get filtered samples based on time range selection
   * @param {Array} samples - Array of sample values
   * @param {number} limit - Maximum number of samples to return
   * @returns {Array} Filtered samples
   */
  function getFilteredSamples(samples, limit = null) {
    if (!samples || samples.length === 0) return [];

    if (chartFilterState.timeRange === 'all' || limit === null) {
      return samples;
    }

    const numSamples = Math.min(parseInt(chartFilterState.timeRange, 10), samples.length);
    return samples.slice(-numSamples);
  }

  /**
   * Initialize filter controls
   */
  function initFilterControls() {
    const timeRangeSelect = document.getElementById('timeRangeSelect');
    const backendFilterContainer = document.getElementById('backendFilter');
    const exportChartsBtn = document.getElementById('exportChartsBtn');
    const exportDataBtn = document.getElementById('exportDataBtn');
    const chartFilters = document.getElementById('chartFilters');

    // Show filters when chart section is active
    if (chartFilters) {
      chartFilters.style.display = 'flex';
    }

    // Time range change handler
    if (timeRangeSelect) {
      timeRangeSelect.addEventListener('change', (e) => {
        const selectedRange = e.target.value;
        chartFilterState.timeRange = selectedRange;
        localStorage.setItem('chartTimeRange', selectedRange);
        console.log(`[Filter] Time range changed to: ${selectedRange} requests`);
        refreshChartsWithFilters();
      });
    }

    // Backend filter checkboxes - populated dynamically when data is available
    if (backendFilterContainer) {
      console.log('[Filter] Backend filter container ready');
    }

    // Export charts as PNG
    if (exportChartsBtn) {
      exportChartsBtn.addEventListener('click', () => {
        console.log('[Export] Exporting all charts as PNG...');
        // Export each chart canvas as PNG
        Object.entries(chartInstances).forEach(([name, chart]) => {
          const canvas = chart.canvas;
          if (canvas) {
            const imageUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = `chart-${name}-${Date.now()}.png`;
            link.click();
          }
        });
        alert('Charts exported to your downloads folder!');
      });
    }

    // Export data as JSON
    if (exportDataBtn) {
      exportDataBtn.addEventListener('click', () => {
        console.log('[Export] Exporting statistics data as JSON...');
        fetch('/api/v1/stats')
          .then(res => res.json())
          .then(data => {
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `stats-export-${Date.now()}.json`;
            link.click();
            URL.revokeObjectURL(url);
          })
          .catch(err => {
            console.error('[Export] Failed to fetch stats:', err);
            alert('Failed to export data: ' + err.message);
          });
      });
    }

    // Restore saved time range
    const savedRange = localStorage.getItem('chartTimeRange');
    if (savedRange && timeRangeSelect) {
      timeRangeSelect.value = savedRange;
      chartFilterState.timeRange = savedRange;
    }
  }

  // Add filter controls initialization to init function
  const originalInit = init;
  init = function() {
    originalInit();
    // Initialize filter controls when chart section becomes active
    const observer = new MutationObserver(() => {
      if (document.getElementById('statsVisualizationSection')) {
        initFilterControls();
        observer.disconnect();
      }
    });
    observer.observe(document.getElementById('root'), { childList: true });
  };

  // Start the dashboard
  init();
});
