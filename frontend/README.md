# LLM Balancer Frontend

A responsive dashboard for monitoring and managing the LLM Balancer.

## Features

- **Real-time Monitoring**: Automatic updates every 5 seconds by default
- **Backend Overview**: See total, healthy, unhealthy, busy, and available backends
- **Individual Backend Status**: Detailed view of each backend's health, status, and metrics
- **Statistics Dashboard**: System-wide statistics and health check metrics
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Manual Refresh**: Option to manually refresh data

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set environment variables in `.env`:
```bash
FRONTEND_PORT=3080
API_BASE_URL=http://localhost:3001
REFRESH_INTERVAL=5000
```

## Usage

### Development Mode

Build the bundle in development mode with watch:
```bash
npm run dev:build
```

Then start the server:
```bash
npm start
```

Access the dashboard at: http://localhost:3080

### Production Mode

Build the bundle:
```bash
npm run build
```

Then start the server:
```bash
npm start
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FRONTEND_PORT` | Port for the frontend server | `3080` |
| `API_BASE_URL` | Base URL of the LLM Balancer API | `http://localhost:3001` |
| `REFRESH_INTERVAL` | Polling interval in milliseconds | `5000` |

## Project Structure

```
frontend/
├── public/
│   ├── css/
│   │   └── styles.css        # Main stylesheet
│   ├── js/
│   │   ├── api.js            # API client service
│   │   └── dashboard.js      # Main dashboard logic
│   └── index.html           # HTML template
├── config.js                 # Configuration file
├── index.js                  # Express server
├── package.json              # Dependencies
├── webpack.config.js         # Webpack configuration
└── .env                      # Environment variables
```

## API Integration

The frontend connects to the LLM Balancer API endpoints:

- `GET /health` - Health status and backend summary
- `GET /stats` - Detailed statistics
- `GET /backends` - Backend information

## Development

### Adding New Features

1. Add new CSS classes in `public/css/styles.css`
2. Update `public/js/dashboard.js` to handle new data
3. Add new API methods in `public/js/api.js` if needed

### Building for Production

Run the production build:
```bash
npm run build
```

This will create a production-ready bundle in `public/js/dist/bundle.js`.

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

MIT