# Frontend Configuration

Configuration options for the frontend dashboard component.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | 3080 | Port for frontend server |
| `API_BASE_URL` | http://localhost:3001 | Backend API URL |
| `REFRESH_INTERVAL` | 5000 | Auto-refresh interval (ms) |

## Configuration File

Create `.env` in the frontend directory:

```bash
cp .env.example .env
```

## Example Configuration

### Development

```bash
FRONTEND_PORT=3080
API_BASE_URL=http://localhost:3001
REFRESH_INTERVAL=5000
```

### Production

```bash
FRONTEND_PORT=3080
API_BASE_URL=https://balancer.example.com
REFRESH_INTERVAL=10000
```

## Related Documentation

- [Usage Guide](../../user/USAGE.md#configuration) - How to use the dashboard
- [Installation](../../user/INSTALLATION.md#getting-started) - Installation options
