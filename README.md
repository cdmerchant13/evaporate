# Evaporate: Serverless File Sharing

Evaporate is a secure, ephemeral file sharing tool built entirely on the Cloudflare serverless ecosystem. Upload files, generate a unique link, and have them automatically "evaporate" after a set time or a single download.

- **Frontend:** Cloudflare Pages (React)
- **Backend API:** Cloudflare Workers
- **File Storage:** Cloudflare R2
- **Metadata Storage:** Cloudflare D1

---

## How It Works

The application is split into two main parts:

1.  **The Frontend:** A React application served by Cloudflare Pages. This is the user interface where you upload files and configure their expiration settings.
2.  **The Backend:** A Cloudflare Worker that acts as the API. It handles the business logic:
    - Validating and receiving file uploads.
    - Storing the actual file in a private R2 bucket.
    - Saving file metadata (like its name, expiration, and passphrase) in a D1 database.
    - Serving files to users who have a valid link.
    - Deleting files from R2 and D1 once they expire.

---

## Prerequisites

Before you begin, ensure you have the following:

1.  **Node.js and npm:** [Download and install here](https://nodejs.org/).
2.  **A Cloudflare Account:** [Sign up for free here](https://dash.cloudflare.com/sign-up).
3.  **Git:** [Download and install here](https://git-scm.com/).

---

## 1. Local Development Setup

Follow these steps to get the project running on your local machine for development and testing.

### Step 1: Clone the Repository

First, clone this repository to your local machine and navigate into the project directory.

```bash
git clone https://github.com/your-username/evaporate.git
cd evaporate
```

### Step 2: Install All Dependencies

This single command will install the dependencies for both the `frontend` and the `worker`.

```bash
npm install
```

### Step 3: Run the Development Servers

This command will start both the backend worker and the frontend React app in parallel.

```bash
npm run dev
```

- The backend worker will be running on `http://localhost:8787`.
- The frontend will open in your browser at `http://localhost:3000`.

The frontend is configured to automatically proxy API requests to the worker, so everything should work seamlessly.

---

## 2. Deployment to Cloudflare

This guide will walk you through deploying Evaporate to your own Cloudflare account.

### Step 1: Install and Log in to Wrangler

Wrangler is the command-line tool for managing Cloudflare developer products.

```bash
# Install Wrangler globally
npm install -g wrangler

# Log in to your Cloudflare account
wrangler login
```

This will open a browser window asking you to authorize Wrangler.

### Step 2: Create the R2 Bucket

R2 is Cloudflare's object storage, where the uploaded files will be stored.

```bash
# This command creates a new, private R2 bucket.
wrangler r2 bucket create evaporate-files
```

The name `evaporate-files` is already configured in `worker/wrangler.toml`.

### Step 3: Create the D1 Database

D1 is Cloudflare's serverless SQL database, used here to store file metadata.

```bash
# This command creates a new D1 database.
wrangler d1 create evaporate-db
```

This command will output crucial information, including the `database_id`. **Copy this ID.**

### Step 4: Update `wrangler.toml` for Production

Open the `worker/wrangler.toml` file. For production, you need to **uncomment** the `database_id` line and paste the ID you copied in the previous step.

**Note:** For local development, the `database_id` line must be commented out.

```toml
# worker/wrangler.toml

# ... other config ...

[[d1_databases]]
binding = "D1_DB"
database_name = "evaporate-db"
# For local development, database_id should be commented out.
# For production, uncomment it and replace with your actual database_id.
# database_id = "PASTE_YOUR_DATABASE_ID_HERE"
migrations_dir = "db/migrations"
```

### Step 5: Run Database Migrations

Now, apply the database schema to your newly created D1 database.

```bash
# This command must be run from the worker directory
cd worker
wrangler d1 migrations apply evaporate-db
cd ..
```

### Step 6: Deploy the Worker and Build the Frontend

This command will deploy the backend worker and create a production-ready build of the frontend.

```bash
npm run deploy
```

### Step 7: Deploy the Frontend to Cloudflare Pages

The final step is to deploy the frontend. This is best done by connecting your Git repository (GitHub, GitLab) to Cloudflare Pages.

1.  **Push to GitHub:** Push the project to your own GitHub repository.
2.  **Go to Cloudflare Pages:** In the Cloudflare dashboard, navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3.  **Select Your Repository:** Choose the repository you just pushed.
4.  **Configure Build Settings:**
    - **Project Name:** `evaporate` (or your choice)
    - **Production Branch:** `main` (or your default branch)
    - **Framework preset:** `Create React App`
    - **Build command:** `npm run build`
    - **Build output directory:** `build`
    - **Root directory:** `frontend`
5.  **Save and Deploy:** Click **Save and Deploy**.

Cloudflare will now build and deploy your frontend. Once complete, your Evaporate application will be live on the internet! The Pages frontend will automatically be able to communicate with your deployed worker without any extra configuration.
