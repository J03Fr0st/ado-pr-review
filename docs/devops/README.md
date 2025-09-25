# DevOps Documentation - Azure DevOps PR Reviewer

This directory contains comprehensive DevOps documentation for the Azure DevOps PR Reviewer VS Code extension.

## 📚 Documentation Structure

- **[Architecture Overview](./architecture.md)** - System architecture and component interactions
- **[Deployment Guide](./deployment.md)** - Complete deployment pipeline and environment setup
- **[Monitoring Guide](./monitoring.md)** - Health checks, telemetry, and alerting systems
- **[Runbooks](./runbooks/)** - Operational procedures and troubleshooting guides
- **[Security Guidelines](./security.md)** - Security practices and compliance requirements

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or higher
- VS Code extension development environment
- Azure DevOps organization with appropriate permissions

### Development Setup
```bash
# Clone repository
git clone <repository-url>
cd ado-pr-review

# Install dependencies
npm install

# Run tests
npm test

# Package extension
npm run package
```

### Deployment Overview
Our deployment strategy follows a three-stage approach:

1. **Internal Preview** (`develop` branch) → Internal registry for team validation
2. **Public Preview** (`release/*` branches) → VS Code Marketplace with preview flag
3. **Production** (`main` branch) → Full marketplace release

## 🔄 Git Workflow

### Branch Strategy
```
main (production)
├── release/1.2.0 (public preview)
├── develop (internal preview)
└── feature/* (development)
```

### Commit Standards
- Follow [Conventional Commits](https://conventionalcommits.org/) specification
- Use semantic versioning for releases
- All commits must pass automated quality gates

## 🏗️ CI/CD Pipeline

### Automated Testing
- **Unit Tests**: Jest with 80%+ coverage requirement
- **Integration Tests**: Real Azure DevOps API validation
- **E2E Tests**: Playwright browser automation
- **Security Scans**: CodeQL and dependency auditing

### Quality Gates
- TypeScript compilation without errors
- ESLint and Prettier formatting
- Security audit with no high-severity vulnerabilities
- Performance benchmarks within thresholds

### Deployment Automation
- Automatic version bumping based on branch
- Extension signing for production releases
- Multi-environment deployment with rollback capability
- Health monitoring and alerting

## 📊 Monitoring & Observability

### Health Monitoring
- **Marketplace Availability**: Extension listing and download functionality
- **Performance Metrics**: API response times and user experience
- **Error Rates**: Telemetry-based error tracking and alerting
- **User Adoption**: Install counts and usage analytics

### Telemetry Collection
- Privacy-first approach with user consent
- Extension performance and usage patterns
- Error reporting with stack trace anonymization
- Feature adoption and workflow analytics

## 🚨 Incident Response

### Alert Channels
- **Critical**: Slack #critical-alerts + PagerDuty
- **Warning**: Slack #devops-notifications
- **Info**: GitHub repository notifications

### Response Procedures
1. **Immediate**: Acknowledge and assess impact
2. **Investigation**: Use runbooks for systematic troubleshooting
3. **Resolution**: Deploy fixes or initiate rollback procedures
4. **Post-Incident**: Update documentation and preventive measures

## 📋 Operational Procedures

### Regular Maintenance
- Weekly dependency updates and security patches
- Monthly performance review and optimization
- Quarterly architecture review and improvements

### Release Management
- Feature freeze 1 week before release
- Preview period of 2-4 weeks minimum
- Gradual rollout with monitoring and validation

### Backup and Recovery
- Source code: Git repository with multiple remotes
- Configuration: Encrypted secrets in GitHub Secrets
- Telemetry: Application Insights with 90-day retention

## 🔐 Security & Compliance

### Security Practices
- All secrets stored in GitHub Secrets or Azure Key Vault
- Extension signing for production releases
- Regular security audits and dependency scanning
- Privacy-compliant telemetry collection

### Access Control
- Repository: Branch protection rules with required reviews
- Secrets: Least privilege access with environment-specific permissions
- Deployments: Environment-specific approval gates

## 🛠️ Troubleshooting

### Common Issues
- **Build Failures**: Check TypeScript compilation and dependencies
- **Test Failures**: Validate Azure DevOps API credentials and permissions
- **Deployment Issues**: Verify environment-specific secrets and configuration

### Debug Resources
- **Logs**: GitHub Actions workflow logs
- **Telemetry**: Application Insights dashboard
- **Health Checks**: Automated monitoring alerts

## 📞 Support & Contacts

### Development Team
- **Primary**: Development team leads
- **On-Call**: Rotation schedule for critical issues
- **Escalation**: Engineering manager and product owner

### External Dependencies
- **VS Code Marketplace**: Microsoft support channels
- **Azure DevOps**: Microsoft Azure support
- **GitHub Actions**: GitHub support and community

## 📈 Metrics & KPIs

### Development Metrics
- **Deployment Frequency**: Target weekly releases
- **Lead Time**: Feature to production < 2 weeks
- **MTTR**: Mean time to resolution < 4 hours
- **Change Failure Rate**: < 5% of deployments

### Business Metrics
- **Extension Installs**: Monthly active installations
- **User Engagement**: Feature usage analytics
- **Error Rates**: < 1% of user operations
- **Performance**: < 5s initial load, < 1s interactions

## 🔄 Continuous Improvement

### Regular Reviews
- **Weekly**: Team retrospectives and process improvements
- **Monthly**: Metrics review and optimization planning
- **Quarterly**: Architecture and tooling evaluation

### Feedback Integration
- User feedback from VS Code Marketplace reviews
- GitHub Issues and Discussions
- Internal team usage and feedback
- Performance and reliability metrics

---

For detailed information on specific topics, see the individual documentation files in this directory.