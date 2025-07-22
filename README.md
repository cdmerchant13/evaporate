# Evaporate: Serverless File Sharing

Evaporate is a secure, ephemeral file sharing tool built entirely on the Cloudflare serverless ecosystem. Upload files, generate a unique link, and have them automatically "evaporate" after a set time or a single download.

- **Frontend:** Cloudflare Pages (React)
- **Backend API:** Cloudflare Workers
- **File Storage:** Cloudflare R2
- **Metadata Storage:** Cloudflare D1

---

## Prerequisites

Before you begin, ensure you have the following:

1.  **Node.js and npm:** [Download and install here](https://nodejs.org/).
2.  **A Cloudflare Account:** [Sign up for free here](https://dash.cloudflare.com/sign-up).
3.  **Git:** [Download and install here](https://git-scm.com/).

---

## 1. Local Development

Follow these steps to run the project on your local machine.

### Step 1: Clone and Install

```bash
# Clone this repository
git clone https://github.com/your-username/evaporate.git
cd evaporate

# Install all dependencies for the frontend and worker
npm install
```

### Step 2: Configure for Local Development

For local development, Wrangler uses a local SQLite file for the database, so the production `database_id` must be disabled.

Open `worker/wrangler.toml` and ensure the `database_id` line is **commented out** (it should look like the example below):

```toml
# worker/wrangler.toml
[[d1_databases]]
binding = "D1_DB"
database_name = "evaporate-db"
# For local development, the following line MUST be commented out
# database_id = "${D1_DATABASE_ID}"
migrations_dir = "db/migrations"
```

### Step 3: Run the Development Servers

This command starts both the backend and frontend servers.

```bash
npm run dev
```

- The backend worker will run on `http://localhost:8787`.
- The frontend will open in your browser at `http://localhost:3000`.

---

## 2. Production Deployment

This guide will walk you through deploying Evaporate to your Cloudflare account.

### Step 1: Install and Log in to Wrangler

Wrangler is the command-line tool for managing Cloudflare products.

```bash
# Install Wrangler globally if you haven't already
npm install -g wrangler

# Log in to your Cloudflare account
wrangler login
```

### Step 2: Create R2 Bucket and D1 Database

```bash
# Create the R2 bucket for file storage
wrangler r2 bucket create evaporate-files

# Create the D1 database for metadata
wrangler d1 create evaporate-db
```

This command will output crucial information, including the `database_id`. **Copy this ID.** If you ever lose it, you can find it again by running `wrangler d1 list`.

### Step 3: Configure for Production

Open `worker/wrangler.toml` and configure it for production:

1.  **Uncomment** the `database_id` line.
2.  Set the `database_id` to use an environment variable, `D1_DATABASE_ID`. This variable will hold the actual ID of your D1 database.

It should look like this:

```toml
# worker/wrangler.toml
[[d1_databases]]
binding = "D1_DB"
database_name = "evaporate-db"
# For production, the following line MUST be uncommented and filled
database_id = "${D1_DATABASE_ID}"
migrations_dir = "db/migrations"
```

**How to set `D1_DATABASE_ID`:**

*   **For local testing of production configuration:** Create a `.dev.vars` file in the `worker/` directory and add `D1_DATABASE_ID="YOUR_D1_DATABASE_ID_HERE"` to it. This file is ignored by Git.
*   **For Cloudflare Workers deployment:** Set the `D1_DATABASE_ID` environment variable in your Cloudflare Workers dashboard settings under "Settings" -> "Variables" or via `wrangler secret put D1_DATABASE_ID`.

### Step 4: Run Production Database Migrations

Apply the database schema to your **production** D1 database.

```bash
# This command must be run from the worker directory
cd worker
wrangler d1 migrations apply evaporate-db
cd ..
```

### Step 5: Deploy the Worker

With the production configuration in place, deploy the worker.

```bash
# Run from the project root
npm run deploy:worker
```

### Step 6: Deploy the Frontend to Cloudflare Pages

The final step is to deploy the frontend. This is best done by connecting your Git repository to Cloudflare Pages.

1.  **Push to your Git repository:** Make sure all your changes are committed and pushed.
2.  **Go to Cloudflare Pages:** In the Cloudflare dashboard, navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3.  **Select Your Repository:** Choose your project repository.
4.  **Configure Build Settings:**
    - **Project Name:** `evaporate` (or your choice)
    - **Production Branch:** `main`
    - **Framework preset:** `Create React App`
    - **Build command:** `npm run build`
    - **Build output directory:** `build`
    - **Root directory:** `frontend`
5.  **Save and Deploy:** Click **Save and Deploy**.

Once complete, your Evaporate application will be live!