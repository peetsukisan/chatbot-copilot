# 🤖 Chatbot Copilot

AI-powered Facebook Messenger chatbot with learning from chat history, smart escalation, and real-time admin dashboard.

## ✨ Features

- **🧠 AI Auto-Reply**: Uses Gemini AI to respond outside business hours (10:00-22:00)
- **📚 Learn from History**: Vector database learns from 60 days of chat history
- **🎯 Smart Intent Detection**: Automatically classifies customer inquiries
- **📈 Trend Analysis**: Analyzes trending topics and suggests FAQs
- **⚡ Quick Reply Suggestions**: AI suggests responses for staff
- **📱 Smart Escalation**: Escalates to staff when AI confidence is low
- **📋 Daily Reports**: Automated daily performance reports
- **💬 Real-time Dashboard**: Live chat monitoring with Socket.io
- **📢 Wake-up Campaigns**: Re-engage inactive customers

## 🛠 Tech Stack

| Component | Technology |
|-----------|------------|
| AI | Google Gemini API |
| Vector DB | Pinecone (Free 100K) |
| Backend | Node.js + Express |
| Database | SQLite |
| Real-time | Socket.io |
| Frontend | GitHub Pages |
| Hosting | Render (free tier) |

## 📁 Project Structure

```
chatbot-copilot/
├── backend/           # Node.js backend (deploy to Render)
│   ├── src/
│   │   ├── api/       # REST API routes
│   │   ├── services/  # Business logic
│   │   ├── models/    # Database models
│   │   └── jobs/      # Scheduled tasks
│   └── package.json
│
├── admin-dashboard/   # Static dashboard (deploy to GitHub Pages)
│   ├── index.html
│   ├── css/
│   └── js/
│
└── .github/workflows/ # CI/CD
```

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/chatbot-copilot.git
cd chatbot-copilot/backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required environment variables:
- `FB_PAGE_ACCESS_TOKEN` - Facebook Page access token
- `FB_VERIFY_TOKEN` - Custom webhook verify token
- `GEMINI_API_KEY_1` - Google Gemini API key
- `PINECONE_API_KEY` - Pinecone API key (free at pinecone.io)

### 3. Run Locally

```bash
npm run dev
```

### 4. Setup Facebook Webhook

1. Go to [Facebook Developers](https://developers.facebook.com)
2. Create/select your app
3. Add Messenger product
4. Set webhook URL: `https://your-render-url.com/webhook`
5. Set verify token (same as `FB_VERIFY_TOKEN`)
6. Subscribe to `messages` and `messaging_postbacks`

## 🌐 Deployment

### Backend (Render)

1. Push to GitHub
2. Connect repo to [Render](https://render.com)
3. Set environment variables
4. Deploy!

### Admin Dashboard (GitHub Pages)

1. Enable GitHub Pages in repo settings
2. Set source to `admin-dashboard` folder
3. Access at `https://username.github.io/chatbot-copilot/`

## 📊 Admin Dashboard

Access the dashboard to:
- Monitor live chats in real-time
- View customer profiles and history
- Analyze trends and AI performance
- Edit menu options
- Generate and view reports
- Manage wake-up campaigns

## 🔧 Configuration

### Business Hours
Edit in `.env`:
```
BUSINESS_HOURS_START=10:00
BUSINESS_HOURS_END=22:00
TIMEZONE=Asia/Bangkok
```

### AI Confidence Threshold
```
AI_CONFIDENCE_THRESHOLD=0.7
```

Messages with AI confidence below this will be escalated.

## 📝 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/webhook` | Facebook webhook |
| GET | `/api/admin/dashboard` | Dashboard data |
| GET | `/api/customers` | List customers |
| GET | `/api/chats/:id` | Chat history |
| POST | `/api/chats/:id/reply` | Send staff reply |
| GET | `/api/reports` | List reports |
| GET/POST | `/api/admin/menu` | Menu options |

## 📄 License

MIT
