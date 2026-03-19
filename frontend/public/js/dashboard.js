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
                        <div class="chart-title">📉 Backend Utilization Gauges</div>
                        <div id="utilizationGauges" style="display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; height: calc(100% - 40px);"></div>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">🎯 Cache Hit/Miss Ratio</div>
                        <canvas id="cacheEfficiencyChart" class="chart-canvas"></canvas>
                      </div>
                    </div>
                  </section>

                  <!-- Queue Visualization -->
                  <section id="queueVisualizationSection" class="stats-section">
                    <h3 class="section-title">🗂️ Queue Visualization</h3>
                    <div class="chart-grid">
                      <div class="chart-container">
                        <div class="chart-title">📊 Queue Depth Over Time</div>
                        <canvas id="queueDepthChart" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">🎚️ Queue Utilization</div>
                        <canvas id="queueUtilizationChart" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">⏱️ Queue Wait Time Distribution</div>
                        <canvas id="queueWaitTimeChart" class="chart-canvas"></canvas>
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
                      <div class="chart-container">
                        <div class="chart-title">📋 Percentile Table</div>
                        <div id="percentileTable"></div>
                      </div>
                    </div>
                  </section>

                  <!-- Cross-Backend Correlation Analysis -->
                  <section id="correlationSection" class="stats-section">
                    <h3 class="section-title">🔗 Cross-Backend Correlation Analysis</h3>
                    <div class="chart-grid">
                      <div class="chart-container">
                        <div class="chart-title">🗺️ Correlation Heatmap</div>
                        <canvas id="correlationHeatmap" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                        <div class="chart-title">🕸️ Backend Performance Radar</div>
                        <canvas id="backendRadarChart" class="chart-canvas"></canvas>
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
        updateStatsVisualization(data.stats, data.queueStats);
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
    const validSections = ['overview', 'backends', 'benchmarks', 'debug', 'configuration'];
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
            <span class="benchmark-backend-name">${backend.name || formatUrl(backend.url)}</span>
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

    // Use the first backend for visualization
    const backend = backendDetails[0];
    if (!backend) return;

    const rawSamples = backend.performanceStats?.rawSamples || {};

    // Total Time Chart - Apply time range filter
    let totalTimeMs = rawSamples.timeStats?.totalTimeMs || [];
    totalTimeMs = getFilteredSamples(totalTimeMs);
    const totalTimeCanvas = document.getElementById('totalTimeChart');
    if (totalTimeCanvas && totalTimeMs.length > 0) {
      const ctx = totalTimeCanvas.getContext('2d');
      chartInstances.totalTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: totalTimeMs.map((_, i) => `#${i + 1}`),
          datasets: [{
            label: `${backend.name || formatUrl(backend.url)} - Total Time`,
            data: totalTimeMs,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `Request ${ctx.label}: ${ctx.parsed.y.toFixed(0)} ms`
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

    // Generation Time Chart - Apply time range filter
    let generationTimeMs = rawSamples.timeStats?.generationTimeMs || [];
    generationTimeMs = getFilteredSamples(generationTimeMs);
    const generationTimeCanvas = document.getElementById('generationTimeChart');
    if (generationTimeCanvas && generationTimeMs.length > 0) {
      const ctx = generationTimeCanvas.getContext('2d');
      chartInstances.generationTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: generationTimeMs.map((_, i) => `#${i + 1}`),
          datasets: [{
            label: `${backend.name || formatUrl(backend.url)} - Generation Time`,
            data: generationTimeMs,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `Request ${ctx.label}: ${ctx.parsed.y.toFixed(0)} ms`
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

    // Network Latency Chart - Apply time range filter
    let networkLatencyMs = rawSamples.timeStats?.networkLatencyMs || [];
    networkLatencyMs = getFilteredSamples(networkLatencyMs);
    const networkLatencyCanvas = document.getElementById('networkLatencyChart');
    if (networkLatencyCanvas && networkLatencyMs.length > 0) {
      const ctx = networkLatencyCanvas.getContext('2d');
      chartInstances.networkLatencyChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: networkLatencyMs.map((_, i) => `#${i + 1}`),
          datasets: [{
            label: `${backend.name || formatUrl(backend.url)} - Network Latency`,
            data: networkLatencyMs,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `Request ${ctx.label}: ${ctx.parsed.y.toFixed(0)} ms`
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

    // Prompt Processing Chart - Apply time range filter
    let promptProcessingMs = rawSamples.timeStats?.promptProcessingTimeMs || [];
    promptProcessingMs = getFilteredSamples(promptProcessingMs);
    const promptProcessingCanvas = document.getElementById('promptProcessingChart');
    if (promptProcessingCanvas && promptProcessingMs.length > 0) {
      const ctx = promptProcessingCanvas.getContext('2d');
      chartInstances.promptProcessingChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: promptProcessingMs.map((_, i) => `#${i + 1}`),
          datasets: [{
            label: `${backend.name || formatUrl(backend.url)} - Prompt Processing`,
            data: promptProcessingMs,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `Request ${ctx.label}: ${ctx.parsed.y.toFixed(0)} ms`
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
          labels: backends.map(b => b.name || formatUrl(b.url)),
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

    // Token Distribution Chart (Per Backend)
    cleanupChart('tokenDistributionChart');
    const tokenDistributionCanvas = document.getElementById('tokenDistributionChart');
    if (tokenDistributionCanvas && backends.length > 0) {
      const ctx = tokenDistributionCanvas.getContext('2d');
      chartInstances.tokenDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Prompt Tokens', 'Completion Tokens'],
          datasets: [{
            data: backends.map(b => {
              const samples = b.performanceStats.rawSamples.tokenStats;
              const prompt = samples?.promptTokens || [];
              const completion = samples?.completionTokens || [];
              const promptAvg = prompt.length > 0 ? prompt.reduce((a, b) => a + b, 0) / prompt.length : 1;
              const completionAvg = completion.length > 0 ? completion.reduce((a, b) => a + b, 0) / completion.length : 1;
              return [promptAvg, completionAvg];
            })[0] || [1, 1]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: true, text: `Token Distribution: ${backends[0].name || formatUrl(backends[0].url)}` }
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
          labels: backends.map(b => b.name || formatUrl(b.url)),
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

    // Total Rate Over Time Chart
    cleanupChart('totalRateChart');
    const totalRateCanvas = document.getElementById('totalRateChart');
    if (totalRateCanvas && backends.length > 0) {
      const backend = backends[0];
      const samples = backend.performanceStats.rawSamples.rateStats;
      const totalRate = samples?.totalRate || [];

      if (totalRate.length > 0) {
        const ctx = totalRateCanvas.getContext('2d');
        chartInstances.totalRateChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: totalRate.map((_, i) => `#${i + 1}`),
            datasets: [{
              label: 'Total Rate Over Requests',
              data: totalRate,
              borderColor: 'rgba(236, 72, 153, 0.8)',
              backgroundColor: 'rgba(236, 72, 153, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.3
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
      } else {
        totalRateCanvas.parentElement.innerHTML = '<p class="chart-no-data">No rate data available yet</p>';
      }
    }
  }

  /**
   * Render health and cache efficiency charts
   * Uses incremental updates pattern - returns early if DOM doesn't exist
   * @param {Object} statsData - Statistics data from API
   */
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
   * Render health metrics charts including utilization gauges and cache efficiency
   * @param {Object} statsData - Statistics data from API
   */
  function renderHealthMetricsCharts(statsData) {
    // Return early if section not active
    if (!isChartSectionActive()) return;

    const backendDetails = statsData?.backendDetails || [];
    if (backendDetails.length === 0) return;

    // Backend Utilization Gauges
    const utilizationContainer = document.getElementById('utilizationGauges');
    if (utilizationContainer && backendDetails.length > 0) {
      // Clear existing gauges
      utilizationContainer.innerHTML = '';

      backendDetails.forEach(backend => {
        const activeRequestCount = backend.activeRequestCount || 0;
        const maxConcurrency = backend.maxConcurrency || 10;
        const utilization = maxConcurrency > 0 ? (activeRequestCount / maxConcurrency) * 100 : 0;

        // Determine status based on utilization
        let statusText;
        if (utilization < 70) {
          statusText = 'Normal';
        } else if (utilization < 90) {
          statusText = 'Warning';
        } else {
          statusText = 'Critical';
        }

        // Use URL as backend identifier (since backend doesn't have 'name' field)
        const backendLabel = backend.url || 'Unknown Backend';
        const backendId = backend.url;

        // Create gauge canvas for this backend
        const gaugeCanvas = document.createElement('canvas');
        gaugeCanvas.className = 'utilization-gauge-canvas';
        gaugeCanvas.style.width = '180px';
        gaugeCanvas.style.height = '140px';

        // Create gauge chart
        createGaugeChart(gaugeCanvas, utilization, backendLabel, statusText);

        // Add label below gauge
        const labelDiv = document.createElement('div');
        labelDiv.style.textAlign = 'center';
        labelDiv.style.padding = '5px';
        labelDiv.textContent = `${backendLabel} (${activeRequestCount}/${maxConcurrency})`;
        labelDiv.style.fontSize = '12px';
        labelDiv.style.color = '#6b7280';

        utilizationContainer.appendChild(gaugeCanvas);
        utilizationContainer.appendChild(labelDiv);

        // Store backend ID for filtering
        backend.id = backendId;
      });
    }

    // Cache Efficiency Chart (Donut)
    cleanupChart('cacheEfficiencyChart');

    const backend = backendDetails[0];
    const cacheChartCanvas = document.getElementById('cacheEfficiencyChart');
    if (cacheChartCanvas) {
      const cacheStats = backend.promptCacheStats || {};
      const hits = cacheStats.totalHits || 0;
      const misses = cacheStats.totalMisses || 0;
      const total = hits + misses;

      if (total > 0) {
        const ctx = cacheChartCanvas.getContext('2d');
        chartInstances.cacheEfficiencyChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Cache Hits', 'Cache Misses'],
            datasets: [{
              data: [hits, misses],
              backgroundColor: ['#10b981', '#ef4444'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right' },
              title: {
                display: true,
                text: `Cache Efficiency: ${((hits / total) * 100).toFixed(1)}% hit rate`
              }
            }
          }
        });
      } else {
        cacheChartCanvas.parentElement.innerHTML = '<p class="chart-no-data">No cache data available yet</p>';
      }
    }
  }

  /**
   * Render queue visualization charts
   * Uses incremental updates pattern - returns early if DOM doesn't exist
   * @param {Object} queueStats - Queue statistics data from API
   */
  function renderQueueVisualizationCharts(queueStats) {
    // Return early if section not active
    if (!isChartSectionActive()) return;

    if (!queueStats) return;

    // Queue Depth Over Time Chart
    cleanupChart('queueDepthChart');
    const queueDepthCanvas = document.getElementById('queueDepthChart');
    if (queueDepthCanvas && queueStats.depthHistory && queueStats.depthHistory.length > 1) {
      const ctx = queueDepthCanvas.getContext('2d');
      chartInstances.queueDepthChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: queueStats.depthHistory.map((item, i) => `#${i + 1}`),
          datasets: [{
            label: 'Queue Depth',
            data: queueStats.depthHistory.map(item => item.depth),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `Queue depth: ${ctx.parsed.y} requests`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Queue Depth' },
              max: queueStats.maxQueueSize || 100
            },
            x: {
              display: false
            }
          }
        }
      });
    } else if (queueDepthCanvas) {
      queueDepthCanvas.parentElement.innerHTML = '<p class="chart-no-data">No queue history data available yet</p>';
    }

    // Queue Utilization Gauge (Doughnut Chart)
    cleanupChart('queueUtilizationChart');
    const queueUtilCanvas = document.getElementById('queueUtilizationChart');
    if (queueUtilCanvas) {
      const currentDepth = queueStats.depth || 0;
      const maxQueueSize = queueStats.maxQueueSize || 100;
      const utilization = maxQueueSize > 0 ? (currentDepth / maxQueueSize) * 100 : 0;

      // Determine status color based on utilization
      let statusColor, statusText;
      if (utilization < 50) {
        statusColor = '#10b981'; // Green - Low
        statusText = 'Low';
      } else if (utilization < 80) {
        statusColor = '#f59e0b'; // Yellow - Medium
        statusText = 'Medium';
      } else {
        statusColor = '#ef4444'; // Red - High
        statusText = 'High';
      }

      const ctx = queueUtilCanvas.getContext('2d');
      chartInstances.queueUtilizationChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Used', 'Available'],
          datasets: [{
            data: [currentDepth, Math.max(0, maxQueueSize - currentDepth)],
            backgroundColor: [statusColor, '#e2e8f0'],
            borderWidth: 0,
            cutout: '70%'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const label = ctx.label || '';
                  const value = ctx.parsed || 0;
                  return `${label}: ${value} requests`;
                }
              }
            }
          },
          layout: {
            padding: {
              top: 20
            }
          }
        }
      });

      // Add utilization value overlay
      const utilizationContainer = queueUtilCanvas.parentElement;
      utilizationContainer.innerHTML = `
        <div class="queue-utilization-chart">
          <canvas id="queueUtilizationChart"></canvas>
          <div class="queue-utilization-value">
            <div class="queue-utilization-percentage">${utilization.toFixed(0)}%</div>
            <div class="queue-utilization-label">Utilization</div>
            <div class="queue-utilization-status ${statusText.toLowerCase()}">${statusText} Load</div>
          </div>
        </div>
      `;
    }

    // Queue Wait Time Distribution Histogram
    cleanupChart('queueWaitTimeChart');
    const waitTimeCanvas = document.getElementById('queueWaitTimeChart');
    if (waitTimeCanvas && queueStats.queueLengths) {
      const queueLengths = queueStats.queueLengths;

      // Create histogram bins
      const bins = [
        { range: '0-10', label: '0-10', count: 0 },
        { range: '10-20', label: '10-20', count: 0 },
        { range: '20-30', label: '20-30', count: 0 },
        { range: '30-40', label: '30-40', count: 0 },
        { range: '40-50', label: '40-50', count: 0 },
        { range: '50+', label: '50+', count: 0 }
      ];

      queueLengths.forEach(depth => {
        if (depth <= 10) bins[0].count++;
        else if (depth <= 20) bins[1].count++;
        else if (depth <= 30) bins[2].count++;
        else if (depth <= 40) bins[3].count++;
        else if (depth <= 50) bins[4].count++;
        else bins[5].count++;
      });

      const ctx = waitTimeCanvas.getContext('2d');
      chartInstances.queueWaitTimeChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: bins.map(b => b.label),
          datasets: [{
            label: 'Queue Depth Distribution',
            data: bins.map(b => b.count),
            backgroundColor: [
              'rgba(16, 185, 129, 0.7)',
              'rgba(16, 185, 129, 0.7)',
              'rgba(245, 158, 11, 0.7)',
              'rgba(245, 158, 11, 0.7)',
              'rgba(239, 68, 68, 0.7)',
              'rgba(239, 68, 68, 0.7)'
            ],
            borderColor: [
              'rgba(16, 185, 129, 1)',
              'rgba(16, 185, 129, 1)',
              'rgba(245, 158, 11, 1)',
              'rgba(245, 158, 11, 1)',
              'rgba(239, 68, 68, 1)',
              'rgba(239, 68, 68, 1)'
            ],
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
                label: (ctx) => `${ctx.parsed.y} samples in ${bins[ctx.dataIndex].range}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Number of Snapshots' }
            },
            x: {
              title: { display: true, text: 'Queue Depth Range' }
            }
          }
        }
      });
    } else if (waitTimeCanvas) {
      waitTimeCanvas.parentElement.innerHTML = '<p class="chart-no-data">No queue distribution data available yet</p>';
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
   * @param {Object} queueStats - Queue statistics data (separate from main stats)
   */
  function updateStatsVisualization(statsData, queueStats) {
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
      renderCorrelationCharts(statsData);
    }

    // Always update queue visualization if queueStats is available
    if (queueStats) {
      renderQueueVisualizationCharts(queueStats);
    }
  }

  /**
   * Calculate percentiles from an array of values
   * @param {number[]} values - Array of numeric values
   * @param {number[]} percentiles - Percentiles to calculate (e.g., [50, 90, 95, 99])
   * @returns {Object} Object with percentile values
   */
  function calculatePercentiles(values, percentiles = [50, 90, 95, 99]) {
    if (!values || values.length === 0) {
      return percentiles.reduce((acc, p) => ({ ...acc, [p]: 'N/A' }), {});
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    return percentiles.reduce((acc, p) => {
      const index = (p / 100) * (n - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;

      let percentileValue;
      if (lower === upper) {
        percentileValue = sorted[lower];
      } else {
        percentileValue = sorted[lower] * (1 - weight) + sorted[upper] * weight;
      }

      acc[p] = Math.round(percentileValue * 100) / 100;
      return acc;
    }, {});
  }

  /**
   * Render distribution and percentile charts
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
            name: backend.name || formatUrl(backend.url),
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

    // Percentile Table
    const percentileTableContainer = document.getElementById('percentileTable');
    if (percentileTableContainer && backendDetails.length > 0) {
      const backends = backendDetails.filter(b => b.performanceStats?.rawSamples);
      const allRates = [];
      backends.forEach(b => {
        const rates = b.performanceStats?.rawSamples?.rateStats?.generationRate || [];
        allRates.push(...rates);
      });

      if (backends.length > 0) {
        const percentiles = calculatePercentiles(allRates);

        percentileTableContainer.innerHTML = `
          <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="background-color: var(--card-bg);">
                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid var(--border-color);">Metric</th>
                <th style="padding: 0.5rem; text-align: center; border-bottom: 2px solid var(--border-color);">P50</th>
                <th style="padding: 0.5rem; text-align: center; border-bottom: 2px solid var(--border-color);">P90</th>
                <th style="padding: 0.5rem; text-align: center; border-bottom: 2px solid var(--border-color);">P95</th>
                <th style="padding: 0.5rem; text-align: center; border-bottom: 2px solid var(--border-color);">P99</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">Total Time (ms)</td>
                <td style="padding: 0.5rem; text-align: center; border-bottom: 1px solid var(--border-color);">
                  ${Object.values(percentiles)[0] || 'N/A'}
                </td>
                <td style="padding: 0.5rem; text-align: center; border-bottom: 1px solid var(--border-color);">
                  ${Object.values(percentiles)[1] || 'N/A'}
                </td>
                <td style="padding: 0.5rem; text-align: center; border-bottom: 1px solid var(--border-color);">
                  ${Object.values(percentiles)[2] || 'N/A'}
                </td>
                <td style="padding: 0.5rem; text-align: center; border-bottom: 1px solid var(--border-color);">
                  ${Object.values(percentiles)[3] || 'N/A'}
                </td>
              </tr>
            </tbody>
          </table>
        `;
      } else {
        percentileTableContainer.innerHTML = '<p class="chart-no-data">No data available yet</p>';
      }
    }
  }

  /**
   * Calculate correlation coefficient between two arrays
   * @param {number[]} x - First array of values
   * @param {number[]} y - Second array of values
   * @returns {number} Correlation coefficient (-1 to 1)
   */
  function calculateCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const xSub = x.slice(0, n);
    const ySub = y.slice(0, n);

    const meanX = xSub.reduce((a, b) => a + b, 0) / n;
    const meanY = ySub.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = xSub[i] - meanX;
      const dy = ySub[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    if (denomX === 0 || denomY === 0) return 0;

    return numerator / Math.sqrt(denomX * denomY);
  }

  /**
   * Render correlation heatmap and radar charts for cross-backend analysis
   * @param {Object} statsData - Statistics data from API
   */
  function renderCorrelationCharts(statsData) {
    if (!isChartSectionActive()) return;

    let backendDetails = statsData?.backendDetails || [];
    if (backendDetails.length < 2) return;

    // Apply backend filter
    backendDetails = getFilteredBackends(backendDetails);
    if (backendDetails.length < 2) return;

    // Correlation Heatmap
    cleanupChart('correlationHeatmap');
    const heatmapCanvas = document.getElementById('correlationHeatmap');
    if (heatmapCanvas) {
      // Collect metrics per backend
      const metrics = {
        totalTime: [],
        generationTime: [],
        promptRate: [],
        genRate: []
      };

      backendDetails.forEach(backend => {
        const raw = backend.performanceStats?.rawSamples;
        if (raw) {
          metrics.totalTime.push(...(raw.timeStats.totalTimeMs || []));
          metrics.generationTime.push(...(raw.timeStats.generationTimeMs || []));
          metrics.promptRate.push(...(raw.rateStats.promptRate || []));
          metrics.genRate.push(...(raw.rateStats.generationRate || []));
        }
      });

      // Calculate correlations between metrics
      const metricNames = ['Total Time', 'Gen Time', 'Prompt Rate', 'Gen Rate'];
      const correlations = [
        [0, calculateCorrelation(metrics.totalTime, metrics.generationTime), calculateCorrelation(metrics.totalTime, metrics.promptRate), calculateCorrelation(metrics.totalTime, metrics.genRate)],
        [calculateCorrelation(metrics.generationTime, metrics.totalTime), 0, calculateCorrelation(metrics.generationTime, metrics.promptRate), calculateCorrelation(metrics.generationTime, metrics.genRate)],
        [calculateCorrelation(metrics.promptRate, metrics.totalTime), calculateCorrelation(metrics.promptRate, metrics.generationTime), 0, calculateCorrelation(metrics.promptRate, metrics.genRate)],
        [calculateCorrelation(metrics.genRate, metrics.totalTime), calculateCorrelation(metrics.genRate, metrics.generationTime), calculateCorrelation(metrics.genRate, metrics.promptRate), 0]
      ];

      // Create heatmap as a bar chart with colors
      const ctx = heatmapCanvas.getContext('2d');
      const heatmapColors = [
        ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'], // 0 to -1 (blue)
        ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'], // 0 to 1 (green)
        ['#ef4444', '#f87171', '#fca5a5', '#fecaca'], // 0 to -1 (red)
        ['#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7']  // 0 to 1 (yellow)
      ];

      function getColor(value, type) {
        const idx = Math.min(Math.floor(Math.abs(value) * 4), 3);
        if (value >= 0) return heatmapColors[type === 'blue' ? 1 : 3][idx];
        return heatmapColors[type === 'blue' ? 0 : 2][idx];
      }

      // Build heatmap data arrays
      const heatmapLabels = [];
      const heatmapData = [];
      const heatmapColorCodes = [];

      for (let i = 0; i < metricNames.length; i++) {
        for (let j = i + 1; j < metricNames.length; j++) {
          heatmapLabels.push(metricNames[i] + '\nvs ' + metricNames[j]);
          heatmapData.push(correlations[i][j] * 100);
          heatmapColorCodes.push(correlations[i][j] >= 0 ? '#10b981' : '#ef4444');
        }
      }

      chartInstances.correlationHeatmap = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: heatmapLabels,
          datasets: [{
            label: 'Correlation',
            data: heatmapData,
            backgroundColor: heatmapColorCodes,
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
                label: function(ctx) {
                  return 'Correlation: ' + ctx.parsed.y.toFixed(2) + '%';
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              min: -100,
              title: { display: true, text: 'Correlation %' }
            },
            x: {
              title: { display: true, text: 'Metric Pairs' },
              ticks: {
                maxRotation: 45,
                minRotation: 45
              }
            }
          }
        }
      });
    }

    // Backend Performance Radar Chart
    cleanupChart('backendRadarChart');
    const radarCanvas = document.getElementById('backendRadarChart');
    if (radarCanvas) {
      const backends = backendDetails.filter(b => b.performanceStats);
      if (backends.length > 0) {
        const ctx = radarCanvas.getContext('2d');
        const datasets = backends.map((backend, idx) => {
          const stats = backend.performanceStats;
          const avgTotalTime = stats.avgTimeStats?.avgTotalTimeMs || 0;
          const avgGenTime = stats.avgTimeStats?.avgGenerationTimeMs || 0;
          const avgGenRate = stats.avgRateStats?.avgGenerationRate || 0;
          const cacheHitRate = (stats.promptCacheStats?.totalHits || 0) /
                               Math.max(1, (stats.promptCacheStats?.totalHits || 0) + (stats.promptCacheStats?.totalMisses || 0));

          return {
            label: backend.name || formatUrl(backend.url),
            data: [
              100 - (avgTotalTime / 5000) * 100, // Normalize totalTime (inverted - faster is better)
              100 - (avgGenTime / 3000) * 100,   // Normalize genTime (inverted - faster is better)
              avgGenRate / 100 * 100,            // Normalize genRate
              cacheHitRate * 100
            ],
            backgroundColor: `rgba(${50 + idx * 40}, ${100 + idx * 30}, ${200 - idx * 20}, 0.2)`,
            borderColor: `rgba(${50 + idx * 40}, ${100 + idx * 30}, ${200 - idx * 20}, 1)`,
            borderWidth: 2
          };
        });

        chartInstances.backendRadarChart = new Chart(ctx, {
          type: 'radar',
          data: {
            labels: ['Response Time', 'Gen Time', 'Gen Rate', 'Cache Hit Rate'],
            datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top' }
            },
            scales: {
              r: {
                beginAtZero: true,
                max: 100,
                ticks: { display: false }
              }
            }
          }
        });
      } else {
        radarCanvas.parentElement.innerHTML = '<p class="chart-no-data">No backend data available</p>';
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
      label.appendChild(document.createTextNode(backend.name || formatUrl(backend.url)));

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
          updateStatsVisualization(data.stats, data.queueStats);
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
