# Storage System

This directory contains the storage abstraction layer for Quozen, allowing different storage implementations based on the deployment environment.

## Architecture

The storage system uses a factory pattern to instantiate the appropriate storage implementation based on environment variables.

### Storage Types

1. **Memory Storage** (`memory`) - In-memory storage for local development
2. **Database Storage** (`database`) - PostgreSQL database using Drizzle ORM
3. **Supabase Storage** (`supabase`) - Supabase database for Vercel deployments
4. **Google Sheets Storage** (`google-sheets`) - Google Sheets for Google Cloud Functions

## Environment Variables

### Local Development
```bash
NODE_ENV=development
# No additional variables needed - defaults to memory storage
```

### Vercel Deployment
```bash
VERCEL=1
STORAGE_TYPE=supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Deployment
```bash
STORAGE_TYPE=database
DATABASE_URL=postgresql://user:password@host:port/database
```

### Google Sheets Deployment
```bash
STORAGE_TYPE=google-sheets
GOOGLE_SHEETS_ID=your_root_sheets_id
# Option 1: JSON credentials (recommended for development)
GOOGLE_CREDENTIALS=your_google_credentials_json
# Option 2: Service account credentials (recommended for production)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key
```

## Usage

The storage system is automatically configured when you import from the main storage module:

```typescript
import { storage } from '../storage';

// Use the storage instance - it will automatically use the correct implementation
const user = await storage.getUser('user-id');
const groups = await storage.getUserGroups('user-id');
```

## Manual Configuration

You can also manually create storage instances:

```typescript
import { StorageFactory } from '../storage';

// Create with explicit configuration
const storage = StorageFactory.createStorage({
  type: 'memory'
});

// Or let it auto-detect from environment
const storage = StorageFactory.getStorage();
```

## Implementation Status

- ✅ **Memory Storage** - Fully implemented with demo data
- ⚠️ **Database Storage** - Interface defined, implementation pending
- ⚠️ **Supabase Storage** - Interface defined, implementation pending  
- ✅ **Google Sheets Storage** - Fully implemented with multi-spreadsheet support

## Adding New Storage Implementations

1. Create a new class implementing `IStorage` interface
2. Add the storage type to `StorageType` union in `types.ts`
3. Add configuration options to `StorageConfig` interface
4. Update the factory switch statement in `factory.ts`
5. Add environment variable handling in `getConfigForType`

## Files

- `types.ts` - Type definitions for storage configuration
- `factory.ts` - Storage factory for creating instances
- `memory-storage.ts` - In-memory storage implementation
- `database-storage.ts` - Database storage implementation (placeholder)
- `supabase-storage.ts` - Supabase storage implementation (placeholder)
- `google-sheets-storage.ts` - Google Sheets storage implementation (fully implemented)

## Google Cloud Setup

The Google Sheets storage implementation requires proper Google Cloud configuration. Follow these steps to set up Google Sheets integration:

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID for later use

### 2. Enable Required APIs

Enable the following APIs in your Google Cloud project:

1. **Google Sheets API**
   - Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
   - Search for "Google Sheets API" and enable it

2. **Google Drive API**
   - Search for "Google Drive API" and enable it

### 3. Create Service Account Credentials

#### Option A: Service Account (Recommended for Production)

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - Name: `quozen-sheets-service`
   - Description: `Service account for Quozen Google Sheets integration`
4. Click "Create and Continue"
5. Skip the optional steps and click "Done"
6. Click on the created service account
7. Go to the "Keys" tab
8. Click "Add Key" > "Create new key"
9. Choose "JSON" format and download the key file
10. **Keep this file secure** - it contains sensitive credentials

#### Option B: OAuth 2.0 Client (For Development)

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "OAuth client ID"
3. Choose "Web application" as the application type
4. Add your domain to authorized origins
5. Download the JSON credentials file

### 4. Create Root Spreadsheet

1. Create a new Google Spreadsheet
2. Name it "Quozen Root" or similar
3. Copy the spreadsheet ID from the URL (the long string between `/d/` and `/edit`)
4. This will be your `GOOGLE_SHEETS_ID`

### 5. Configure Permissions

#### For Service Account:
1. Open your root spreadsheet
2. Click "Share" button
3. Add the service account email (from the JSON file: `client_email`)
4. Give it "Editor" permissions
5. Click "Send"

#### For OAuth 2.0:
1. The spreadsheet will be created under your Google account
2. Ensure the OAuth client has access to your Google account

### 6. Environment Variables

Set the following environment variables in your deployment platform (Vercel, etc.):

#### For Service Account (Production):
```bash
STORAGE_TYPE=google-sheets
GOOGLE_SHEETS_ID=your_root_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
```

#### For JSON Credentials (Development):
```bash
STORAGE_TYPE=google-sheets
GOOGLE_SHEETS_ID=your_root_spreadsheet_id
GOOGLE_CREDENTIALS={"type":"service_account","project_id":"your-project",...}
```

### 7. Spreadsheet Structure

The system automatically creates the following structure:

#### Root Spreadsheet:
- **users** sheet: Contains all user data
- **groups** sheet: Contains group metadata and references to group spreadsheets
- **config** sheet: Contains application configuration

#### Group Spreadsheets:
- **expenses** sheet: Contains expenses for the specific group
- **settlements** sheet: Contains settlements for the specific group

### 8. Security Best Practices

1. **Never commit credentials to version control**
2. **Use environment variables for all sensitive data**
3. **Rotate service account keys regularly**
4. **Limit service account permissions to only what's needed**
5. **Monitor API usage in Google Cloud Console**
6. **Use Vercel's environment variable encryption**

### 9. Troubleshooting

#### Common Issues:

1. **"Authentication failed"**
   - Check that the service account email is correct
   - Verify the private key is properly formatted with `\n` for newlines
   - Ensure the service account has access to the spreadsheet

2. **"Spreadsheet not found"**
   - Verify the `GOOGLE_SHEETS_ID` is correct
   - Check that the service account has been shared with the spreadsheet

3. **"Permission denied"**
   - Ensure the service account has "Editor" permissions on the root spreadsheet
   - Check that the Google Sheets API is enabled

4. **"API quota exceeded"**
   - Monitor usage in Google Cloud Console
   - Consider implementing rate limiting
   - Upgrade to a paid plan if needed

#### Debug Mode:
Set `NODE_ENV=development` to see detailed error logs for troubleshooting.

### 10. Cost Considerations

- Google Sheets API has free tier limits
- Monitor usage in Google Cloud Console
- Consider upgrading to a paid plan for high-volume applications
- Each API call counts toward your quota

### 11. Backup Strategy

- The root spreadsheet serves as a backup of all user and group data
- Group spreadsheets contain detailed expense and settlement data
- Consider implementing regular exports to other storage systems
- Google Sheets has built-in version history for data recovery
