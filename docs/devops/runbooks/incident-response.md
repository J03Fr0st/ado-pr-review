# Incident Response Runbook

## 🚨 Emergency Response Procedures

### Severity Levels

#### SEV-1: Critical Production Issues
- **Definition**: Extension completely unavailable or causing data loss
- **Response Time**: 15 minutes
- **Examples**:
  - Extension fails to load in VS Code
  - Authentication completely broken
  - Data corruption in pull request operations

#### SEV-2: Major Functional Issues
- **Definition**: Major features broken, significant user impact
- **Response Time**: 2 hours
- **Examples**:
  - Pull request listing not loading
  - Approval actions failing
  - High error rates in telemetry

#### SEV-3: Minor Issues
- **Definition**: Limited functionality impact, workarounds available
- **Response Time**: 24 hours
- **Examples**:
  - UI rendering issues
  - Performance degradation
  - Non-critical features broken

## 📞 Contact Information

### On-Call Rotation
```
Primary:   @dev-team-lead
Secondary: @senior-developer
Escalation: @engineering-manager
```

### Communication Channels
- **Immediate**: Slack #critical-alerts
- **Updates**: Slack #devops-notifications
- **External**: GitHub Issues/Discussions

### External Contacts
- **VS Code Marketplace**: marketplace-support@microsoft.com
- **Azure DevOps**: Azure support portal
- **Infrastructure**: Platform engineering

## 🔍 Initial Assessment Checklist

### 1. Incident Verification (5 minutes)
```
□ Confirm incident scope and impact
□ Check if issue is environment-specific
□ Verify recent deployments or changes
□ Assess user reports and error patterns
```

### 2. Impact Assessment (10 minutes)
```
□ Estimate affected user count
□ Identify critical functionality impact
□ Determine business impact severity
□ Check marketplace availability
```

### 3. Communication (5 minutes)
```
□ Post initial alert in #critical-alerts
□ Notify on-call engineer
□ Create incident tracking issue
□ Inform stakeholders if SEV-1/SEV-2
```

## 🛠️ Common Incident Scenarios

### Scenario 1: Extension Won't Activate

#### Symptoms
- Extension appears in VS Code but commands don't work
- No Azure DevOps tree view in sidebar
- Error messages about activation failure

#### Investigation Steps
```bash
# 1. Check VS Code extension logs
code --log-level trace
# Look for activation errors in Output > Azure DevOps PR Reviewer

# 2. Verify extension installation
code --list-extensions --show-versions | grep ado-pr-reviewer

# 3. Check for conflicting extensions
code --disable-extensions
# Enable only our extension and test

# 4. Verify marketplace status
curl -f https://marketplace.visualstudio.com/items?itemName=company.ado-pr-reviewer
```

#### Resolution Steps
1. **Immediate**: Advise users to reload VS Code window
2. **Short-term**: Check for known VS Code compatibility issues
3. **Long-term**: Deploy hotfix if code issue identified

#### Prevention
- Comprehensive activation testing in CI/CD
- VS Code version compatibility matrix
- Extension dependency validation

---

### Scenario 2: Authentication Failures

#### Symptoms
- Users can't configure Azure DevOps connection
- "Unauthorized" errors when accessing pull requests
- PAT validation failures

#### Investigation Steps
```bash
# 1. Test with known-good PAT
curl -H "Authorization: Basic $(echo -n :$PAT | base64)" \
     https://dev.azure.com/{org}/_apis/connectionData

# 2. Check Azure DevOps service status
# Visit: https://status.dev.azure.com

# 3. Verify PAT permissions
curl -H "Authorization: Basic $(echo -n :$PAT | base64)" \
     https://dev.azure.com/{org}/_apis/security/permissions

# 4. Check for API changes
# Review Azure DevOps REST API changelog
```

#### Resolution Steps
1. **Immediate**: Check Azure DevOps service status
2. **Short-term**: Guide users through PAT recreation
3. **Long-term**: Update documentation with new permission requirements

#### Prevention
- API change monitoring and notifications
- Comprehensive permission testing
- Fallback authentication methods

---

### Scenario 3: Performance Degradation

#### Symptoms
- Slow pull request loading (>5 seconds)
- UI freezes during operations
- High CPU usage reported by users

#### Investigation Steps
```bash
# 1. Check Application Insights performance metrics
# Look for API call duration spikes

# 2. Review recent code changes
git log --oneline --since="1 week ago"

# 3. Check Azure DevOps API status
# Monitor API response times and throttling

# 4. Memory usage analysis
# Enable extension profiling if needed
```

#### Resolution Steps
1. **Immediate**: Check for runaway operations
2. **Short-term**: Implement caching if appropriate
3. **Long-term**: Optimize data fetching and rendering

#### Prevention
- Performance benchmarking in CI/CD
- Memory leak detection
- API response time monitoring

---

### Scenario 4: High Error Rates

#### Symptoms
- Spike in error telemetry
- User reports of unexpected errors
- GitHub issues increasing rapidly

#### Investigation Steps
```bash
# 1. Check telemetry dashboard for error patterns
# Group errors by type and frequency

# 2. Identify error source
# Check if errors are client-side or API-related

# 3. Review recent deployments
gh api /repos/{owner}/{repo}/deployments \
  --jq '.[] | select(.created_at > "2023-01-01") | {environment, created_at, sha}'

# 4. Check marketplace reviews for user reports
```

