class ApiClient {
  constructor(apiBaseUrl, refreshInterval = 5000) {
    this.apiBaseUrl = apiBaseUrl;
    this.refreshInterval = refreshInterval;
    this.timeout = 10000;
    this.abortController = new AbortController();
    this.pollingTimer = null;
    this.dataCache = null;
    this.lastUpdateTime = null;
  }

  /**
   * Make a fetch request with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${this.apiBaseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request was cancelled');
      }
      throw new Error(`API Error: ${error.message}`);
    }
  }

  /**
   * Get health status
   */
  async getHealth() {
    try {
      const data = await this.request('/health');
      this.lastUpdateTime = new Date();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get detailed statistics
   */
  async getStats() {
    try {
      const data = await this.request('/stats');
      this.lastUpdateTime = new Date();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get backend information
   */
  async getBackends() {
    try {
      const data = await this.request('/backends');
      this.lastUpdateTime = new Date();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      const data = await this.request('/queue/stats');
      this.lastUpdateTime = new Date();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Perform manual health check for a specific backend
   */
  async checkBackendHealth(backendUrl) {
    try {
      const data = await this.request(`/health/${encodeURIComponent(backendUrl)}`);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Start polling for data
   */
  startPolling() {
    this.stopPolling();

    const poll = async () => {
      try {
        const [healthData, statsData, backendsData, queueStatsData] = await Promise.all([
          this.getHealth(),
          this.getStats(),
          this.getBackends(),
          this.getQueueStats()
        ]);

        this.dataCache = {
          health: healthData.data,
          stats: statsData.data,
          backends: backendsData.data,
          queueStats: queueStatsData.data
        };

        if (window.updateCallback) {
          window.updateCallback(this.dataCache);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }

      this.pollingTimer = setTimeout(poll, this.refreshInterval);
    };

    poll();
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Trigger a manual refresh
   */
  async manualRefresh() {
    this.stopPolling();

    try {
      const [healthData, statsData, backendsData, queueStatsData] = await Promise.all([
        this.getHealth(),
        this.getStats(),
        this.getBackends(),
        this.getQueueStats()
      ]);

      this.dataCache = {
        health: healthData.data,
        stats: statsData.data,
        backends: backendsData.data,
        queueStats: queueStatsData.data
      };

      if (window.updateCallback) {
        window.updateCallback(this.dataCache);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get cached data
   */
  getData() {
    return this.dataCache;
  }

  /**
   * Get last update time
   */
  getLastUpdateTime() {
    return this.lastUpdateTime;
  }

  /**
   * Set update callback
   */
  setUpdateCallback(callback) {
    window.updateCallback = callback;
  }

  /**
   * Clear abort signal and stop polling
   */
  destroy() {
    this.stopPolling();
    this.abortController.abort();
    this.dataCache = null;
    window.updateCallback = null;
  }
}

// Use API base URL from config
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
const refreshInterval = parseInt(process.env.REFRESH_INTERVAL) || 5000;

const apiClient = new ApiClient(apiBaseUrl, refreshInterval);

// Make it available globally for the dashboard
window.apiClient = apiClient;

module.exports = apiClient;