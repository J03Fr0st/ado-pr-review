#!/usr/bin/env node

/**
 * Extension monitoring script
 * Provides comprehensive monitoring for deployed extensions across environments
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class ExtensionMonitor {
  constructor() {
    this.environment = process.env.MONITOR_ENV || 'production';
    this.extensionName = process.env.EXTENSION_NAME || 'ado-pr-reviewer';
    this.publisher = process.env.PUBLISHER || 'company';
    this.monitoringApiUrl = process.env.MONITORING_API_URL;
    this.monitoringApiToken = process.env.MONITORING_API_TOKEN;
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

    // Monitoring configuration
    this.config = {
      internal: {
        registryUrl: process.env.INTERNAL_REGISTRY_URL,
        registryToken: process.env.INTERNAL_REGISTRY_TOKEN,
        healthCheckUrl: process.env.INTERNAL_HEALTH_CHECK_URL
      },
      preview: {
        marketplaceUrl: `https://marketplace.visualstudio.com/items?itemName=${this.publisher}.${this.extensionName}`,
        apiBaseUrl: 'https://marketplace.visualstudio.com/_apis/public/gallery'
      },
      production: {
        marketplaceUrl: `https://marketplace.visualstudio.com/items?itemName=${this.publisher}.${this.extensionName}`,
        apiBaseUrl: 'https://marketplace.visualstudio.com/_apis/public/gallery'
      }
    };
  }

  /**
   * Main monitoring workflow
   */
  async monitor() {
    console.log('🔍 Starting extension monitoring...');
    console.log(`📦 Extension: ${this.publisher}.${this.extensionName}`);
    console.log(`🎯 Environment: ${this.environment}`);

    try {
      const results = {
        timestamp: new Date().toISOString(),
        environment: this.environment,
        extension: this.extensionName,
        metrics: {},
        health: {},
        performance: {},
        userExperience: {},
        errors: {}
      };

      // Collect metrics
      await this.collectHealthMetrics(results);
      await this.collectPerformanceMetrics(results);
      await this.collectUserExperienceMetrics(results);
      await this.collectErrorMetrics(results);

      // Analyze results
      const analysis = this.analyzeResults(results);

      // Send notifications if needed
      await this.sendNotifications(results, analysis);

      // Store metrics for historical tracking
      await this.storeMetrics(results);

      console.log('✅ Monitoring completed successfully');
      console.log(`📊 Overall health: ${analysis.overallHealth}`);

      return {
        success: true,
        results,
        analysis
      };

    } catch (error) {
      console.error('❌ Monitoring failed:', error.message);
      throw error;
    }
  }

  /**
   * Collect health metrics
   */
  async collectHealthMetrics(results) {
    console.log('🏥 Collecting health metrics...');

    const envConfig = this.config[this.environment];

    if (this.environment === 'internal') {
      // Check internal registry health
      try {
        const healthResponse = await this.httpGet(envConfig.healthCheckUrl);
        results.health.registry = {
          status: healthResponse.statusCode === 200 ? 'healthy' : 'unhealthy',
          responseTime: healthResponse.responseTime,
          statusCode: healthResponse.statusCode
        };
      } catch (error) {
        results.health.registry = {
          status: 'unhealthy',
          error: error.message
        };
      }

      // Check extension availability in internal registry
      try {
        const extensionUrl = `${envConfig.registryUrl}/api/extensions/${this.extensionName}`;
        const extensionResponse = await this.httpGet(extensionUrl, {
          'Authorization': `Bearer ${envConfig.registryToken}`
        });

        if (extensionResponse.statusCode === 200) {
          const extensionData = JSON.parse(extensionResponse.body);
          results.health.extension = {
            status: 'available',
            version: extensionData.version,
            downloadCount: extensionData.downloadCount || 0
          };
        }
      } catch (error) {
        results.health.extension = {
          status: 'unavailable',
          error: error.message
        };
      }
    } else {
      // Check marketplace health
      try {
        const marketplaceResponse = await this.httpGet(envConfig.marketplaceUrl);
        results.health.marketplace = {
          status: marketplaceResponse.statusCode === 200 ? 'available' : 'unavailable',
          responseTime: marketplaceResponse.responseTime,
          statusCode: marketplaceResponse.statusCode
        };
      } catch (error) {
        results.health.marketplace = {
          status: 'unavailable',
          error: error.message
        };
      }

      // Check extension metadata in marketplace
      try {
        const metadata = await this.getMarketplaceMetadata();
        results.health.extension = {
          status: 'available',
          version: metadata.version,
          installCount: metadata.installCount || 0,
          rating: metadata.rating || 0
        };
      } catch (error) {
        results.health.extension = {
          status: 'unavailable',
          error: error.message
        };
      }
    }
  }

  /**
   * Collect performance metrics
   */
  async collectPerformanceMetrics(results) {
    console.log('⚡ Collecting performance metrics...');

    const envConfig = this.config[this.environment];

    // Measure response times
    if (envConfig.marketplaceUrl) {
      try {
        // Page load time
        const pageLoadStart = Date.now();
        await this.httpGet(envConfig.marketplaceUrl);
        const pageLoadTime = Date.now() - pageLoadStart;

        results.performance.pageLoad = {
          timeMs: pageLoadTime,
          status: pageLoadTime < 5000 ? 'good' : pageLoadTime < 10000 ? 'degraded' : 'poor'
        };

        // API response time
        const apiLoadStart = Date.now();
        await this.getMarketplaceMetadata();
        const apiLoadTime = Date.now() - apiLoadStart;

        results.performance.apiResponse = {
          timeMs: apiLoadTime,
          status: apiLoadTime < 2000 ? 'good' : apiLoadTime < 5000 ? 'degraded' : 'poor'
        };

        // Download speed test
        const downloadStart = Date.now();
        const vsixData = await this.downloadExtension();
        const downloadTime = Date.now() - downloadStart;
        const downloadSpeed = (vsixData.length / 1024) / (downloadTime / 1000); // KB/s

        results.performance.download = {
          timeMs: downloadTime,
          speedKBs: Math.round(downloadSpeed),
          sizeKB: Math.round(vsixData.length / 1024),
          status: downloadSpeed > 100 ? 'good' : downloadSpeed > 50 ? 'degraded' : 'poor'
        };

      } catch (error) {
        results.performance.error = {
          status: 'failed',
          error: error.message
        };
      }
    }
  }

  /**
   * Collect user experience metrics
   */
  async collectUserExperienceMetrics(results) {
    console.log('👥 Collecting user experience metrics...');

    try {
      // Get GitHub issues as proxy for user feedback
      const issues = await this.getGitHubIssues();
      results.userExperience.issues = {
        openCount: issues.length,
        bugCount: issues.filter(issue => issue.labels.includes('bug')).length,
        featureCount: issues.filter(issue => issue.labels.includes('enhancement')).length,
        recentActivity: issues.filter(issue =>
          new Date(issue.updatedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length
      };

      // Get marketplace statistics if available
      if (this.environment !== 'internal') {
        try {
          const metadata = await this.getMarketplaceMetadata();
          results.userExperience.marketplace = {
            installCount: metadata.installCount || 0,
            rating: metadata.rating || 0,
            reviewCount: metadata.reviewCount || 0,
            trending: metadata.trending || false
          };
        } catch (error) {
          // Marketplace metrics not available
        }
      }

      // Calculate satisfaction score
      const issueRatio = results.userExperience.issues.bugCount / Math.max(results.userExperience.issues.openCount, 1);
      const rating = results.userExperience.marketplace?.rating || 0;

      results.userExperience.satisfaction = {
        score: Math.round((rating * 20) * (1 - issueRatio * 0.5)), // Scale 0-100
        status: rating >= 4 && issueRatio < 0.3 ? 'excellent' :
                rating >= 3 && issueRatio < 0.5 ? 'good' :
                rating >= 2 && issueRatio < 0.7 ? 'fair' : 'poor'
      };

    } catch (error) {
      results.userExperience.error = {
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Collect error metrics
   */
  async collectErrorMetrics(results) {
    console.log('🐛 Collecting error metrics...');

    try {
      // Get recent errors from telemetry
      const recentErrors = await this.getRecentErrors();
      results.errors.recent = {
        count: recentErrors.length,
        criticalCount: recentErrors.filter(e => e.severity === 'critical').length,
        uniqueUsers: new Set(recentErrors.map(e => e.userId)).size,
        errorTypes: this.getErrorTypeDistribution(recentErrors)
      };

      // Check error trends
      const trendData = await this.getErrorTrends();
      results.errors.trends = {
        direction: trendData.direction,
        changePercentage: trendData.changePercentage,
        status: trendData.changePercentage > 20 ? 'deteriorating' :
                trendData.changePercentage < -20 ? 'improving' : 'stable'
      };

      // Calculate error rate
      const totalRequests = await this.getTotalRequests();
      const errorRate = totalRequests > 0 ? (recentErrors.length / totalRequests) * 100 : 0;

      results.errors.rate = {
        percentage: errorRate.toFixed(2),
        status: errorRate < 1 ? 'excellent' : errorRate < 3 ? 'good' :
                errorRate < 5 ? 'acceptable' : 'poor'
      };

    } catch (error) {
      results.errors.error = {
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Get marketplace metadata
   */
  async getMarketplaceMetadata() {
    const envConfig = this.config[this.environment];
    const extensionId = `${this.publisher}.${this.extensionName}`;

    const payload = {
      filters: [{
        criteria: [{ filterType: 7, value: extensionId }]
      }],
      flags: 914
    };

    const response = await this.httpPost(
      `${envConfig.apiBaseUrl}/extensionquery`,
      payload,
      {
        'Content-Type': 'application/json',
        'Accept': 'application/json;api-version=6.0-preview.1'
      }
    );

    const data = JSON.parse(response.body);
    const extension = data.results[0].extensions[0];

    return {
      version: extension.versions[0].version,
      installCount: extension.statistics.find(s => s.statisticName === 'install')?.value || 0,
      rating: extension.statistics.find(s => s.statisticName === 'averagerating')?.value || 0,
      reviewCount: extension.statistics.find(s => s.statisticName === 'ratingcount')?.value || 0,
      trending: extension.statistics.find(s => s.statisticName === 'trendingdaily')?.value > 0
    };
  }

  /**
   * Download extension VSIX
   */
  async downloadExtension() {
    const downloadUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${this.publisher}/vsextensions/${this.extensionName}/latest/vspackage`;

    const response = await this.httpGet(downloadUrl, {
      'User-Agent': 'VSCode'
    });

    return Buffer.from(response.body);
  }

  /**
   * Get GitHub issues
   */
  async getGitHubIssues() {
    const githubToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;

    if (!githubToken || !repo) {
      return [];
    }

    try {
      const response = await this.httpGet(
        `https://api.github.com/repos/${repo}/issues?state=open&per_page=100`,
        {
          'Authorization': `token ${githubToken}`,
          'User-Agent': 'ExtensionMonitor'
        }
      );

      return JSON.parse(response.body).map(issue => ({
        id: issue.id,
        title: issue.title,
        state: issue.state,
        labels: issue.labels.map(l => l.name),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at
      }));
    } catch (error) {
      console.warn('Failed to fetch GitHub issues:', error.message);
      return [];
    }
  }

  /**
   * Get recent errors from telemetry
   */
  async getRecentErrors() {
    // This would integrate with your telemetry system
    // For now, return mock data
    return [];
  }

  /**
   * Get error trends
   */
  async getErrorTrends() {
    // This would analyze error trends over time
    // For now, return mock data
    return {
      direction: 'stable',
      changePercentage: 0
    };
  }

  /**
   * Get total requests
   */
  async getTotalRequests() {
    // This would get total requests from telemetry
    // For now, return a reasonable default
    return 1000;
  }

  /**
   * Get error type distribution
   */
  getErrorTypeDistribution(errors) {
    const distribution = {};
    errors.forEach(error => {
      distribution[error.type] = (distribution[error.type] || 0) + 1;
    });
    return distribution;
  }

  /**
   * Analyze monitoring results
   */
  analyzeResults(results) {
    let healthScore = 100;
    const issues = [];

    // Health analysis
    if (results.health.registry?.status !== 'healthy') {
      healthScore -= 30;
      issues.push('Registry health check failed');
    }
    if (results.health.extension?.status !== 'available') {
      healthScore -= 40;
      issues.push('Extension not available');
    }

    // Performance analysis
    if (results.performance.pageLoad?.status === 'poor') {
      healthScore -= 20;
      issues.push('Page load time too slow');
    }
    if (results.performance.apiResponse?.status === 'poor') {
      healthScore -= 15;
      issues.push('API response time too slow');
    }
    if (results.performance.download?.status === 'poor') {
      healthScore -= 10;
      issues.push('Download speed too slow');
    }

    // User experience analysis
    if (results.userExperience.satisfaction?.status === 'poor') {
      healthScore -= 25;
      issues.push('User satisfaction low');
    }
    if (results.userExperience.issues?.bugCount > 10) {
      healthScore -= 15;
      issues.push('High number of bug reports');
    }

    // Error rate analysis
    if (results.errors.rate?.status === 'poor') {
      healthScore -= 30;
      issues.push('High error rate');
    }
    if (results.errors.trends?.status === 'deteriorating') {
      healthScore -= 20;
      issues.push('Error rate deteriorating');
    }

    return {
      overallHealth: healthScore >= 90 ? 'excellent' :
                   healthScore >= 70 ? 'good' :
                   healthScore >= 50 ? 'fair' : 'poor',
      healthScore: Math.max(0, healthScore),
      issues,
      recommendations: this.generateRecommendations(results)
    };
  }

  /**
   * Generate recommendations based on results
   */
  generateRecommendations(results) {
    const recommendations = [];

    if (results.performance.pageLoad?.timeMs > 5000) {
      recommendations.push('Optimize marketplace page load time');
    }
    if (results.errors.rate?.percentage > 3) {
      recommendations.push('Investigate high error rate and fix critical issues');
    }
    if (results.userExperience.issues?.bugCount > 5) {
      recommendations.push('Prioritize bug fixes in next release');
    }
    if (results.userExperience.satisfaction?.score < 60) {
      recommendations.push('Improve user experience and address feedback');
    }

    return recommendations;
  }

  /**
   * Send notifications for issues
   */
  async sendNotifications(results, analysis) {
    if (analysis.overallHealth === 'excellent' || !this.slackWebhookUrl) {
      return;
    }

    const message = {
      text: analysis.overallHealth === 'poor' ? '🚨 Extension Health Alert' : '⚠️ Extension Health Warning',
      attachments: [{
        color: analysis.overallHealth === 'poor' ? 'danger' : 'warning',
        title: `${this.publisher}.${this.extensionName} - ${this.environment}`,
        fields: [
          { title: 'Health Score', value: `${analysis.healthScore}/100`, short: true },
          { title: 'Environment', value: this.environment, short: true },
          { title: 'Issues', value: analysis.issues.length, short: true },
          { title: 'Timestamp', value: new Date().toISOString(), short: true }
        ]
      }]
    };

    if (analysis.issues.length > 0) {
      message.attachments[0].fields.push({
        title: 'Top Issues',
        value: analysis.issues.slice(0, 3).join(' • '),
        short: false
      });
    }

    try {
      await this.sendSlackNotification(message);
    } catch (error) {
      console.warn('Failed to send Slack notification:', error.message);
    }
  }

  /**
   * Store metrics for historical tracking
   */
  async storeMetrics(results) {
    if (!this.monitoringApiUrl) {
      return;
    }

    try {
      await this.httpPost(
        `${this.monitoringApiUrl}/metrics`,
        results,
        {
          'Authorization': `Bearer ${this.monitoringApiToken}`,
          'Content-Type': 'application/json'
        }
      );
    } catch (error) {
      console.warn('Failed to store metrics:', error.message);
    }
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(message) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(message);
      const url = new URL(this.slackWebhookUrl);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Slack API returned ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * HTTP GET helper
   */
  httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const request = https.get(url, { headers }, (response) => {
        let data = '';
        response.on('data', (chunk) => data += chunk);
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: data,
            responseTime: Date.now() - startTime
          });
        });
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * HTTP POST helper
   */
  httpPost(url, data, headers = {}) {
    return new Promise((resolve, reject) => {
      const dataStr = JSON.stringify(data);

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr),
          ...headers
        }
      };

      const req = https.request(url, options, (response) => {
        let data = '';
        response.on('data', (chunk) => data += chunk);
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: data
          });
        });
      });

      req.on('error', reject);
      req.write(dataStr);
      req.end();
    });
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new ExtensionMonitor();

  monitor.monitor()
    .then(result => {
      console.log('\n📊 Monitoring Summary:');
      console.log(`   Environment: ${result.results.environment}`);
      console.log(`   Health Score: ${result.analysis.healthScore}/100`);
      console.log(`   Overall Health: ${result.analysis.overallHealth}`);
      console.log(`   Issues Found: ${result.analysis.issues.length}`);

      if (result.analysis.issues.length > 0) {
        console.log('\n⚠️  Issues:');
        result.analysis.issues.forEach(issue => {
          console.log(`   - ${issue}`);
        });
      }

      if (result.analysis.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        result.analysis.recommendations.forEach(rec => {
          console.log(`   - ${rec}`);
        });
      }

      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Monitoring failed:', error.message);
      process.exit(1);
    });
}

module.exports = ExtensionMonitor;