# Documentation Best Practices

A comprehensive guide for designing and maintaining high-quality software documentation.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Documentation Hierarchy](#documentation-hierarchy)
3. [Role-Based Navigation](#role-based-navigation)
4. [Entry Point Design](#entry-point-design)
5. [Link and Reference Standards](#link-and-reference-standards)
6. [Content Structure](#content-structure)
7. [Maintenance Practices](#maintenance-practices)

---

## Core Principles

### 1. User-Centric Design

**Always ask: "Who is reading this and what do they need to accomplish?"**

| User Type | Primary Goal | Documentation Focus |
|-----------|--------------|---------------------|
| **End Users** | Use the software | Installation, configuration, daily operations, troubleshooting |
| **API Consumers** | Integrate with the system | API reference, request/response formats, code examples |
| **Contributors** | Modify or extend the system | Architecture, coding standards, testing, deployment |
| **Maintainers** | Keep the system running | Operations, monitoring, backup/recovery, version upgrades |

### 2. The Three-Layer Hierarchy

`★ Insight ─────────────────────────────────────`
**Documentation Pyramid Principle**: Effective documentation follows a pyramid structure: (1) Entry point for orientation, (2) Navigation guide for role-based routing, and (3) Topic-specific docs for deep dives. Each layer should reference the others to create a navigable web of information.
`─────────────────────────────────────────────────`

```
                    ┌──────────────┐
                    │   README.md  │ ← Entry point (top level)
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼─────────┐     ┌─────────▼─────────┐
    │ DOCUMENTATION_    │     │   Quick Start     │
    │ GUIDE.md          │     │   (optional)      │
    └─────────┬─────────┘     └───────────────────┘
              │
    ┌─────────┼─────────┬──────────┬────────────┐
    │         │         │          │            │
┌───▼───┐ ┌──▼───┐ ┌──▼───┐ ┌───▼───┐ ┌───▼───┐
│  User │ │ API  │ │Dev   │ │Admin   │ │Legacy │
│   Docs│ │ Docs │ │Docs  │ │  Docs   │ │  Docs │
└───────┘ └──────┘ └──────┘ └─────────┘ └───────┘
```

### 3. Single Source of Truth

**Never duplicate content across files.** If information needs to appear in multiple places, reference it from the original location.

```markdown
# ❌ BAD: Duplicate content
## In README.md
The balancer supports priority-based load balancing with configurable priorities.

## In docs/user/USAGE.md
The balancer supports priority-based load balancing with configurable priorities.

# ✅ GOOD: Single source with references
## In docs/user/USAGE.md (source of truth)
### Priority-Based Load Balancing

The balancer supports priority-based load balancing with configurable priorities...

## In README.md (reference only)
For detailed configuration options, see the [Usage Guide - Priority Configuration](docs/user/USAGE.md#priority-based-load-balancing).
```

---

## Documentation Hierarchy

### Level 1: Entry Point (README.md)

**Purpose**: Quick orientation and decision-making about where to go next.

**Must Include**:
- Project name and one-sentence description
- Core features/benefits (3-7 bullet points)
- Quick start for immediate use (optional but recommended)
- **Role-based navigation section** (critical!)
- Links to key documentation files
- Basic API/routes reference table

**Do NOT Include**:
- Detailed configuration options
- Step-by-step tutorials
- Architecture diagrams
- Extensive code examples

`★ Insight ─────────────────────────────────────`
**README Length Principle**: A README should be scannable in under 2 minutes. If you find yourself writing more than ~100 lines, move detailed content to linked documentation files and keep only summaries in the README.
`─────────────────────────────────────────────────`

### Level 2: Navigation Guide (DOCUMENTATION_GUIDE.md)

**Purpose**: Help users find documentation based on their role and goals.

**Must Include**:
- Clear role definitions with examples
- For each role: topics covered, key files, quick links
- Visual directory tree showing structure
- "Need Help Finding Something?" section
- Cross-references between roles when relevant

**Structure Template**:
```markdown
# Documentation Guide

## Find Documentation by Role

### User Documentation
**For:** Users who want to install and use the system.
- Topics Covered: Installation, configuration, usage, troubleshooting
- Key Files: [INSTALLATION.md](path), [USAGE.md](path)
- Quick Links: **Getting Started** → [INSTALLATION.md](path#docker-installation)

### API Reference (For Developers Using the API)
**For:** Developers who want to integrate with the system.
...

## Documentation Structure
```
[visual tree]
```

## Need Help?
If you can't find what you need:
1. Check this guide for role-based navigation
2. Review [README.md](path) for project overview
3. File an issue to request new documentation
```

### Level 3: Topic-Specific Documentation

**Purpose**: Deep dives into specific topics with complete information.

**File Types by Category**:

| Category | Files | Audience |
|----------|-------|----------|
| **User Guides** | INSTALLATION.md, USAGE.md, TROUBLESHOOTING.md, FAQ.md | End Users |
| **API Reference** | ENDPOINTS.md, REQUEST_RESPONSE.md, INTEGRATION.md | API Consumers |
| **Developer Docs** | ARCHITECTURE.md, DATA_FLOW.md, CLASSES.md, TESTING.md, CONTRIBUTING.md | Contributors |
| **Component Docs** | balancer/README.md, frontend/CONFIGURATION.md, docker/DEPLOYMENT.md | All (component-specific) |

---

## Role-Based Navigation

### Defining User Roles Clearly

`★ Insight ─────────────────────────────────────`
**Role Clarity Principle**: Users should be able to identify their role within 10 seconds of reading your documentation guide. Use concrete examples: "You are a [role] if you want to [action]" rather than abstract definitions.
`─────────────────────────────────────────────────`

### Role Definition Template

```markdown
### [Role Name]

**For:** [Concrete user type with example scenarios]

#### Typical Goals
- Goal 1 (e.g., "Install the system on a production server")
- Goal 2 (e.g., "Configure load balancing for high traffic")
- Goal 3 (e.g., "Troubleshoot connection issues")

#### Topics Covered
- Topic 1 with link to relevant file
- Topic 2 with link to relevant file

#### Key Documentation Files
- [FILENAME.md](path) - What this file contains
- [FILENAME.md](path) - What this file contains

#### Quick Links
- **Getting Started**: Start with [FILE.md](path#section)
- **Configuration**: See [FILE.md](path#section) for details
- **Having Problems**: Check [FILE.md](path)
```

### Example Role Definitions

**User (End User)**
> For users who want to install, configure, and use the LLM Balancer without modifying code.

**API Consumer (Integrator)**
> Developers who want to integrate their applications with the LLM Balancer API.

**Contributor (Developer)**
> Developers who want to contribute to the project, understand the architecture, or modify the codebase.

**Maintainer (Operations)**
> System administrators responsible for deployment, monitoring, and ongoing operations.

---

## Entry Point Design

### README.md Structure Template

```markdown
# Project Name

One-sentence description of what the project does and its key value proposition.

## Overview

Brief explanation with 3-7 bullet points highlighting core features/benefits.

## Quick Start (Optional)

Minimal steps to get running (2-5 commands/steps max).

## Find Documentation by Role ⭐ CRITICAL SECTION

### 👤 User
Want to install and use the system? → [DOCUMENTATION_GUIDE.md](path#user-documentation)

### 🔌 API Developer
Integrating with the system API? → [docs/api/ENDPOINTS.md](path)

### 💻 Contributor
Want to modify or extend the system? → [docs/developer/CONTRIBUTING.md](path)

## Features

Core features list (expand from overview if needed).

## API Routes (Quick Reference)

| Route | Description |
|-------|-------------|
| `/endpoint` | Brief description |

## Example Usage

Minimal code example showing common use case.

## Environment Variables (Optional)

Key configuration variables in table format.

## Project Structure

Simplified directory tree showing main components.

## Troubleshooting

Link to full troubleshooting guide + 1-2 common fixes.

## Related Documentation

- [README.md](path) - This file
- [DOCUMENTATION_GUIDE.md](path) - Find docs by role
- [docs/OVERVIEW.md](path) - System architecture
```

### README Best Practices Checklist

- [ ] One-sentence description at top
- [ ] Features limited to 3-7 bullets
- [ ] Role-based navigation section present
- [ ] No detailed configuration instructions
- [ ] Quick start is minimal (2-5 steps max)
- [ ] All links include section references where applicable
- [ ] API routes shown in table format
- [ ] Related documentation linked at bottom

---

## Link and Reference Standards

### The Section Reference Requirement

`★ Insight ─────────────────────────────────────`
**Precise Navigation Principle**: Every link should answer not just "where" but "what part of where". Including section references reduces cognitive load by telling users exactly what they'll find, eliminating unnecessary scrolling and improving LLM context efficiency.
`─────────────────────────────────────────────────`

### Link Format Standards

#### ❌ BAD: No Section Reference
```markdown
[Installation Guide](docs/user/INSTALLATION.md)
[System Architecture](docs/OVERVIEW.md)
```

#### ✅ GOOD: With Section Reference
```markdown
[Docker Installation](docs/user/INSTALLATION.md#docker-installation)
[System Architecture Overview](docs/OVERVIEW.md#architecture-overview)
[Class Hierarchy Details](docs/developer/CLASSES.md#class-hierarchy)
```

### Link Text Best Practices

#### ❌ BAD: Generic Link Text
```markdown
See [here](path) for more information.
Click [this link](path) to read about installation.
```

#### ✅ GOOD: Descriptive Link Text
```markdown
See the [Docker Installation Guide](docs/user/INSTALLATION.md#docker-installation) for detailed steps.
Review the [Installation Options](docs/user/INSTALLATION.md#installation-options) section for alternatives.
```

### Cross-Reference Patterns

#### Forward References (to content that exists)
```markdown
For priority configuration details, see [Priority-Based Load Balancing](docs/user/USAGE.md#priority-based-load-balancing).
```

#### Backward References (to parent documentation)
```markdown
See also: [README.md](../README.md) for project overview.
```

#### Related Content References
```markdown
**Related:**
- [Installation Guide](INSTALLATION.md) - Setting up the system
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
- [FAQ](FAQ.md) - Frequently asked questions
```

### Link Maintenance Checklist

For every link added:
- [ ] Includes section reference (anchor #section-name)
- [ ] Has descriptive link text (not "click here")
- [ ] Points to existing file/section
- [ ] Uses relative paths within project
- [ ] Follows naming conventions (kebab-case for anchors)

---

## Content Structure

### File Organization Principles

`★ Insight ─────────────────────────────────────`
**Modularity Principle**: Each documentation file should have a single, clear purpose and be scannable in under 5 minutes. If content exceeds ~100 lines or covers multiple distinct topics, split into separate files with cross-references. This improves maintainability, LLM context efficiency, and user navigation.
`─────────────────────────────────────────────────`

### Documentation File Template

```markdown
# [File Title]

Brief one-sentence description of what this file covers.

## Table of Contents
- [Section 1](#section-1)
- [Section 2](#section-2)

---

## Section 1

Content for section 1...

### Subsection 1.1

More detailed content...

---

## Section 2

Content for section 2...

---

## Related Documentation

- [Parent Topic](../parent-file.md#section) - Broader context
- [Next Step](next-file.md#section) - Follow-up information
- [See Also](another-file.md#section) - Related topics

---

## Need Help?

See [DOCUMENTATION_GUIDE.md](../DOCUMENTATION_GUIDE.md) for role-based navigation.
```

### Section Heading Standards

| Level | Format | Usage |
|-------|--------|-------|
| H1 | `# Title` | File title only (one per file) |
| H2 | `## Section` | Major topics, should be < 5 min to read |
| H3 | `### Subsection` | Detailed breakdowns within sections |
| H4 | `#### Specific Topic` | Very focused content areas |

**Best Practices**:
- Use descriptive headings (not just "Configuration" but "API Configuration")
- Include keywords for searchability
- Match heading text to link references when possible
- Keep consistent naming (kebab-case for anchors)

### Content Length Guidelines

| File Type | Target Length | Max Length |
|-----------|---------------|------------|
| README.md | 50-100 lines | 150 lines |
| DOCUMENTATION_GUIDE.md | 80-120 lines | 200 lines |
| User Guide (USAGE, INSTALL) | 60-100 lines | 150 lines |
| API Reference | 40-80 lines | 120 lines |
| Architecture/Developer | 80-150 lines | 250 lines |

### Visual Elements Standards

#### Code Blocks
```markdown
# ✅ GOOD: With language identifier and context
## Installing via Docker

```bash
docker compose up --build
```

## Configuration Example

```json
{
  "backend": {
    "url": "http://localhost:11434",
    "priority": 100
  }
}
```
```

#### Tables
```markdown
# ✅ GOOD: With clear headers and concise content

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKENDS` | None | Comma-separated backend URLs (required) |
| `LB_PORT` | 3001 | Server port number |
```

#### Diagrams/ASCII Art
```markdown
# ✅ GOOD: With explanation and purpose

## Request Flow

```
Client → Load Balancer → Backend Pool
                    ↓
              Health Check
                    ↓
           Priority Selection
```
```

---

## Maintenance Practices

### Documentation Review Checklist

**Before Merging Changes**:
- [ ] All links include section references
- [ ] No duplicate content (or proper cross-references)
- [ ] Heading structure is logical and consistent
- [ ] Code examples are accurate and tested
- [ ] Tables have clear headers and concise content
- [ ] File length within guidelines
- [ ] Related documentation linked at bottom
- [ ] "Need Help?" section points to DOCUMENTATION_GUIDE.md

**Periodic Reviews (Quarterly)**:
- [ ] All links still resolve correctly
- [ ] Content reflects current system state
- [ ] Outdated content removed or archived
- [ ] Documentation structure remains logical
- [ ] Role-based navigation is still accurate

### Version Synchronization

`★ Insight ─────────────────────────────────────`
**Synchronization Principle**: Documentation versions should track code versions. When releasing a new version, update documentation to reflect changes and note deprecated features with migration paths. This prevents user confusion and reduces support burden.
`─────────────────────────────────────────────────`

### Version Tracking Template

```markdown
## Version Information

- **Current Version**: 2.3 (matching code v2.3)
- **Last Updated**: 2026-03-14
- **API Compatibility**: Compatible with backend API 0.1.x and later

### Changelog

#### v2.3 (2026-03-14)
- Added: Priority-based load balancing documentation
- Changed: Updated configuration examples for new API format
- Deprecated: Old BACKEND_PRIORITY syntax (use BACKEND_PRIORITY_N instead)

#### v2.0 (2026-01-15)
- Added: FIFO queueing support
- Changed: Health check architecture refactored
```

### Deprecation Notice Template

When removing or changing features:

```markdown
:::warning Deprecated
The `OLD_FEATURE` configuration is deprecated as of v2.3 and will be removed in v3.0.

**Migration Path:**
Use `NEW_FEATURE` instead with the following changes:

| Old Syntax | New Syntax |
|------------|------------|
| `BACKEND_PRIORITY=100` | `BACKEND_PRIORITY_0=100` |
| `MAX_CONCURRENT=5` | `BACKEND_CONCURRENCY_0=5` |

See [Migration Guide](docs/MIGRATION_V2.md) for complete details.
:::
```

### Documentation Debt Tracking

Create a `DOCUMENTATION_TODO.md` file in the docs directory:

```markdown
# Documentation TODO

## High Priority
- [ ] Update API reference for v2.3 changes
- [ ] Add examples for priority configuration
- [ ] Document new health check endpoints

## Medium Priority
- [ ] Create troubleshooting flowchart
- [ ] Add video tutorial links
- [ ] Translate key docs to additional languages

## Low Priority
- [ ] Improve accessibility of documentation site
- [ ] Add search functionality
- [ ] Create printable PDF versions
```

---

## Summary: Documentation Best Practices Checklist

### Entry Point (README.md)
- [ ] One-sentence project description at top
- [ ] 3-7 core feature bullets
- [ ] Role-based navigation section present
- [ ] Quick start is minimal (2-5 steps)
- [ ] No detailed configuration instructions
- [ ] API routes in table format
- [ ] Related documentation linked

### Navigation Guide (DOCUMENTATION_GUIDE.md)
- [ ] Clear role definitions with examples
- [ ] For each role: topics, files, quick links
- [ ] Visual directory tree structure
- [ ] Cross-references between roles
- [ ] "Need Help?" section included

### Link Standards
- [ ] All links include section references (#anchor)
- [ ] Descriptive link text (no "click here")
- [ ] Relative paths within project
- [ ] Forward and backward references present
- [ ] Related content sections at bottom of files

### Content Structure
- [ ] Single purpose per file (< 100 lines target)
- [ ] Logical heading hierarchy (H1 → H4)
- [ ] Code blocks with language identifiers
- [ ] Tables have clear headers
- [ ] Visual elements explained
- [ ] Related documentation linked

### Maintenance
- [ ] Version tracking included
- [ ] Deprecation notices with migration paths
- [ ] Documentation TODO list maintained
- [ ] Quarterly review scheduled
- [ ] Links validated periodically

---

## Quick Reference: Common Patterns

### Role-Based Navigation Section (for README)
```markdown
## Find Documentation by Role

### 👤 User
Want to install and use the system? → [DOCUMENTATION_GUIDE.md](path#user-documentation)

### 🔌 API Developer
Integrating with the system API? → [docs/api/ENDPOINTS.md](path)

### 💻 Contributor
Want to modify or extend the system? → [docs/developer/CONTRIBUTING.md](path)
```

### File Footer Template (for all docs)
```markdown
---

## Related Documentation

- [Parent Topic](../parent-file.md#section) - Broader context
- [Next Step](next-file.md#section) - Follow-up information

## Need Help?

See [DOCUMENTATION_GUIDE.md](../DOCUMENTATION_GUIDE.md) for role-based navigation.
```

### Section Reference Example
```markdown
Before: [Installation Guide](docs/user/INSTALLATION.md)
After:  [Docker Installation](docs/user/INSTALLATION.md#docker-installation)
```

---

## Conclusion

Good documentation is **user-centric, maintainable, and navigable**. Follow these principles to create documentation that serves your users effectively and remains valuable over time.

Remember: Documentation is a product feature, not an afterthought. Invest in it with the same care you invest in your code.

`★ Insight ─────────────────────────────────────`
**Final Principle**: The best documentation is used documentation. If users can't find what they need within 30 seconds, or if they're confused about where to go next, your documentation needs improvement. Test it with real users and iterate based on their feedback.
`─────────────────────────────────────────────────`