#### Resolution Steps
1. **Immediate**: Determine if rollback is necessary
2. **Short-term**: Deploy hotfix for critical errors
3. **Long-term**: Improve error handling and user messaging

#### Prevention
- Comprehensive error handling
- Circuit breakers for API calls
- Gradual rollout for new features

## 🔄 Rollback Procedures

### Automated Rollback Triggers
- Deployment failure in production environment
- Error rate exceeds 10% within 1 hour of deployment
- Critical health check failures for >15 minutes

### Manual Rollback Decision Tree
```
Is issue in production?
├─ Yes → Is workaround available?
│  ├─ No → ROLLBACK (SEV-1)
│  └─ Yes → Can hotfix deploy in <4 hours?
│     ├─ No → ROLLBACK (SEV-2)
│     └─ Yes → Deploy hotfix with monitoring
└─ No → Fix in next regular deployment
```

### Rollback Execution
```bash
# 1. Identify last known good version
gh api /repos/{owner}/{repo}/releases \
  --jq '.[] | select(.prerelease == false) | .tag_name' \
  | head -n2 | tail -n1

# 2. Trigger rollback workflow
gh workflow run deploy-rollback.yml \
  -f version=<previous-version> \
  -f reason="Critical production issue"

# 3. Monitor rollback success
gh run watch

# 4. Verify extension functionality
code --install-extension company.ado-pr-reviewer@<previous-version>
```

## 📊 Incident Communication

### Internal Communication Template

#### Initial Alert (Within 15 minutes)
```
🚨 INCIDENT ALERT - SEV-{LEVEL}

Extension: Azure DevOps PR Reviewer
Issue: {Brief description}
Impact: {User impact summary}
Status: Investigating

Incident Commander: @{username}
Started: {timestamp}
ETA: Investigating

Updates will be posted in this thread.
```

#### Status Updates (Every 30 minutes)
```
📊 INCIDENT UPDATE - {timestamp}

Status: {Investigating/Mitigating/Resolved}
Progress: {What's been done}
Next Steps: {What's happening next}
ETA: {Updated timeline}

Current impact: {Updated impact assessment}
```

#### Resolution Notice
```
✅ INCIDENT RESOLVED - {timestamp}

Issue: {What was wrong}
Resolution: {How it was fixed}
Duration: {Total incident time}
Impact: {Final impact summary}

Post-mortem: Will be scheduled within 48 hours
Follow-up items: {Link to tracking issues}
```

### External Communication

#### Marketplace Status Page Update
```markdown
## Service Disruption - Azure DevOps PR Reviewer

**Start Time**: {timestamp}
**Status**: {Investigating/Identified/Monitoring/Resolved}

### Issue Description
{Clear, non-technical description of user impact}

### Current Status
{What we're doing to resolve it}

### Workaround
{If available, steps users can take}

### Updates
We will provide updates every 30 minutes until resolved.

**Last Updated**: {timestamp}
```

## 📋 Post-Incident Procedures

### Immediate (Within 4 hours)
```
□ Verify full service restoration
□ Update all communication channels
□ Thank incident responders
□ Collect initial timeline and metrics
```

### Short-term (Within 48 hours)
```
□ Schedule post-mortem meeting
□ Create detailed incident report
□ Identify immediate improvements
□ Update runbooks with lessons learned
```

### Long-term (Within 1 week)
```
□ Implement preventive measures
□ Update monitoring and alerting
□ Review on-call procedures
□ Share learnings with team
```

### Post-Mortem Template
```markdown
# Incident Post-Mortem: {Date} - {Brief Description}

## Summary
**Duration**: {Start} - {End} ({Total time})
**Severity**: SEV-{Level}
**Impact**: {User/business impact}

## Timeline
- {Time}: Initial detection
- {Time}: Investigation started
- {Time}: Root cause identified
- {Time}: Fix deployed
- {Time}: Full resolution confirmed

## Root Cause
{Technical explanation of what went wrong}

## Resolution
{What was done to fix it}

## What Went Well
- {Positive aspects of response}

## What Could Be Improved
- {Areas for improvement}

## Action Items
- [ ] {Preventive measure 1} - Due: {Date}
- [ ] {Process improvement 2} - Due: {Date}
- [ ] {Monitoring enhancement 3} - Due: {Date}

## Lessons Learned
{Key takeaways for future incidents}
```

## 📈 Metrics and KPIs

### Incident Response Metrics
- **MTTA** (Mean Time to Acknowledge): <15 minutes
- **MTTI** (Mean Time to Investigate): <30 minutes
- **MTTR** (Mean Time to Resolve): <4 hours
- **Customer Communication**: <30 minutes for first update

### Tracking Dashboard
- Incident count by severity and month
- Response time trends
- Resolution time trends
- Root cause categories
- Preventive measure effectiveness

## 🧪 Testing Incident Response

### Monthly Incident Response Drills
```
□ Simulate common failure scenarios
□ Test communication channels
□ Verify rollback procedures
□ Review and update runbooks
□ Train new team members
```

### Chaos Engineering
- Randomly disable extension features
- Simulate Azure DevOps API failures
- Test VS Code version compatibility
- Network connectivity issues

---

**Remember**: When in doubt, escalate early. It's better to involve more people than necessary than to let an incident grow in scope.

**Emergency Contact**: For 24/7 critical issues, contact the on-call engineer via PagerDuty or Slack @here in #critical-alerts.