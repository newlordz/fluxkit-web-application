# 📌 Masterfilepro 5 TB Google Drive Storage Setup Guide

Save this guide for when you are ready to connect your **5 TB Gemini Google Drive** account online.

---

## 🌐 Production URL
- **Live App**: [https://masterfilepro.com](https://masterfilepro.com)
- **Documents & Drive Vault**: [https://masterfilepro.com/#documents](https://masterfilepro.com/#documents)

---

## 🔑 2-Minute Google Cloud Setup

1. Open **[Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)** (switch to your 5 TB Google account if prompted).
2. Click **+ Create Credentials** → **OAuth client ID**.
3. Set **Application type**: `Web application`.
4. Under **Authorized JavaScript origins**, click **+ Add URI** and enter:
   ```text
   https://masterfilepro.com
   ```
5. *(Optional for testing locally)* Add `http://localhost:8443` or `http://localhost:5173`.
6. Click **Create** and copy your **Client ID** (format: `xxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com`).
7. Make sure the **Google Drive API** is enabled:
   - Go to **APIs & Services** → **Library** → Search `Google Drive API` → Click **Enable**.

---

## 🚀 How to Connect Online

### Option A: Direct in the Web UI (Fastest)
1. Go to [https://masterfilepro.com/#documents](https://masterfilepro.com/#documents).
2. In the top bar, click the **Client ID** button (or **Connect 5 TB Google Drive**).
3. Paste your Client ID and click **Save & Connect Drive**.
4. Google will pop up the account chooser (`prompt: select_account`). Choose your **5 TB Gemini Google Account** and accept permissions.

### Option B: Automatic for All Visitors (Vercel Project Setting)
1. Go to your **[Vercel Dashboard](https://vercel.com)** → Project **masterfilepro-web-application** → **Settings** → **Environment Variables**.
2. Add:
   - **Key**: `VITE_GOOGLE_CLIENT_ID`
   - **Value**: `Your Google Client ID`
3. Redeploy or save. The connection button will now work with 1 click for anyone on `https://masterfilepro.com`.

---

## 📂 How Your Files & Folders Are Organized

Once connected, Masterfilepro automatically structures your 5 TB Drive:

```text
📁 Masterfilepro Cloud Vault /
├── 📁 user1@email.com /
│   ├── converted-doc.docx
│   └── presentation.pptx
├── 📁 user2@email.com /
│   └── spreadsheet.xlsx
└── 📁 Personal Conversions /
```

- Each user has their own dedicated subfolder.
- Conversion history and file links are saved directly to your 5 TB cloud storage.
- Real-time quota displays your remaining gigabytes and usage.
