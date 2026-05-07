# Server Implementation

This Express server provides:
1. Static file serving for the built frontend
2. Authentication-protected `/downloads` endpoint
3. File listing, downloading, and deletion from captures folder

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

## Environment Variables

Create a `.env` file (not committed to git):
```
DOWNLOADS_USER=admin
DOWNLOADS_PASS=changeme
PORT=3000
```

## Usage

### Development
```bash
npm run dev
```
Starts Vite dev server on port 5173 (HTTPS with self-signed certs)

### Production
```bash
npm run build
npm start
```
Builds the frontend and starts Express server on port 3000

### Accessing Dashboard

Open `http://localhost:3000/dashboard` to access the captures dashboard with:
- Table view of all capture files
- Search functionality
- Multi-select for batch operations
- Download selected files
- Delete selected files
- Preview images on click
- Basic authentication protection

The dashboard will prompt for credentials on first interaction.

## API Endpoints

### GET `/`
Serves the main VR application (from `dist/index.html`)

### GET `/dashboard`
Serves the captures dashboard UI for managing capture files

### GET `/downloads`
List all capture files (requires authentication)

**Request Headers:**
```
Authorization: Basic <base64_credentials>
```

**Response:**
```json
{
  "files": [
    {
      "name": "capture_001.png",
      "url": "/downloads/capture_001.png",
      "size": 929079,
      "modified": "2026-05-06T15:48:30.342Z"
    }
  ]
}
```

### GET `/downloads/:filename`
Download a specific capture file (requires authentication)

**Request Headers:**
```
Authorization: Basic <base64_credentials>
```

**Response:** File download with `Content-Disposition: attachment` header

### DELETE `/downloads/:filename`
Delete a specific capture file (requires authentication)

**Request Headers:**
```
Authorization: Basic <base64_credentials>
```

**Response:**
```json
{
  "success": true
}
```

## Authentication

All `/downloads` endpoints require Basic Authentication.

**Using curl:**
```bash
# Encode credentials
AUTH=$(echo -n "admin:changeme" | base64)

# List files
curl -H "Authorization: Basic $AUTH" http://localhost:3000/downloads

# Download file
curl -H "Authorization: Basic $AUTH" -O http://localhost:3000/downloads/capture_001.png

# Delete file
curl -X DELETE -H "Authorization: Basic $AUTH" http://localhost:3000/downloads/capture_001.png
```

**Using browser:**
- Browser will prompt for username/password
- Enter credentials from .env file

## Deployment

### Platform Requirements
- Node.js runtime
- HTTPS support (required for WebXR in production)
- Ability to write to `captures` directory

### Deployment Steps

1. Build the application:
```bash
npm run build
```

2. Set environment variables on platform:
```
DOWNLOADS_USER=your_secure_username
DOWNLOADS_PASS=your_secure_password
PORT=3000
```

3. Start the server:
```bash
npm start
```

### Recommended Platforms

- **Render**: Free tier available, automatic HTTPS
- **Railway**: Simple deployment, automatic HTTPS
- **Heroku**: Established platform, automatic HTTPS
- **VPS**: Full control, need to configure HTTPS

## Security Notes

1. Always use HTTPS in production
2. Change default credentials immediately
3. Keep `.env` file out of version control (already in .gitignore)
4. Consider adding rate limiting for production
5. Consider implementing session-based auth for more secure use

## Captures Directory

Files are stored in the `captures/` folder (ignored by git).
The `/save-capture` endpoint in `vite.config.js` saves images here during development.
In production, the Express server does not implement `/save-capture` - captures must be uploaded via other means.