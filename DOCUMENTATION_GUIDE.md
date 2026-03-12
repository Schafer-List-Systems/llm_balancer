# Documentation Guide

## Find Documentation by Role

This guide helps you quickly find the documentation you need based on your role and goals.

---

## User Documentation

**For:** Users who want to install, configure, and use the LLM Balancer.

### Topics Covered
- Installation instructions
- Configuration options
- How to use the balancer
- Troubleshooting common issues
- Frequently asked questions

### Documentation Files
- [docs/user/INSTALLATION.md](docs/user/INSTALLATION.md) - Installation (Docker, manual, development)
- [docs/user/USAGE.md](docs/user/USAGE.md) - How to use the balancer (configuration, examples)
- [docs/user/TROUBLESHOOTING.md](docs/user/TROUBLESHOOTING.md) - Common issues and solutions
- [docs/user/FAQ.md](docs/user/FAQ.md) - Frequently asked questions

### Quick Links
- **Getting Started**: Start with [docs/user/INSTALLATION.md](docs/user/INSTALLATION.md)
- **Configuration**: See [docs/user/USAGE.md](docs/user/USAGE.md) for configuration options
- **Having Problems**: Check [docs/user/TROUBLESHOOTING.md](docs/user/TROUBLESHOOTING.md)

---

## API Reference (For Developers Using the API)

**For:** Developers who want to integrate with the LLM Balancer API.

### Topics Covered
- API endpoint documentation
- Request/response formats
- Integration examples
- SDK usage (if available)

### Documentation Files
- [docs/api/ENDPOINTS.md](docs/api/ENDPOINTS.md) - All API endpoints with examples
- [docs/api/REQUEST_RESPONSE.md](docs/api/REQUEST_RESPONSE.md) - Request/response formats, data structures
- [docs/api/INTEGRATION.md](docs/api/INTEGRATION.md) - Integration guide, SDK usage

### Quick Links
- **API Reference**: See [docs/api/ENDPOINTS.md](docs/api/ENDPOINTS.md) for all endpoints
- **Data Formats**: Check [docs/api/REQUEST_RESPONSE.md](docs/api/REQUEST_RESPONSE.md) for request/response structures
- **Integration**: Follow [docs/api/INTEGRATION.md](docs/api/INTEGRATION.md) for integration examples

---

## Developer Documentation (For Contributors)

**For:** Developers who want to contribute to the project, understand the architecture, or modify the codebase.

### Topics Covered
- System architecture
- Data flow diagrams and request processing
- Class hierarchy and interfaces
- Testing guidelines
- Contribution guidelines
- Debugging techniques

### Documentation Files
- [docs/developer/ARCHITECTURE.md](docs/developer/ARCHITECTURE.md) - System architecture, component diagrams
- [docs/developer/DATA_FLOW.md](docs/developer/DATA_FLOW.md) - Data flow diagrams, request processing, component interaction
- [docs/developer/CLASSES.md](docs/developer/CLASSES.md) - Class hierarchy, interfaces, data structures
- [docs/developer/TESTING.md](docs/developer/TESTING.md) - Test structure, how to run tests, writing tests
- [docs/developer/CONTRIBUTING.md](docs/developer/CONTRIBUTING.md) - Contribution guidelines, code style
- [docs/developer/DEBUGGING.md](docs/developer/DEBUGGING.md) - Debug features, troubleshooting for developers

### Quick Links
- **Architecture**: Start with [docs/developer/ARCHITECTURE.md](docs/developer/ARCHITECTURE.md)
- **Code Structure**: See [docs/developer/CLASSES.md](docs/developer/CLASSES.md) for class hierarchy
- **Testing**: Check [docs/developer/TESTING.md](docs/developer/TESTING.md) for testing guidelines
- **Contributing**: Follow [docs/developer/CONTRIBUTING.md](docs/developer/CONTRIBUTING.md) for contribution guidelines

---

## Component Documentation

**For:** Users and developers who need component-specific details.

### Topics Covered
- Component overview and features
- Component-specific configuration
- Component customization

### Documentation Files

#### Balancer Component
- [docs/components/balancer/README.md](docs/components/balancer/README.md) - Balancer overview, features
- [docs/components/balancer/CONFIGURATION.md](docs/components/balancer/CONFIGURATION.md) - Balancer-specific configuration
- [docs/components/balancer/API.md](docs/components/balancer/API.md) - Balancer API details

#### Frontend Component
- [docs/components/frontend/README.md](docs/components/frontend/README.md) - Frontend overview, features
- [docs/components/frontend/CONFIGURATION.md](docs/components/frontend/CONFIGURATION.md) - Frontend configuration
- [docs/components/frontend/CUSTOMIZATION.md](docs/components/frontend/CUSTOMIZATION.md) - How to customize the dashboard

#### Docker Component
- [docs/components/docker/README.md](docs/components/docker/README.md) - Docker setup overview
- [docs/components/docker/DEPLOYMENT.md](docs/components/docker/DEPLOYMENT.md) - Production deployment guide

