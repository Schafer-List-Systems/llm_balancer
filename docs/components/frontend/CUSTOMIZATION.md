# Frontend Customization

Guide to customizing the frontend dashboard.

## Overview

The frontend can be customized through:
- CSS styling
- Configuration options
- Component modifications

## CSS Customization

### Stylesheet Location

`frontend/public/css/styles.css`

### Customization Examples

```css
/* Change primary color */
:root {
  --primary-color: #2196F3;
}

/* Custom card styling */
.backend-card {
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

/* Custom health status colors */
.status-healthy {
  background-color: #4CAF50;
}

.status-unhealthy {
  background-color: #f44336;
}
```

## Configuration Customization

### Refresh Interval

Adjust auto-refresh frequency:

```bash
REFRESH_INTERVAL=10000  # 10 seconds
```

### Display Options

Modify `frontend/public/js/dashboard.js` to:
- Change metrics displayed
- Add custom statistics
- Modify update behavior

## Building for Production

```bash
# Production build
npm run build

# Development build with watch
npm run dev:build
```

## Related Documentation

- [Configuration](CONFIGURATION.md) - Configuration options
- [Usage Guide](../../user/USAGE.md) - Usage examples
