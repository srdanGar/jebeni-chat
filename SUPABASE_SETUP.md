# Supabase Setup Guide

## Getting Your API Keys

To use Supabase for audio and image storage, you need to:

1. **Log in to your Supabase project** at https://app.supabase.com
2. **Go to Project Settings > API**
3. **Copy these values:**
   - **Project URL** (labeled as `URL`)
   - **Anon/Public key** (under `anon` row in the API Keys section)
     - ⚠️ **IMPORTANT**: Use the `anon` key, NOT the `service_role` key
     - The anon key should look like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Configuration

### For Local Development:

1. Create or edit `.env.local` in the project root:

   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. Run `npm install` to ensure dependencies are installed

3. Start the dev server:
   ```bash
   npm run dev
   ```
   ```

   ```

### For Production (Cloudflare Workers):

Add environment variables to Wrangler:

```bash
wrangler secret put REACT_APP_SUPABASE_ANON_KEY
# Paste your anon key when prompted
```

Then deploy:

```bash
npm run deploy
```

## Storage Buckets

Make sure your Supabase project has a bucket called `chat` and it's set to **Public**.

The bucket will be organized with subdirectories:

- `chat/audio/` - for audio messages
- `chat/images/` - for image messages

To create the bucket:

1. In Supabase dashboard, go to **Storage**
2. Click **Create a new bucket**
3. Name it `chat` and set it to **Public**
4. The subdirectories will be created automatically when files are uploaded

## Troubleshooting

- **"Invalid Compact JWS"**: Wrong API key. Make sure you're using the `anon` key, not `service_role`
- **"Bucket not found"**: Make sure the `audio` and `images` buckets exist and are public
- **CORS errors**: Ensure buckets are set to public access

## Security Note

The `anon` key is intentionally public and designed to be used in client-side code. It has read/write access only to your configured buckets. Keep your `service_role` key private.
