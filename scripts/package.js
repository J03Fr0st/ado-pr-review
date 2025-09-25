#!/usr/bin/env node

/**
 * Extension packaging and signing script
 * Handles VSIX creation, signing, and validation for different deployment stages
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

class ExtensionPackager {
  constructor() {
    this.packageJson = require('../package.json');
    this.distDir = path.join(__dirname, '..', 'dist');
    this.outputFile = path.join(this.distDir, `${this.packageJson.name}-${this.packageJson.version}.vsix`);
    this.environment = process.env.NODE_ENV || 'development';
    this.isProduction = this.environment === 'production';
  }

  /**
   * Main packaging workflow
   */
  async package() {
    console.log('🚀 Starting extension packaging process...');
    console.log(`📦 Environment: ${this.environment}`);
    console.log(`🔖 Version: ${this.packageJson.version}`);

    try {
      await this.validateEnvironment();
      await this.updateVersion();
      await this.validatePackageJson();
      await this.buildExtension();
      await this.createVsix();
      await this.signExtension();
      await this.validatePackage();
      await this.generateManifest();

      console.log('✅ Extension packaging completed successfully!');
      console.log(`📄 Package: ${this.outputFile}`);

      return {
        success: true,
        packagePath: this.outputFile,
        version: this.packageJson.version,
        environment: this.environment
      };
    } catch (error) {
      console.error('❌ Packaging failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate environment and dependencies
   */
  async validateEnvironment() {
    console.log('🔍 Validating environment...');

    // Check Node.js version
    const nodeVersion = process.version;
    console.log(`  Node.js: ${nodeVersion}`);

    // Check required tools
    try {
      execSync('npx vsce --version', { stdio: 'pipe' });
      console.log('  ✅ vsce available');
    } catch (error) {
      throw new Error('vsce not found. Install with: npm install -g @vscode/vsce');
    }

    // Create dist directory
    if (!fs.existsSync(this.distDir)) {
      fs.mkdirSync(this.distDir, { recursive: true });
      console.log('  📁 Created dist directory');
    }

    // Validate required environment variables for production
    if (this.isProduction) {
      const requiredEnvVars = ['EXTENSION_SIGNING_CERT', 'CERT_PASSWORD'];
      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          throw new Error(`Missing required environment variable: ${envVar}`);
        }
      }
      console.log('  🔐 Production environment variables validated');
    }
  }

  /**
   * Update version based on environment and Git info
   */
  async updateVersion() {
    console.log('🏷️  Updating version...');

    let newVersion = this.packageJson.version;

    // For development builds, append Git commit hash
    if (!this.isProduction) {
      try {
        const commitHash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
        const branchName = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();

        // Add prerelease identifier based on branch
        if (branchName === 'develop') {
          newVersion = `${newVersion}-dev.${commitHash}`;
        } else if (branchName.startsWith('release/')) {
          newVersion = `${newVersion}-rc.${commitHash}`;
        } else {
          newVersion = `${newVersion}-branch.${commitHash}`;
        }

        // Update package.json temporarily for packaging
        this.packageJson.version = newVersion;
        fs.writeFileSync(
          path.join(__dirname, '..', 'package.json'),
          JSON.stringify(this.packageJson, null, 2)
        );
        console.log(`  📝 Updated version to: ${newVersion}`);
      } catch (error) {
        console.warn(`  ⚠️  Could not get Git info: ${error.message}`);
      }
    }

    this.currentVersion = newVersion;
  }

  /**
   * Validate package.json for extension requirements
   */
  async validatePackageJson() {
    console.log('📋 Validating package.json...');

    const required = ['name', 'displayName', 'description', 'version', 'engines', 'categories'];
    for (const field of required) {
      if (!this.packageJson[field]) {
        throw new Error(`Missing required field in package.json: ${field}`);
      }
    }

    // Validate VS Code engine version
    if (!this.packageJson.engines?.vscode) {
      throw new Error('Missing vscode engine version in package.json');
    }

    // Validate activation events
    if (!this.packageJson.activationEvents?.length) {
      throw new Error('Missing activation events in package.json');
    }

    // Validate main entry point
    if (!this.packageJson.main) {
      throw new Error('Missing main entry point in package.json');
    }

    const mainFile = path.join(__dirname, '..', this.packageJson.main);
    if (!fs.existsSync(mainFile)) {
      throw new Error(`Main entry point file not found: ${mainFile}`);
    }

    console.log('  ✅ Package.json validation passed');
  }

  /**
   * Build the extension (compile TypeScript, bundle, etc.)
   */
  async buildExtension() {
    console.log('🔨 Building extension...');

    try {
      // Clean previous builds
      execSync('npm run clean', { stdio: 'inherit' });

      // Compile TypeScript
      execSync('npm run compile', { stdio: 'inherit' });
      console.log('  ✅ TypeScript compilation completed');

      // Run webpack bundle for production
      if (this.isProduction) {
        execSync('npm run webpack', { stdio: 'inherit' });
        console.log('  ✅ Webpack bundling completed');
      }

      // Validate compiled output
      const outDir = path.join(__dirname, '..', 'out');
      if (!fs.existsSync(outDir)) {
        throw new Error('Build output directory not found');
      }

      const mainJs = path.join(outDir, 'extension.js');
      if (!fs.existsSync(mainJs)) {
        throw new Error('Main extension file not found after build');
      }

    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  /**
   * Create VSIX package
   */
  async createVsix() {
    console.log('📦 Creating VSIX package...');

    try {
      // Remove existing package with same name
      if (fs.existsSync(this.outputFile)) {
        fs.unlinkSync(this.outputFile);
        console.log('  🗑️  Removed existing package');
      }

      // Create VSIX using vsce
      const vsceCommand = [
        'npx vsce package',
        '--no-yarn',
        '--no-git-tag-version',
        `--out "${this.outputFile}"`,
        this.isProduction ? '' : '--pre-release'
      ].filter(Boolean).join(' ');

      execSync(vsceCommand, { stdio: 'inherit' });

      // Validate package was created
      if (!fs.existsSync(this.outputFile)) {
        throw new Error('VSIX package was not created');
      }

      const stats = fs.statSync(this.outputFile);
      console.log(`  ✅ VSIX created successfully (${Math.round(stats.size / 1024)}KB)`);

    } catch (error) {
      throw new Error(`VSIX creation failed: ${error.message}`);
    }
  }

  /**
   * Sign extension for production releases
   */
  async signExtension() {
    if (!this.isProduction) {
      console.log('⏭️  Skipping signing for non-production build');
      return;
    }

    console.log('🔐 Signing extension...');

    try {
      // Create temporary certificate file
      const certPath = path.join(this.distDir, 'signing-cert.p12');
      const certData = Buffer.from(process.env.EXTENSION_SIGNING_CERT, 'base64');
      fs.writeFileSync(certPath, certData);

      console.log('  📜 Certificate file created');

      // Sign the VSIX
      const signCommand = [
        'npx @vscode/vsce sign',
        `--certificate "${certPath}"`,
        `--password "${process.env.CERT_PASSWORD}"`,
        `"${this.outputFile}"`
      ].join(' ');

      execSync(signCommand, { stdio: 'inherit' });

      // Clean up certificate file
      fs.unlinkSync(certPath);

      console.log('  ✅ Extension signed successfully');

    } catch (error) {
      // Clean up certificate file on error
      const certPath = path.join(this.distDir, 'signing-cert.p12');
      if (fs.existsSync(certPath)) {
        fs.unlinkSync(certPath);
      }

      throw new Error(`Signing failed: ${error.message}`);
    }
  }

  /**
   * Validate the created package
   */
  async validatePackage() {
    console.log('🔍 Validating package...');

    try {
      // Check package exists and has reasonable size
      const stats = fs.statSync(this.outputFile);
      if (stats.size < 1024) {
        throw new Error('Package size suspiciously small');
      }
      if (stats.size > 100 * 1024 * 1024) {
        throw new Error('Package size too large (>100MB)');
      }

      console.log(`  📏 Package size: ${Math.round(stats.size / 1024)}KB`);

      // Generate and verify checksums
      const hash = crypto.createHash('sha256');
      const fileBuffer = fs.readFileSync(this.outputFile);
      hash.update(fileBuffer);
      const checksum = hash.digest('hex');

      console.log(`  🔍 SHA256: ${checksum}`);

      // Store checksum for later verification
      fs.writeFileSync(
        path.join(this.distDir, `${path.basename(this.outputFile)}.sha256`),
        `${checksum}  ${path.basename(this.outputFile)}\n`
      );

      // Validate package can be read by vsce
      try {
        execSync(`npx vsce show "${this.outputFile}"`, { stdio: 'pipe' });
        console.log('  ✅ Package structure validated');
      } catch (error) {
        throw new Error('Package structure validation failed');
      }

    } catch (error) {
      throw new Error(`Package validation failed: ${error.message}`);
    }
  }

  /**
   * Generate deployment manifest
   */
  async generateManifest() {
    console.log('📄 Generating deployment manifest...');

    const manifest = {
      name: this.packageJson.name,
      displayName: this.packageJson.displayName,
      version: this.currentVersion,
      description: this.packageJson.description,
      publisher: this.packageJson.publisher,
      environment: this.environment,
      packagePath: path.basename(this.outputFile),
      packageSize: fs.statSync(this.outputFile).size,
      checksum: fs.readFileSync(
        path.join(this.distDir, `${path.basename(this.outputFile)}.sha256`),
        'utf8'
      ).split(' ')[0],
      buildDate: new Date().toISOString(),
      gitCommit: this.getGitCommit(),
      gitBranch: this.getGitBranch(),
      nodeVersion: process.version,
      dependencies: this.getProductionDependencies(),
      vsCodeEngine: this.packageJson.engines.vscode,
      categories: this.packageJson.categories,
      signed: this.isProduction
    };

    const manifestPath = path.join(this.distDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`  ✅ Manifest generated: ${manifestPath}`);
  }

  /**
   * Get Git commit hash
   */
  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { stdio: 'pipe' }).toString().trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get Git branch name
   */
  getGitBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get production dependencies for manifest
   */
  getProductionDependencies() {
    const dependencies = this.packageJson.dependencies || {};
    return Object.keys(dependencies).reduce((prod, name) => {
      prod[name] = dependencies[name];
      return prod;
    }, {});
  }
}

// CLI interface
if (require.main === module) {
  const packager = new ExtensionPackager();

  packager.package()
    .then(result => {
      console.log('\n📊 Packaging Summary:');
      console.log(`   Package: ${result.packagePath}`);
      console.log(`   Version: ${result.version}`);
      console.log(`   Environment: ${result.environment}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Packaging failed:', error.message);
      process.exit(1);
    });
}

module.exports = ExtensionPackager;