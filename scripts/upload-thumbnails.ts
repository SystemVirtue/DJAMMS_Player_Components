/**
 * Upload Thumbnails to Supabase Storage
 * 
 * Usage:
 *   SUPABASE_URL=your_url SUPABASE_SERVICE_ROLE_KEY=your_key \
 *   ts-node scripts/upload-thumbnails.ts /path/to/thumbnails
 * 
 * Or with npm script:
 *   npm run upload-thumbnails -- /path/to/thumbnails
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const THUMBNAILS_FOLDER = process.argv[2] || './thumbnails';
const BUCKET_NAME = 'thumbnails';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ts-node scripts/upload-thumbnails.ts /path/to/thumbnails');
  process.exit(1);
}

if (!fs.existsSync(THUMBNAILS_FOLDER)) {
  console.error(`Error: Thumbnails folder not found: ${THUMBNAILS_FOLDER}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function uploadThumbnails() {
  console.log(`\n📤 Starting thumbnail upload to Supabase Storage...`);
  console.log(`   Folder: ${THUMBNAILS_FOLDER}`);
  console.log(`   Bucket: ${BUCKET_NAME}\n`);

  // Create bucket if it doesn't exist (public read access)
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }

    if (!buckets?.find(b => b.name === BUCKET_NAME)) {
      console.log(`Creating bucket: ${BUCKET_NAME}...`);
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 1048576, // 1MB per file (thumbnails should be smaller)
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
      });
      if (createError) {
        console.error('Error creating bucket:', createError);
        return;
      }
      console.log('✅ Bucket created successfully\n');
    } else {
      console.log(`✅ Bucket "${BUCKET_NAME}" already exists\n`);
    }
  } catch (error) {
    console.error('Error checking/creating bucket:', error);
    return;
  }

  // Get all thumbnail files
  const files = fs.readdirSync(THUMBNAILS_FOLDER);
  const imageFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ext === '.png' || ext === '.jpg' || ext === '.jpeg';
  });

  if (imageFiles.length === 0) {
    console.error(`No image files found in ${THUMBNAILS_FOLDER}`);
    return;
  }

  console.log(`Found ${imageFiles.length} thumbnail files\n`);

  // Upload in batches to avoid rate limits
  const BATCH_SIZE = 10;
  let uploaded = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
    const batch = imageFiles.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (filename) => {
      try {
        const filePath = path.join(THUMBNAILS_FOLDER, filename);
        const fileBuffer = fs.readFileSync(filePath);
        
        // Determine content type
        const ext = path.extname(filename).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
        
        const { error } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filename, fileBuffer, {
            contentType,
            upsert: true, // Overwrite if exists
            cacheControl: '3600', // Cache for 1 hour
          });

        if (error) {
          console.error(`❌ Failed to upload ${filename}:`, error.message);
          failed++;
        } else {
          uploaded++;
          if (uploaded % 100 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = (uploaded / (Date.now() - startTime) * 1000).toFixed(1);
            console.log(`   Progress: ${uploaded}/${imageFiles.length} uploaded (${rate} files/sec, ${elapsed}s elapsed)`);
          }
        }
      } catch (error: any) {
        console.error(`❌ Error uploading ${filename}:`, error.message);
        failed++;
      }
    }));

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < imageFiles.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Upload complete!`);
  console.log(`   Uploaded: ${uploaded}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total time: ${elapsed}s`);
  console.log(`   Average rate: ${(uploaded / (Date.now() - startTime) * 1000).toFixed(1)} files/sec\n`);
}

uploadThumbnails().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


