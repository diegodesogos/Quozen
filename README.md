# Quozen - Decentralized Expense Sharing

Quozen is a modern expense sharing application designed for simplicity, privacy, and collaboration. Unlike traditional split-wise clones that store your financial data on their servers, **Quozen is decentralized**.

**Your Data, Your Drive.**
Quozen operates entirely within your browser (Single Page Application). It uses your personal Google Drive to store groups, expenses, and settlements as standard Google Sheets. This means you own your data, and you can even view or edit it directly in Google Sheets!

## 🚀 Features

* **Google Sign-In**: Secure authentication using your existing Google account.
* **Collaborative Groups**: 
    * **Share via Email**: Invite friends by email to give them access to the group. They will see it in their "Shared with me" list and can edit expenses.
    * **Offline Members**: Add members by username (e.g., "Bob") to track expenses for people who don't use the app.
* **Activity Hub**: A unified view to track all group expenses and internal money transfers (settlements) in one place.
* **Role-Based Access**:
    * **Owners**: Can edit group settings, manage members, and delete the group.
    * **Members**: Can add/edit expenses, view balances, and leave the group.
* **Internationalization & Localization**:
    * **Multi-Language Support**: Fully translated into **English** and **Spanish** (Español). Auto-detects your system preference with manual override in Profile.
    * **Regional Formatting**: Automatically formats dates and numbers (e.g., 1,234.56 vs 1.234,56) based on your selected locale.
    * **Currency Selection**: Set your preferred display currency (USD, EUR, GBP, JPY, etc.).
* **Data Integrity**:
    * **Conflict Detection**: Prevents accidental overwrites if multiple users edit an expense simultaneously.
    * **Manual Sync**: Refresh data instantly to see the latest changes from other members.
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

## 🛠 Tech Stack

* **Frontend**: React, TypeScript, Vite
* **Styling**: Tailwind CSS, Shadcn UI
* **State Management**: TanStack Query (React Query)
* **Authentication & Data**: Google Identity Services, Google Drive API v3, Google Sheets API v4
* **i18n**: react-i18next

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
    ```
4.  Start the development server:
    ```bash
    npm run dev
    ```

5.  Open `http://localhost:3001` in your browser.

## 🧪 Testing

Run the client-side test suite:

```bash
npm run test       # Run unit tests (Vitest)
npm run test:e2e   # Run Playwright end-to-end tests (Mocked Storage)
