# Contributing Guide

This document provides guidelines for contributing to the LLM Balancer project.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Documentation](#documentation)
- [Testing](#testing)

---

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community

---

## Getting Started

### Prerequisites

- Node.js 16.x or later
- npm or yarn
- Git
- Docker (optional, for testing)

### Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/your-username/llm_balancer.git
cd llm_balancer

# Add upstream remote
git remote add upstream https://github.com/original-owner/llm_balancer.git
```

### Setup Development Environment

```bash
# Install dependencies
npm install

# Start backend in development mode
cd llm-balancer
npm start

# Start frontend in development mode
cd frontend
npm run dev:build
npm start
```

---

## Development Workflow

### Branch Naming

```
feature/new-feature
bugfix/issue-description
docs/update-documentation
refactor/code-improvement
test/add-tests
```

### Development Steps

1. **Create a branch** from main:
   ```bash
   git checkout main
   git pull upstream main
   git checkout -b feature/my-feature
   ```

2. **Make changes** following code style

3. **Write tests** for new functionality

4. **Run tests** to ensure nothing broke:
   ```bash
   npm test
   ```

5. **Commit changes** with descriptive messages

6. **Push to your fork**:
   ```bash
   git push origin feature/my-feature
   ```

7. **Create a Pull Request**

---

## Code Style

### JavaScript Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Use semicolons
- Use `const` and `let` (no `var`)
- Use arrow functions for callbacks
- Use async/await instead of `.then()` chains

### Example

```javascript
// Good
const fetchData = async (url) => {
  try {
    const response = await fetch(url)
    return await response.json()
  } catch (error) {
    console.error('Fetch error:', error)
    throw error
  }
}

// Bad
var fetchData = function(url) {
  return fetch(url).then(function(response) {
    return response.json()
  })
}
```

### File Organization

```javascript
// 1. External imports
const express = require('express')
const fetch = require('node-fetch')

// 2. Internal imports
const Backend = require('./Backend')
const Balancer = require('./Balancer')

// 3. Constants
const DEFAULT_PORT = 3001
const HEALTH_CHECK_INTERVAL = 30000

// 4. Class/Function definitions
class MyService {
  // ...
}

// 5. Module exports
module.exports = MyService
```

---

## Commit Messages

### Format

```
type(scope): description

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(balancer): add priority-based backend selection

Implement priority-based selection algorithm that:
- Groups backends by priority level
- Selects highest priority available backend
- Falls back to lower priority when needed

Closes #123
```

```
fix(health-check): handle timeout errors correctly

When health check times out, properly mark backend as unhealthy
and increment failCount.

Previously, timeout errors were not being caught.
```

---

## Pull Requests

### PR Template

```markdown
## Summary
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] Manual testing completed

## Related Issues
Closes #123
```

### PR Guidelines

1. Keep PRs focused and small
2. Include tests for new functionality
3. Update documentation
4. Ensure all tests pass
5. Request review from maintainers

---

## Documentation

### Documentation Structure

```
docs/
├── user/              # User-facing docs
├── api/               # API reference
├── developer/         # Developer docs
└── components/        # Component-specific docs
```

### Writing Documentation

- Use clear, concise language
- Include code examples
- Use proper markdown formatting
- Link to related documentation
- Keep documentation up to date

### Documentation Checklist

- [ ] README updated
- [ ] API documentation updated
- [ ] Code comments added
- [ ] Examples provided
- [ ] Links verified

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- balancer.test.js

# Run with coverage
npm test -- --coverage
```

### Writing Tests

See [Testing Guide](TESTING.md) for detailed testing guidelines.

### Test Requirements

- New features must have tests
- Bug fixes should have regression tests
- Aim for >90% code coverage
- Tests should be independent and reproducible

---

## Review Process

### For Reviewers

1. Check code quality
2. Verify tests exist and pass
3. Ensure documentation is updated
4. Provide constructive feedback
5. Approve when ready to merge

### For Contributors

1. Address reviewer feedback
2. Make requested changes
3. Push updates to branch
4. Request re-review if needed

---

## Common Questions

### How do I report a bug?

1. Check existing issues
2. Create a new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details

### How do I suggest a feature?

1. Check existing feature requests
2. Create a new issue with:
   - Feature description
   - Use case
   - Proposed solution (optional)

### What if my PR is rejected?

1. Understand the reasoning
2. Make requested changes
3. Discuss alternatives if needed
4. Consider if feature fits project goals

---

## Resources

- [Code of Conduct](#code-of-conduct)
- [Testing Guide](TESTING.md)
- [Architecture Docs](ARCHITECTURE.md)
- [Class Reference](CLASSES.md)

---

## Thank You!

Thank you for contributing to the LLM Balancer project! Your contributions help make this project better for everyone.
