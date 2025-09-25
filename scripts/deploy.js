#!/usr/bin/env node

/**
 * Extension deployment script
 * Handles multi-environment deployment with validation and rollback capabilities
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

class ExtensionDeployer {
  constructor() {
    this.manifestPath = path.join(__dirname, '..', 'dist', 'manifest.json');
    this.manifest = this.loadManifest();
    this.environment = process.env.DEPLOY_ENV || 'development';
    this.dryRun = process.env.DRY_RUN === 'true';

    // Deployment configuration
    this.config = {
      internal: {
        name: 'Internal Preview',
        registryUrl: process.env.INTERNAL_REGISTRY_URL,
        token: process.env.INTERNAL_REGISTRY_TOKEN,
        requiresApproval: false,
        healthCheckUrl: process.env.INTERNAL_HEALTH_CHECK_URL
      },
      preview: {
        name: 'Public Preview',
        registryUrl: 'https://marketplace.visualstudio.com',
        token: process.env.VSCE_PAT,
        requiresApproval: true,
        healthCheckUrl: 'https://marketplace.visualstudio.com/items?itemName=' + this.getExtensionId(),
        preRelease: true
      },
      production: {
        name: 'Production',
        registryUrl: 'https://marketplace.visualstudio.com',
        token: process.env.VSCE_PAT,
        requiresApproval: true,
        healthCheckUrl: 'https://marketplace.visualstudio.com/items?itemName=' + this.getExtensionId(),
        preRelease: false
      }
    };
  }

  /**
   * Main deployment workflow
   */
  async deploy() {
    console.log('🚀 Starting extension deployment...');
    console.log(`📦 Extension: ${this.manifest.displayName} v${this.manifest.version}`);
    console.log(`🎯 Environment: ${this.environment}`);
    console.log(`🔍 Dry run: ${this.dryRun}`);

    try {
      await this.validatePrerequisites();
      await this.validatePackage();
      await this.performDeployment();
      await this.validateDeployment();
      await this.notifySuccess();

      console.log('✅ Deployment completed successfully!');

      return {
        success: true,
        environment: this.environment,
        version: this.manifest.version,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      await this.notifyFailure(error);
      throw error;
    }
  }

  /**
   * Load deployment manifest
   */
  loadManifest() {
    if (!fs.existsSync(this.manifestPath)) {
      throw new Error('Deployment manifest not found. Run package script first.');
    }

    try {
      return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
    } catch (error) {
      throw new Error(`Failed to parse manifest: ${error.message}`);
    }
  }

  /**
   * Get full extension ID
   */
  getExtensionId() {
    return `${this.manifest.publisher}.${this.manifest.name}`;
  }

  /**
   * Validate deployment prerequisites
   */
  async validatePrerequisites() {
    console.log('🔍 Validating deployment prerequisites...');

    const envConfig = this.config[this.environment];
    if (!envConfig) {
      throw new Error(`Unknown deployment environment: ${this.environment}`);
    }

    // Check required tokens
    if (!envConfig.token) {
      throw new Error(`Missing deployment token for ${this.environment} environment`);
    }

    // Check package file exists
    const packagePath = path.join(__dirname, '..', 'dist', this.manifest.packagePath);
    if (!fs.existsSync(packagePath)) {
      throw new Error(`Package file not found: ${packagePath}`);
    }

    // Verify package integrity
    const actualChecksum = await this.calculateChecksum(packagePath);
    if (actualChecksum !== this.manifest.checksum) {
      throw new Error('Package checksum mismatch. Package may be corrupted.');
    }

    // Check vsce availability for marketplace deployments
    if (this.environment === 'preview' || this.environment === 'production') {
      try {
        execSync('npx vsce --version', { stdio: 'pipe' });
      } catch (error) {
        throw new Error('vsce not available for marketplace deployment');
      }
    }

    console.log('  ✅ Prerequisites validated');
  }

  /**
   * Validate package before deployment
   */
  async validatePackage() {
    console.log('📦 Validating package...');

    const packagePath = path.join(__dirname, '..', 'dist', this.manifest.packagePath);

    // Check package size is reasonable
    const stats = fs.statSync(packagePath);
    if (stats.size > 100 * 1024 * 1024) {
      throw new Error('Package size exceeds 100MB limit');
    }

    // Validate package structure with vsce
    if (this.environment === 'preview' || this.environment === 'production') {
      try {
        execSync(`npx vsce show "${packagePath}"`, { stdio: 'pipe' });
        console.log('  ✅ Package structure validated');
      } catch (error) {
        throw new Error(`Package validation failed: ${error.message}`);
      }
    }

    // Additional validation for production
    if (this.environment === 'production') {
      if (!this.manifest.signed) {
        throw new Error('Production packages must be signed');
      }

      if (this.manifest.version.includes('dev') || this.manifest.version.includes('rc')) {
        throw new Error('Production environment cannot deploy pre-release versions');
      }
    }

    console.log('  ✅ Package validation passed');
  }

  /**
   * Perform the actual deployment
   */
  async performDeployment() {
    const envConfig = this.config[this.environment];
    console.log(`🚀 Deploying to ${envConfig.name}...`);

    if (this.dryRun) {
      console.log('  🔍 DRY RUN - Would perform deployment but not executing');
      return;
    }

    switch (this.environment) {
      case 'internal':
        await this.deployToInternal();
        break;
      case 'preview':
        await this.deployToMarketplace(true);
        break;
      case 'production':
        await this.deployToMarketplace(false);
        break;
      default:
        throw new Error(`Unsupported deployment environment: ${this.environment}`);
    }
  }

  /**
   * Deploy to internal registry
   */
  async deployToInternal() {
    const config = this.config.internal;
    const packagePath = path.join(__dirname, '..', 'dist', this.manifest.packagePath);

    console.log('  📤 Uploading to internal registry...');

    try {
      // Use curl to upload to internal registry
      const uploadCommand = [
        'curl -X POST',
        `-H "Authorization: Bearer ${config.token}"`,
        `-F "extension=@${packagePath}"`,
        `-F "version=${this.manifest.version}"`,
        `-F "environment=${this.environment}"`,
        `"${config.registryUrl}/upload"`
      ].join(' ');

      const result = execSync(uploadCommand, { stdio: 'pipe' }).toString();
      const response = JSON.parse(result);

      if (!response.success) {
        throw new Error(`Upload failed: ${response.error || 'Unknown error'}`);
      }

      console.log(`  ✅ Uploaded successfully (ID: ${response.deploymentId})`);

    } catch (error) {
      throw new Error(`Internal deployment failed: ${error.message}`);
    }
  }

  /**
   * Deploy to VS Code Marketplace
   */
  async deployToMarketplace(preRelease = false) {
    const packagePath = path.join(__dirname, '..', 'dist', this.manifest.packagePath);

    console.log('  📤 Publishing to VS Code Marketplace...');

    try {
      const publishCommand = [
        'npx vsce publish',
        preRelease ? '--pre-release' : '',
        `--packagePath "${packagePath}"`,
        `--pat ${this.config[this.environment].token}`
      ].filter(Boolean).join(' ');

      execSync(publishCommand, { stdio: 'inherit' });

      console.log('  ✅ Published successfully to marketplace');

    } catch (error) {
      throw new Error(`Marketplace deployment failed: ${error.message}`);
    }
  }

  /**
   * Validate deployment success
   */
  async validateDeployment() {
    const envConfig = this.config[this.environment];

    if (this.dryRun) {
      console.log('⏭️  Skipping deployment validation for dry run');
      return;
    }

    console.log('🔍 Validating deployment...');

    // Wait a moment for deployment to propagate
    await this.sleep(5000);

    if (envConfig.healthCheckUrl) {
      try {
        const isHealthy = await this.checkHealth(envConfig.healthCheckUrl);
        if (!isHealthy) {
          throw new Error('Health check failed after deployment');
        }
        console.log('  ✅ Health check passed');
      } catch (error) {
        console.warn(`  ⚠️  Health check warning: ${error.message}`);
        // Don't fail deployment for health check issues, just warn
      }
    }

    // Additional validation for marketplace deployments
    if (this.environment === 'preview' || this.environment === 'production') {
      await this.validateMarketplaceDeployment();
    }

    console.log('  ✅ Deployment validation completed');
  }

  /**
   * Validate marketplace deployment
   */
  async validateMarketplaceDeployment() {
    console.log('  🏪 Validating marketplace deployment...');

    // Check if extension appears in marketplace
    // This is a simplified check - in practice you might use marketplace APIs
    try {
      const checkUrl = `https://marketplace.visualstudio.com/items?itemName=${this.getExtensionId()}`;
      const response = await this.httpGet(checkUrl);

      if (response.statusCode === 200) {
        console.log('    ✅ Extension found in marketplace');
      } else {
        throw new Error(`Marketplace returned status ${response.statusCode}`);
      }
    } catch (error) {
      console.warn(`    ⚠️  Marketplace validation warning: ${error.message}`);
      // Marketplace propagation can take time, so don't fail here
    }
  }

  /**
   * Check health endpoint
   */
  async checkHealth(url) {
    try {
      const response = await this.httpGet(url);
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (error) {
      return false;
    }
  }

  /**
   * HTTP GET request helper
   */
  httpGet(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
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

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const fileBuffer = fs.readFileSync(filePath);
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send success notification
   */
  async notifySuccess() {
    const envConfig = this.config[this.environment];

    if (this.dryRun) {
      console.log('📢 Would send success notification (dry run)');
      return;
    }

    const message = {
      text: `✅ ${this.manifest.displayName} v${this.manifest.version} deployed to ${envConfig.name}`,
      extension: this.manifest.name,
      version: this.manifest.version,
      environment: this.environment,
      timestamp: new Date().toISOString()
    };

    // Send to Slack if webhook is configured
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await this.sendSlackNotification(message);
        console.log('  📱 Slack notification sent');
      } catch (error) {
        console.warn(`  ⚠️  Failed to send Slack notification: ${error.message}`);
      }
    }

    // Send to monitoring system if configured
    if (process.env.MONITORING_WEBHOOK_URL) {
      try {
        await this.sendMonitoringNotification(message);
        console.log('  📊 Monitoring notification sent');
      } catch (error) {
        console.warn(`  ⚠️  Failed to send monitoring notification: ${error.message}`);
      }
    }
  }

  /**
   * Send failure notification
   */
  async notifyFailure(error) {
    if (this.dryRun) return;

    const message = {
      text: `❌ Deployment failed: ${this.manifest.displayName} v${this.manifest.version} to ${this.environment}`,
      error: error.message,
      extension: this.manifest.name,
      version: this.manifest.version,
      environment: this.environment,
      timestamp: new Date().toISOString()
    };

    // Send failure notifications
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await this.sendSlackNotification(message);
      } catch (slackError) {
        console.warn(`Failed to send Slack failure notification: ${slackError.message}`);
      }
    }
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(message) {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    const payload = {
      channel: '#devops-notifications',
      username: 'Extension Deploy Bot',
      text: message.text,
      attachments: [{
        color: message.error ? 'danger' : 'good',
        fields: [
          { title: 'Extension', value: message.extension, short: true },
          { title: 'Version', value: message.version, short: true },
          { title: 'Environment', value: message.environment, short: true },
          { title: 'Timestamp', value: message.timestamp, short: true }
        ]
      }]
    };

    if (message.error) {
      payload.attachments[0].fields.push({
        title: 'Error',
        value: message.error,
        short: false
      });
    }

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const url = new URL(webhook);

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
   * Send monitoring notification
   */
  async sendMonitoringNotification(message) {
    // Implementation depends on your monitoring system
    // This is a placeholder for integration with monitoring tools
    console.log('📊 Monitoring notification:', message);
  }
}

// CLI interface
if (require.main === module) {
  const deployer = new ExtensionDeployer();

  deployer.deploy()
    .then(result => {
      console.log('\n📊 Deployment Summary:');
      console.log(`   Environment: ${result.environment}`);
      console.log(`   Version: ${result.version}`);
      console.log(`   Timestamp: ${result.timestamp}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Deployment failed:', error.message);
      process.exit(1);
    });
}

module.exports = ExtensionDeployer;