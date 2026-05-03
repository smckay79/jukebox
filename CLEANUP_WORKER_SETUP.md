# Party Cleanup Worker Setup Guide

The VideoJam cleanup worker automatically closes parties that have been inactive for 6+ hours. Here are the different ways to run it:

## Option 1: Background Process on Your Host Machine (Recommended)

Run the cleanup worker as a persistent Node.js background process on your server.

### Prerequisites
```bash
npm install node-cron
```

### Setup with PM2 (Recommended for Production)

PM2 is a process manager that keeps the worker running and automatically restarts it if it crashes.

```bash
# Install PM2 globally
npm install -g pm2

# Build the project
npm run build

# Start the cleanup worker
pm2 start scripts/run-cleanup-worker.mjs --name videojam-cleanup

# View logs
pm2 logs videojam-cleanup

# Keep PM2 running on reboot
pm2 startup
pm2 save
```

### Setup with Node (Simple)

For development or testing:

```bash
npm run build
node scripts/run-cleanup-worker.mjs
```

The worker will:
- ✓ Run every hour (at the top of the hour)
- ✓ Check all active parties for inactivity
- ✓ Close parties inactive for 6+ hours
- ✓ Send emails to hosts
- ✓ Log all activity

### Example Output
```
🎵 VideoJam Party Cleanup Worker
═════════════════════════════════
Starting background cleanup worker...
Checking every hour for inactive parties
Parties inactive for 6+ hours will be closed

✓ Worker started successfully

Press Ctrl+C to stop

[2026-05-03T18:30:00.000Z] Starting cleanup check...
[2026-05-03T18:30:15.523Z] ✓ Checked 42 parties, closed 3
[2026-05-03T19:30:00.000Z] Starting cleanup check...
[2026-05-03T19:30:12.847Z] ✓ Checked 45 parties, closed 1
```

## Option 2: Vercel Cron Jobs (If Hosted on Vercel)

If your app is on Vercel, use their built-in cron job feature (requires Next.js 14.2+):

### Create `.vercel/crons.json`:
```json
[
  {
    "path": "/api/cron/cleanup-inactive-parties",
    "schedule": "0 * * * *"
  }
]
```

## Option 3: External Cron Service

Use services like EasyCron, cron-job.org, or AWS Lambda to call the endpoint:

```bash
GET https://yourdomain.com/api/cron/cleanup-inactive-parties
Authorization: Bearer YOUR_CRON_SECRET
```

Set `CRON_SECRET` environment variable for security.

## Important: Do NOT Run on Mobile

The cleanup worker **cannot** run on mobile devices because:
- It requires Node.js runtime (not available on iOS/Android)
- Continuous background processes drain battery quickly
- Mobile OS terminates long-running background tasks

**Solution**: Run on a server/hosting machine instead. Options:
- Your own Linux/Mac server
- Cloud hosting (AWS EC2, DigitalOcean, Linode, etc.)
- VPS with PM2
- Docker container
- Vercel (if already hosting there)

## Configuration

### Environment Variables
- `RESEND_API_KEY` - Required to send cleanup notification emails
- `RESEND_FROM` - Optional; email sender (e.g., "VideoJam <noreply@videojam.com>")
- `ADMIN_EMAILS` - Comma-separated list of admin emails (exempt from cleanup)

### Cleanup Rules
- **Threshold**: 6 hours of inactivity
- **Definition of Inactive**: No songs queued AND no recent song additions
- **Admin Exemption**: Parties hosted by admins are never auto-closed
- **Ended Parties**: Already-ended parties are skipped

## Monitoring

### Check Worker Health
```bash
# With PM2
pm2 status videojam-cleanup
pm2 logs videojam-cleanup

# View last 10 cleanup results
pm2 logs videojam-cleanup --lines 10
```

### Manual Cleanup Trigger
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://yourdomain.com/api/cron/cleanup-inactive-parties
```

Response:
```json
{
  "success": true,
  "partiesChecked": 42,
  "partiesClosed": 3,
  "timestamp": 1714773600000
}
```

## Troubleshooting

### Worker won't start
- Ensure `npm run build` was run (need dist/ folder)
- Check that `node-cron` is installed: `npm install node-cron`
- Verify Redis/KV credentials are set

### No emails being sent
- Check `RESEND_API_KEY` is set
- Check email address is valid
- Verify `RESEND_FROM` is configured (optional, uses sandbox otherwise)

### Parties not being closed
- Check worker logs: `pm2 logs videojam-cleanup`
- Verify the cleanup logic isn't skipping them (has activity, admin, etc.)
- Manual test: call the endpoint directly

## Production Recommendations

1. **Use PM2 ecosystem file** (`ecosystem.config.js`) for multi-process management
2. **Monitor with PM2+ or external APM** to get alerts on failures
3. **Set up log rotation** to prevent disk space issues
4. **Test email delivery** before deploying
5. **Set `CRON_SECRET`** for added security
6. **Review closed parties** in logs regularly

## Example PM2 Ecosystem Config

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'videojam-cleanup',
      script: './scripts/run-cleanup-worker.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/cleanup-error.log',
      out_file: './logs/cleanup-out.log',
      log_file: './logs/cleanup-combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      watch: false,
      max_memory_restart: '1G',
      autorestart: true,
    }
  ]
};
```

Then run:
```bash
pm2 start ecosystem.config.js
```
