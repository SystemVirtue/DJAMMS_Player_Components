# Thumbnail Upload Script

This script uploads thumbnail images to Supabase Storage for use by the KIOSK application.

## Prerequisites

1. Node.js installed
2. TypeScript installed (`npm install -g typescript ts-node` or use project dependencies)
3. Supabase credentials:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for admin access)

## Usage

### Option 1: Direct execution with environment variables

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
npx ts-node scripts/upload-thumbnails.ts /path/to/thumbnails
```

### Option 2: Using .env file

Create a `.env` file in the project root:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Then run:

```bash
npx ts-node scripts/upload-thumbnails.ts /path/to/thumbnails
```

### Option 3: Add to package.json scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "upload-thumbnails": "ts-node scripts/upload-thumbnails.ts"
  }
}
```

Then run:

```bash
npm run upload-thumbnails -- /path/to/thumbnails
```

## What it does

1. Creates a public `thumbnails` bucket in Supabase Storage (if it doesn't exist)
2. Uploads all `.png`, `.jpg`, and `.jpeg` files from the specified folder
3. Uploads in batches of 10 to avoid rate limiting
4. Shows progress every 100 files
5. Reports final statistics

## File naming

The script expects thumbnail files to be named in the format:
- `{youtubeId}.thumb.250.png` (or `.jpg`/`.jpeg`)

Where `youtubeId` is the 11-character YouTube video ID.

## Notes

- Files are uploaded with `upsert: true`, so existing files will be overwritten
- The bucket is set to public read access for the KIOSK to access thumbnails
- File size limit is 1MB per thumbnail (should be sufficient for 250px thumbnails)
- Only PNG and JPEG images are allowed

## Troubleshooting

- **Error: "Bucket not found"**: The script will create the bucket automatically. Make sure your service role key has storage admin permissions.
- **Error: "Rate limit exceeded"**: The script includes delays between batches. If you still hit rate limits, increase the delay in the script.
- **Error: "File too large"**: Thumbnails should be under 1MB. Compress your images if needed.