---

## Documentation Structure

```
llm_balancer/
├── README.md                          # Entry point: project overview, features, quick links
├── DOCUMENTATION_GUIDE.md             # This file: Navigation guide for finding documentation by role
│
├── docs/
│   ├── OVERVIEW.md                    # Overall architecture, system design, development workflow
│   │
│   ├── user/                          # User-facing documentation
│   │   ├── INSTALLATION.md            # Installation (Docker, manual, development)
│   │   ├── USAGE.md                   # How to use the balancer (configuration, examples)
│   │   ├── TROUBLESHOOTING.md         # Common issues and solutions
│   │   └── FAQ.md                     # Frequently asked questions
│   │
│   ├── api/                           # API reference (for developers using the API)
│   │   ├── ENDPOINTS.md               # All API endpoints with examples
│   │   ├── REQUEST_RESPONSE.md        # Request/response formats, data structures
│   │   └── INTEGRATION.md             # Integration guide, SDK usage
│   │
│   ├── developer/                     # Developer documentation (contributors)
│   │   ├── ARCHITECTURE.md            # System architecture, component diagrams
│   │   ├── DATA_FLOW.md               # Data flow diagrams, request processing, component interaction
│   │   ├── CLASSES.md                 # Class hierarchy, interfaces, data structures
│   │   ├── TESTING.md                 # Test structure, how to run tests, writing tests
│   │   ├── CONTRIBUTING.md            # Contribution guidelines, code style
│   │   └── DEBUGGING.md               # Debug features, troubleshooting for developers
│   │
│   └── components/                    # Component-specific documentation
│       ├── balancer/
│       │   ├── README.md              # Balancer overview, features
│       │   ├── CONFIGURATION.md       # Balancer-specific configuration
│       │   └── API.md                 # Balancer API details
│       │
│       ├── frontend/
│       │   ├── README.md              # Frontend overview, features
│       │   ├── CONFIGURATION.md       # Frontend configuration
│       │   └── CUSTOMIZATION.md       # How to customize the dashboard
│       │
│       └── docker/
│           ├── README.md              # Docker setup overview
│           └── DEPLOYMENT.md          # Production deployment guide
│
└── legacy/                            # Old documentation (for reference, deprecated)
    ├── IMPLEMENTATION.md
    ├── PRIORITY.md
    ├── DOCKER.md
    ├── REQUIREMENTS.md
    ├── REQUIREMENTS_TO_TESTS.md
    └── QUICKSTART.md
```

---

## Documentation Principles

1. **Role-Based Separation**: Each file targets a specific audience (user, API user, contributor)
2. **Single Source of Truth**: No duplicate content across files
3. **Clear Navigation**: Documentation guide helps users find what they need
4. **Component Modularity**: Component docs are self-contained but reference common docs
5. **Future-Proof**: New documentation can be added to appropriate categories

---

## Legacy Documentation

The `legacy/` directory contains old documentation files that have been migrated to the new structure. These files are **deprecated** and should not be used for new development.

| Old File | New Location |
|----------|--------------|
| `legacy/IMPLEMENTATION.md` | [docs/developer/ARCHITECTURE.md](docs/developer/ARCHITECTURE.md) + [docs/developer/CLASSES.md](docs/developer/CLASSES.md) |
| `legacy/PRIORITY.md` | [docs/user/USAGE.md](docs/user/USAGE.md) + [docs/developer/CLASSES.md](docs/developer/CLASSES.md) |
| `legacy/DOCKER.md` | [docs/user/INSTALLATION.md](docs/user/INSTALLATION.md) + [docs/components/docker/DEPLOYMENT.md](docs/components/docker/DEPLOYMENT.md) |
| `legacy/REQUIREMENTS.md` | [docs/developer/ARCHITECTURE.md](docs/developer/ARCHITECTURE.md) + [docs/api/REQUEST_RESPONSE.md](docs/api/REQUEST_RESPONSE.md) |
| `legacy/REQUIREMENTS_TO_TESTS.md` | [docs/developer/TESTING.md](docs/developer/TESTING.md) |
| `legacy/QUICKSTART.md` | [docs/user/USAGE.md](docs/user/USAGE.md) |

---

## Need Help?

If you can't find the documentation you need:

1. Check the [DOCUMENTATION_GUIDE.md](DOCUMENTATION_GUIDE.md) for role-based navigation
2. Review the [README.md](README.md) for project overview and quick links
3. Check the [docs/OVERVIEW.md](docs/OVERVIEW.md) for system architecture
4. File an issue to request new documentation

---

## Contributing to Documentation

If you'd like to improve or add to the documentation:

1. Follow the role-based structure
2. Keep content concise and focused
3. Use clear examples
4. Update internal links when moving content
5. See [docs/developer/CONTRIBUTING.md](docs/developer/CONTRIBUTING.md) for contribution guidelines
