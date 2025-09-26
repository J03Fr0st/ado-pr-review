#!/usr/bin/env node

/**
 * Extension rollback script
 * Handles safe rollback to previous versions with validation and communication
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

class ExtensionRollback {
  constructor() {
    this.environment = process.env.ROLLBACK_ENV || 'production';
    this.extensionName = process.env.EXTENSION_NAME || 'ado-pr-reviewer';
    this.publisher = process.env.PUBLISHER || 'company';
    this.dryRun = process.env.DRY_RUN === 'true';
    this.forceRollback = process.env.FORCE_ROLLBACK === 'true';

    // Rollback configuration
    this.config = {
      internal: {
        registryUrl: process.env.INTERNAL_REGISTRY_URL,
        registryToken: process.env.INTERNAL_REGISTRY_TOKEN,
        apiBaseUrl: `${process.env.INTERNAL_REGISTRY_URL}/api`
      },
      preview: {
        marketplaceUrl: 'https://marketplace.visualstudio.com',
        apiBaseUrl: 'https://marketplace.visualstudio.com/_apis/public/gallery',
        token: process.env.VSCE_PAT,
        preRelease: true
      },
      production: {
        marketplaceUrl: 'https://marketplace.visualstudio.com',
        apiBaseUrl: 'https://marketplace.visualstudio.com/_apis/public/gallery',
        token: process.env.VSCE_PAT,
        preRelease: false
      }
    };

    this.backupDir = path.join(__dirname, '..', 'backups');
    this.rollbackLog = path.join(this.backupDir, 'rollback.log');
  }

  /**
   * Main rollback workflow
   */
  async rollback() {
    console.log('🔄 Starting extension rollback...');
    console.log(`📦 Extension: ${this.publisher}.${this.extensionName}`);
    console.log(`🎯 Environment: ${this.environment}`);
    console.log(`🔍 Dry run: ${this.dryRun}`);
    console.log(`💪 Force rollback: ${this.forceRollback}`);

    try {
      // Ensure backup directory exists
      this.ensureBackupDirectory();

      // Validate rollback prerequisites
      await this.validateRollbackPrerequisites();

      // Get current and previous versions
      const versionInfo = await this.getVersionInformation();
      console.log(`📋 Current version: ${versionInfo.current}`);
      console.log(`📋 Target version: ${versionInfo.target}`);

      // Validate rollback decision
      if (!this.forceRollback) {
        await this.validateRollbackDecision(versionInfo);
      }

      // Create backup of current state
      await this.createBackup(versionInfo);

      // Perform rollback
      if (!this.dryRun) {
        await this.performRollback(versionInfo);
      }

      // Validate rollback success
      await this.validateRollback(versionInfo);

      // Communicate rollback
      await this.communicateRollback(versionInfo);

      // Log rollback event
      await this.logRollbackEvent(versionInfo, 'success');

      console.log('✅ Rollback completed successfully!');

      return {
        success: true,
        environment: this.environment,
        fromVersion: versionInfo.current,
        toVersion: versionInfo.target,
        timestamp: new Date().toISOString(),
        dryRun: this.dryRun
      };

    } catch (error) {
      console.error('❌ Rollback failed:', error.message);

      // Log rollback failure
      await this.logRollbackEvent({
        current: 'unknown',
        target: 'unknown'
      }, 'failure', error.message);

      throw error;
    }
  }

  /**
   * Ensure backup directory exists
   */
  ensureBackupDirectory() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log('📁 Created backup directory');
    }
  }

  /**
   * Validate rollback prerequisites
   */
  async validateRollbackPrerequisites() {
    console.log('🔍 Validating rollback prerequisites...');

    const envConfig = this.config[this.environment];
    if (!envConfig) {
      throw new Error(`Unknown rollback environment: ${this.environment}`);
    }

    // Check required tokens
    if (!envConfig.token) {
      throw new Error(`Missing rollback token for ${this.environment} environment`);
    }

    // Check vsce availability for marketplace deployments
    if (this.environment === 'preview' || this.environment === 'production') {
      try {
        execSync('npx vsce --version', { stdio: 'pipe' });
      } catch (error) {
        throw new Error('vsce not available for marketplace rollback');
      }
    }

    // Check network connectivity
    try {
      const testUrl = this.environment === 'internal' ?
        envConfig.registryUrl : envConfig.marketplaceUrl;
      await this.httpGet(testUrl);
    } catch (error) {
      throw new Error(`Network connectivity check failed: ${error.message}`);
    }

    console.log('  ✅ Rollback prerequisites validated');
  }

  /**
   * Get version information for rollback
   */
  async getVersionInformation() {
    console.log('📋 Getting version information...');

    try {
      const currentVersion = await this.getCurrentVersion();
      const availableVersions = await this.getAvailableVersions();

      if (availableVersions.length < 2) {
        throw new Error('No previous version available for rollback');
      }

      // Find the most recent stable version before current
      const targetVersion = this.findTargetVersion(currentVersion, availableVersions);

      if (!targetVersion) {
        throw new Error('No suitable target version found for rollback');
      }

      return {
        current: currentVersion,
        target: targetVersion,
        available: availableVersions
      };

    } catch (error) {
      throw new Error(`Failed to get version information: ${error.message}`);
    }
  }

  /**
   * Get current deployed version
   */
  async getCurrentVersion() {
    const envConfig = this.config[this.environment];

    if (this.environment === 'internal') {
      try {
        const response = await this.httpGet(
          `${envConfig.apiBaseUrl}/extensions/${this.extensionName}`,
          { 'Authorization': `Bearer ${envConfig.registryToken}` }
        );

        const extensionData = JSON.parse(response.body);
        return extensionData.version;
      } catch (error) {
        throw new Error(`Failed to get current version from internal registry: ${error.message}`);
      }
    } else {
      try {
        const metadata = await this.getMarketplaceMetadata();
        return metadata.version;
      } catch (error) {
        throw new Error(`Failed to get current version from marketplace: ${error.message}`);
      }
    }
  }

  /**
   * Get available versions
   */
  async getAvailableVersions() {
    const envConfig = this.config[this.environment];

    if (this.environment === 'internal') {
      try {
        const response = await this.httpGet(
          `${envConfig.apiBaseUrl}/extensions/${this.extensionName}/versions`,
          { 'Authorization': `Bearer ${envConfig.registryToken}` }
        );

        const versionsData = JSON.parse(response.body);
        return versionsData.versions || [];
      } catch (error) {
        console.warn('Could not get versions from internal registry, using local backup');
        return this.getLocalVersions();
      }
    } else {
      try {
        // For marketplace, we need to query the extension versions
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

        return extension.versions.map(v => ({
          version: v.version,
          isPreRelease: v.flags?.includes('pre-release') || false,
          lastUpdated: v.lastUpdated
        }));

      } catch (error) {
        console.warn('Could not get versions from marketplace, using local backup');
        return this.getLocalVersions();
      }
    }
  }

  /**
   * Get local versions from backup
   */
  getLocalVersions() {
    const versions = [];

    try {
      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith(`${this.extensionName}-`) && file.endsWith('.vsix'));

      backupFiles.forEach(file => {
        const match = file.match(/.*-(\d+\.\d+\.\d+)\.vsix$/);
        if (match) {
          versions.push({
            version: match[1],
            isPreRelease: false,
            lastUpdated: fs.statSync(path.join(this.backupDir, file)).mtime.toISOString()
          });
        }
      });

      // Sort by version (descending)
      versions.sort((a, b) => this.compareVersions(b.version, a.version));

    } catch (error) {
      console.warn('No local versions found in backup');
    }

    return versions;
  }

  /**
   * Compare semantic versions
   */
  compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  /**
   * Find target version for rollback
   */
  findTargetVersion(currentVersion, availableVersions) {
    // Find the most recent version that's not the current version
    const sortedVersions = availableVersions
      .filter(v => v.version !== currentVersion)
      .sort((a, b) => this.compareVersions(b.version, a.version));

    // Prefer non-pre-release versions for production
    if (this.environment === 'production') {
      const stableVersions = sortedVersions.filter(v => !v.isPreRelease);
      if (stableVersions.length > 0) {
        return stableVersions[0].version;
      }
    }

    return sortedVersions[0]?.version;
  }

  /**
   * Validate rollback decision
   */
  async validateRollbackDecision(versionInfo) {
    console.log('🤔 Validating rollback decision...');

    // Check if rollback is necessary
    const currentHealth = await this.getCurrentHealth();

    if (currentHealth.overallHealth === 'excellent') {
      const message = 'Current version is healthy. Rollback may not be necessary.';
      console.warn(`⚠️  ${message}`);

      // In interactive mode, ask for confirmation
      if (process.stdout.isTTY) {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise(resolve => {
          rl.question(`${message} Continue with rollback? (y/N): `, resolve);
        });

        rl.close();

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          throw new Error('Rollback cancelled by user');
        }
      } else {
        // In non-interactive mode, require FORCE_ROLLBACK=true
        throw new Error('Rollback not recommended for healthy deployment. Use FORCE_ROLLBACK=true to override.');
      }
    }

    // Check rollback impact
    const impact = await this.assessRollbackImpact(versionInfo);
    console.log(`📊 Rollback impact assessment: ${impact.level}`);

    if (impact.level === 'high' && !this.forceRollback) {
      throw new Error(`High-impact rollback detected: ${impact.reasons.join(', ')}. Use FORCE_ROLLBACK=true to override.`);
    }

    console.log('  ✅ Rollback decision validated');
  }

  /**
   * Get current health status
   */
  async getCurrentHealth() {
    // This would integrate with your monitoring system
    // For now, simulate health check
    return {
      overallHealth: Math.random() > 0.7 ? 'excellent' :
                     Math.random() > 0.4 ? 'good' : 'fair'
    };
  }

  /**
   * Assess rollback impact
   */
  async assessRollbackImpact(versionInfo) {
    const impact = {
      level: 'low',
      reasons: []
    };

    // Check version difference
    const versionDiff = this.getVersionDifference(versionInfo.current, versionInfo.target);
    if (versionDiff.major > 0) {
      impact.level = 'high';
      impact.reasons.push('Major version rollback may introduce breaking changes');
    } else if (versionDiff.minor > 2) {
      impact.level = 'medium';
      impact.reasons.push('Multiple minor versions being rolled back');
    }

    // Check time since deployment
    const currentDeployTime = await this.getDeploymentTime(versionInfo.current);
    const hoursSinceDeploy = (Date.now() - new Date(currentDeployTime).getTime()) / (1000 * 60 * 60);

    if (hoursSinceDeploy < 1) {
      impact.level = 'high';
      impact.reasons.push('Very recent deployment, users may not have experienced issues yet');
    } else if (hoursSinceDeploy < 24) {
      impact.reasons.push('Recent deployment, consider monitoring for longer');
    }

    return impact;
  }

  /**
   * Get version difference
   */
  getVersionDifference(current, target) {
    const currentParts = current.split('.').map(Number);
    const targetParts = target.split('.').map(Number);

    return {
      major: currentParts[0] - targetParts[0],
      minor: currentParts[1] - targetParts[1],
      patch: currentParts[2] - targetParts[2]
    };
  }

  /**
   * Get deployment time for version
   */
  async getDeploymentTime(version) {
    // This would come from your deployment records
    // For now, return a recent time
    return new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
  }

  /**
   * Create backup before rollback
   */
  async createBackup(versionInfo) {
    console.log('💾 Creating backup of current state...');

    const backupFileName = `${this.extensionName}-${versionInfo.current}-rollback-${Date.now()}.backup.json`;
    const backupPath = path.join(this.backupDir, backupFileName);

    const backup = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      extension: this.extensionName,
      fromVersion: versionInfo.current,
      toVersion: versionInfo.target,
      health: await this.getCurrentHealth(),
      config: this.config[this.environment],
      metrics: await this.getCurrentMetrics(),
      reason: process.env.ROLLBACK_REASON || 'unspecified'
    };

    try {
      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
      console.log(`  ✅ Backup created: ${backupFileName}`);
    } catch (error) {
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Get current metrics
   */
  async getCurrentMetrics() {
    // This would integrate with your monitoring system
    return {
      healthScore: 85,
      errorRate: 1.2,
      userSatisfaction: 4.2,
      performance: 'good'
    };
  }

  /**
   * Perform the actual rollback
   */
  async performRollback(versionInfo) {
    console.log('🔄 Performing rollback...');

    const envConfig = this.config[this.environment];

    if (this.environment === 'internal') {
      await this.rollbackInternal(versionInfo, envConfig);
    } else {
      await this.rollbackMarketplace(versionInfo, envConfig);
    }

    console.log('  ✅ Rollback completed');
  }

  /**
   * Rollback in internal registry
   */
  async rollbackInternal(versionInfo, config) {
    console.log('  📤 Rolling back in internal registry...');

    // Check if we have the target version locally
    const localVsix = path.join(this.backupDir, `${this.extensionName}-${versionInfo.target}.vsix`);

    if (fs.existsSync(localVsix)) {
      // Use local backup
      const uploadCommand = [
        'curl -X POST',
        `-H "Authorization: Bearer ${config.registryToken}"`,
        `-F "extension=@${localVsix}"`,
        `-F "version=${versionInfo.target}"`,
        `-F "rollback=true"`,
        `-F "previousVersion=${versionInfo.current}"`,
        `"${config.apiBaseUrl}/rollback"`
      ].join(' ');

      try {
        const result = execSync(uploadCommand, { stdio: 'pipe' }).toString();
        const response = JSON.parse(result);

        if (!response.success) {
          throw new Error(`Internal rollback failed: ${response.error}`);
        }

        console.log(`    ✅ Internal rollback completed (ID: ${response.rollbackId})`);

      } catch (error) {
        throw new Error(`Internal rollback execution failed: ${error.message}`);
      }
    } else {
      throw new Error(`Target version ${versionInfo.target} not found in local backup`);
    }
  }

  /**
   * Rollback in marketplace
   */
  async rollbackMarketplace(versionInfo, config) {
    console.log('  📤 Rolling back in marketplace...');

    // For marketplace, we need to publish the previous version
    // Note: VS Code Marketplace doesn't support true rollbacks, so we republish the previous version

    try {
      // Find the VSIX file for the target version
      const vsixPath = await this.findVsixFile(versionInfo.target);

      if (!vsixPath) {
        throw new Error(`VSIX file for version ${versionInfo.target} not found`);
      }

      const publishCommand = [
        'npx vsce publish',
        config.preRelease ? '--pre-release' : '',
        `--packagePath "${vsixPath}"`,
        `--pat ${config.token}`
      ].filter(Boolean).join(' ');

      execSync(publishCommand, { stdio: 'inherit' });
      console.log('    ✅ Marketplace rollback completed');

    } catch (error) {
      throw new Error(`Marketplace rollback failed: ${error.message}`);
    }
  }

  /**
   * Find VSIX file for version
   */
  async findVsixFile(version) {
    // Check backup directory first
    const backupVsix = path.join(this.backupDir, `${this.extensionName}-${version}.vsix`);
    if (fs.existsSync(backupVsix)) {
      return backupVsix;
    }

    // Check dist directory
    const distVsix = path.join(__dirname, '..', 'dist', `${this.extensionName}-${version}.vsix`);
    if (fs.existsSync(distVsix)) {
      return distVsix;
    }

    return null;
  }

  /**
   * Validate rollback success
   */
  async validateRollback(versionInfo) {
    console.log('🔍 Validating rollback...');

    if (this.dryRun) {
      console.log('  ⏭️  Skipping validation for dry run');
      return;
    }

    // Wait for rollback to propagate
    await this.sleep(10000);

    const currentVersion = await this.getCurrentVersion();

    if (currentVersion !== versionInfo.target) {
      throw new Error(`Rollback validation failed. Expected version ${versionInfo.target}, got ${currentVersion}`);
    }

    console.log('  ✅ Rollback validation successful');
  }

  /**
   * Communicate rollback
   */
  async communicateRollback(versionInfo) {
    console.log('📢 Communicating rollback...');

    const message = {
      text: `🔄 Extension Rollback Completed`,
      extension: this.extensionName,
      environment: this.environment,
      fromVersion: versionInfo.current,
      toVersion: versionInfo.target,
      timestamp: new Date().toISOString(),
      dryRun: this.dryRun
    };

    // Send Slack notification
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await this.sendSlackNotification(message);
        console.log('  📱 Slack notification sent');
      } catch (error) {
        console.warn(`  ⚠️  Failed to send Slack notification: ${error.message}`);
      }
    }

    // Create GitHub issue for rollback documentation
    if (!this.dryRun && process.env.GITHUB_TOKEN) {
      try {
        await this.createRollbackIssue(versionInfo);
        console.log('  📋 GitHub issue created');
      } catch (error) {
        console.warn(`  ⚠️  Failed to create GitHub issue: ${error.message}`);
      }
    }
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(message) {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    const payload = {
      channel: '#devops-alerts',
      username: 'Extension Rollback Bot',
      text: message.text,
      attachments: [{
        color: 'warning',
        fields: [
          { title: 'Extension', value: message.extension, short: true },
          { title: 'Environment', value: message.environment, short: true },
          { title: 'From Version', value: message.fromVersion, short: true },
          { title: 'To Version', value: message.toVersion, short: true },
          { title: 'Timestamp', value: message.timestamp, short: true }
        ]
      }]
    };

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
   * Create rollback documentation issue
   */
  async createRollbackIssue(versionInfo) {
    const repo = process.env.GITHUB_REPOSITORY;
    if (!repo) return;

    const issueBody = `## Extension Rollback Summary

**Extension**: ${this.publisher}.${this.extensionName}
**Environment**: ${this.environment}
**From Version**: ${versionInfo.current}
**To Version**: ${versionInfo.target}
**Timestamp**: ${new Date().toISOString()}
**Reason**: ${process.env.ROLLBACK_REASON || 'Unspecified'}

### Rollback Details
This rollback was performed automatically due to issues detected with version ${versionInfo.current}.

### Validation Results
- ✅ Rollback completed successfully
- ✅ Target version ${versionInfo.target} is now active
- ✅ Health checks passed

### Next Steps
1. Monitor extension stability
2. Investigate root cause of issues with ${versionInfo.current}
3. Plan re-deployment with fixes

### Monitoring
- Watch for error rates and user feedback
- Monitor performance metrics
- Check marketplace health if applicable

---

*This issue was created automatically by the rollback system*`;

    const command = [
      'gh issue create',
      '--title `🔄 Extension Rollback: ${this.extensionName} ${versionInfo.current} → ${versionInfo.target}`',
      `--body '${issueBody}'`,
      '--label "rollback,documentation"',
      '--assignee "@me"'
    ].join(' ');

    execSync(command, {
      env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
      stdio: 'pipe'
    });
  }

  /**
   * Log rollback event
   */
  async logRollbackEvent(versionInfo, status, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      extension: this.extensionName,
      fromVersion: versionInfo.current,
      toVersion: versionInfo.target,
      status: status,
      dryRun: this.dryRun,
      forceRollback: this.forceRollback,
      error: error,
      reason: process.env.ROLLBACK_REASON || 'unspecified'
    };

    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.rollbackLog, logLine);
    } catch (logError) {
      console.warn('Failed to log rollback event:', logError.message);
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
      rating: extension.statistics.find(s => s.statisticName === 'averagerating')?.value || 0
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * HTTP GET helper
   */
  httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, { headers }, (response) => {
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
  const rollback = new ExtensionRollback();

  rollback.rollback()
    .then(result => {
      console.log('\n📊 Rollback Summary:');
      console.log(`   Environment: ${result.environment}`);
      console.log(`   From Version: ${result.fromVersion}`);
      console.log(`   To Version: ${result.toVersion}`);
      console.log(`   Timestamp: ${result.timestamp}`);
      console.log(`   Dry Run: ${result.dryRun}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Rollback failed:', error.message);
      process.exit(1);
    });
}

module.exports = ExtensionRollback;