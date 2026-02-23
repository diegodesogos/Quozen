# Quozen - Decentralized Expense Sharing

Quozen is a modern expense sharing application designed for simplicity, privacy, and collaboration. Unlike traditional split-wise clones that store your financial data on their servers, **Quozen is decentralized**.

**Your Data, Your Drive.**
Quozen operates entirely within your browser (Single Page Application). It uses your personal Google Drive to store groups, expenses, and settlements as standard Google Sheets. This means you own your data, and you can even view or edit it directly in Google Sheets!

## 🚀 Features

* **Google Sign-In**: Secure authentication using your existing Google account.
* **Collaborative Groups**: 
    * **Share via Email**: Invite friends by email to give them access to the group. They will see it in their "Shared with me" list and can edit expenses.
    * **Magic Link Sharing**: Generate a unique link to let anyone join the group instantly (permissions handled automatically).
    * **Offline Members**: Add members by username (e.g., "Bob") to track expenses for people who don't use the app.
* **Activity Hub**: A unified view to track all group expenses and internal money transfers (settlements) in one place.
* **Smart Data Sync**:
    * **Auto-Sync**: Automatically detects changes from other users and updates your view in near real-time (configurable polling).
    * **Pull-to-Refresh**: Intuitive mobile gesture to manually trigger a sync when auto-sync is active.
    * **Conflict Detection**: Prevents accidental overwrites if multiple users edit an expense simultaneously.
    * **Edit Safety**: Intelligent guards prevent syncing while you are typing or editing to avoid data loss.
* **Role-Based Access**:
    * **Owners**: Can edit group settings, manage members, and delete the group.
    * **Members**: Can add/edit expenses, view balances, and leave the group.
* **Internationalization & Localization**:
    * **Multi-Language Support**: Fully translated into **English** and **Spanish** (Español). Auto-detects your system preference with manual override in Profile.
    * **Regional Formatting**: Automatically formats dates and numbers (e.g., 1,234.56 vs 1.234,56) based on your selected locale.
    * **Currency Selection**: Set your preferred display currency (USD, EUR, GBP, JPY, etc.).
* **Smart Settlements**: Client-side algorithms calculate the most efficient way to settle debts.
* **Transparent Data**: Every group is just a Google Sheet. You can export, backup, or analyze your data using Excel/Sheets tools anytime.

## 🔐 Architecture & Security

Quozen utilizes **Client-Side OAuth 2.0** via Google Identity Services. There is **no backend server** handling your login or data. The relationship is strictly **You ↔ Google**.

### How it Works
1.  **Implicit Grant Flow**: When you sign in, the app requests an access token directly from Google.
2.  **Token Storage**: The access token is stored securely in your browser's (localStorage) for the duration of the session.
3.  **Direct API Calls**: The app uses this token to fetch/update files directly via the Google Drive and Sheets APIs.

### Required Permissions (Scopes)
To function, Quozen requests these specific permissions:

* `https://www.googleapis.com/auth/drive.file`: **File Management.** Allows Quozen to access *only* the files it creates. It **cannot** see your personal photos, docs, or other spreadsheets.
* `https://www.googleapis.com/auth/spreadsheets`: **Data Operations.** Allows reading and writing expenses to the specific group sheets.
* `email` & `profile`: **Identity.** Used to display your name/avatar and identify you in expense splits.

## 🛠 Tech Stack & Structure

Quozen is built as a **monorepo**, decoupling core business logic from the UI layer to enable portability (e.g., for AI agents, MCP servers, or Node.js integrations).

### Project Structure
- **`packages/core`**: The heart of Quozen. An isomorphic TypeScript library containing:
    - Split-bill algorithms and financial math.
    - Generalized Storage Adapters (Google Drive, In-Memory).
    - Domain types and error definitions.
- **`apps/webapp`**: The main React web application.
    - UI components using Shadcn UI and Framer Motion.
    - React Hooks for state management and data fetching.
    - Browser-specific integration (Local Storage, OAuth UI).
- **`apps/cli`**: A demo CLI interface providing access to core logic.
    - CLI commands for creating groups, adding expenses, and settling debts.
    - Node.js-specific integration (Google OAuth, Google Drive API).
- **`apps/api`**: TBD To be done.
    - TBD


### Core Technologies
* **Frontend**: React, TypeScript, Vite
* **Core Logic**: `@quozen/core` (Custom workspace package)
* **Styling**: Tailwind CSS, Shadcn UI, Framer Motion
* **State Management**: TanStack Query (React Query)
* **Authentication & Data**: Google Identity Services, Google Drive API v3, Google Sheets API v4
* **i18n**: react-i18next


### Architecture
The `@quozen/core` package provides a robust SDK `QuozenClient` that abstracts Google Drive IO, optimistic concurrency, and complex math.
You can use `QuozenClient` in the browser, edge functions, or Node.js.
   
## 🏃‍♂️ Getting Started

### Prerequisites

1.  **Node.js** (v18+) installed.
2.  A **Google Cloud Console** project with the following APIs enabled:
    * **Google Drive API**
    * **Google Sheets API**
    * **Google Picker API** (Required for importing shared groups)
3.  An **OAuth 2.0 Client ID** configured for your development URL (e.g., `http://localhost:3001`).
4.  An **API Key** restricted to the Google Picker API.

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the root directory (see `.env.example`):
    ```env
    # OAuth Client ID
    VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
    
    # API Key for Google Picker (File Selection)
    VITE_GOOGLE_PICKER_API_KEY=your_google_api_key_here
    
    # App Port
    VITE_PORT=3001

    # Auto-Sync Polling Interval (Seconds). Set to 0 to disable and use manual button.
    VITE_POLLING_INTERVAL=30
    ```
4.  Start the development server:
    ```bash
    npm run dev
    ```

5.  Open `http://localhost:3001` in your browser.

## 🧪 Testing

Quozen maintains high confidence through a multi-layered testing strategy:

- **Core Logic Tests**: Independent, fast unit tests for financial math and storage logic.
  ```bash
  npm run test --workspace=@quozen/core
  ```
- **App Unit Tests**: Component and hook testing within the React application.
  ```bash
  npm run test
  ```
- **E2E Tests**: Full user flow verification using Playwright (Mocked Storage).
  ```bash
  npm run test:e2e
  ```

## 💻 Command Line Interface (CLI)

Quozen comes with a demo terminal application to manage expenses without a graphical interface. This showcase the usage of the `@quozen/core` package in a Node.js environment.

### Setup
The CLI connects directly to your Google Drive via a local OAuth loopback server. This requires a **Desktop** OAuth client, which is different from the Web client used for the browser frontend.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services > Credentials**.
3. Click **Create Credentials > OAuth client ID**.
4. Select **Desktop app** as the Application type.
5. Copy the generated **Client ID** and **Client Secret**.

### Usage

1. **Authentication**:
   Since the CLI connects directly to your Google Drive, you'll need an OAuth Desktop Client ID and Secret.
   
   * Mac/Linux: *
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   npm run cli -- login
   ```

   * Windows (PowerShell): *
   ```powershell
   $env:GOOGLE_CLIENT_ID="your-desktop-client-id"
   $env:GOOGLE_CLIENT_SECRET="your-desktop-client-secret"
   npm run cli -- login

2. **Interactive Dashboard**:
   Launch the main menu to view balances, add expenses, and settle up.
   ```bash
   npm run cli
   ```
