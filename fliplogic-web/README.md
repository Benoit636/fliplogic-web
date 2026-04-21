# FlipLogic Web — Frontend

Professional vehicle appraisal platform frontend built with Next.js 14, React 18, and TypeScript.

## Quick Start

### Prerequisites
- **Node.js 18+**
- **npm or yarn**
- Firebase project setup
- Backend API running (see fliplogic-backend)

### Installation

1. **Clone and install:**
```bash
git clone <repo-url>
cd fliplogic-web
npm install
```

2. **Environment variables:**
```bash
cp .env.example .env.local
# Edit .env.local with your Firebase credentials and API URL
```

3. **Start development server:**
```bash
npm run dev
```

App will be available at `http://localhost:3000`

---

## Architecture

```
src/
├── app/                      # Next.js 14 app directory
│   ├── layout.tsx           # Root layout
│   ├── globals.css          # Global styles
│   ├── login/               # Login page (OAuth)
│   ├── dashboard/           # Dashboard home
│   ├── appraisal/
│   │   ├── new/            # New appraisal form
│   │   └── [id]/results/   # Appraisal results
│   └── listings/            # Listings tracker
├── components/              # Reusable UI components
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Card.tsx
│   └── ...
├── lib/                     # Utilities
│   ├── firebase.ts          # Firebase config
│   └── api.ts               # API client
└── store/                   # Zustand stores
    └── auth.ts              # Auth state
```

---

## Key Pages

### 1. **Login** (`/login`)
- Firebase OAuth (Google, Apple)
- Professional banking/dealer aesthetic
- 14-day free trial signup

### 2. **Dashboard** (`/dashboard`)
- Welcome screen
- Quick links to appraisal and listings
- Stats cards (appraisals, listings, profit)

### 3. **New Appraisal** (`/appraisal/new`)
- VIN input with validation
- Appraisal type selection (on-site / sight-unseen)
- Condition assessment form
- Search radius slider
- Step-by-step UI (VIN → Conditions)

### 4. **Appraisal Results** (`/appraisal/[id]/results`)
- Key metrics (acquisition, recon, market value)
- Dynamic pricing strategy visualization
- Create listing button
- Appraisal details

### 5. **Listings Tracker** (`/listings`)
- Active listings with status
- Days on market counter
- Price tier tracking
- Sale history

---

## Design System

### Colors
- **Primary:** #4169b4 (Professional Dark Blue)
- **Accent:** #22c55e (Professional Green)
- **Neutral:** Grays for text and backgrounds
- **Status:** Red (danger), Yellow (warning), Blue (info)

### Typography
- **Display:** Georgia (serif, professional)
- **Body:** -apple-system (modern, clean)

### Components
- Buttons (primary, secondary, outline, danger)
- Inputs (text, number, range, select)
- Cards (with optional elevation)
- Forms with validation (React Hook Form + Zod)

---

## API Integration

### Authentication
```typescript
// Login returns JWT token
POST /api/auth/login
{
  firebaseUid: "...",
  email: "dealer@example.com",
  displayName: "John Dealer"
}

// Response
{
  token: "eyJhbGciOiJIUzI1NiIs...",
  user: { id, email, subscriptionStatus, ... }
}
```

### Create Appraisal
```typescript
POST /api/appraisals
Authorization: Bearer <token>
{
  vin: "3G1YY22G965452168",
  appraisalType: "on-site",
  searchRadiusKm: 400,
  conditionData: { paint: "good", tires: "fair", ... }
}
```

### Analyze Appraisal
```typescript
POST /api/appraisals/{id}/analyze
// Triggers scraping, AI analysis, pricing calculation
// Returns results with pricing strategy
```

---

## Development

### Hot Reload
```bash
npm run dev
```

Changes are reflected instantly.

### Build for Production
```bash
npm run build
npm start
```

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

---

## Deployment

### Vercel (Recommended)
```bash
# Connect GitHub repo
# Automatic deployment on push to main
```

### Docker
```bash
docker build -t fliplogic-web .
docker run -p 3000:3000 --env-file .env fliplogic-web
```

### Environment for Production
```
NEXT_PUBLIC_API_URL=https://api.fliplogic.com
NEXT_PUBLIC_FIREBASE_API_KEY=...
(and other Firebase vars)
```

---

## Features Implemented

✅ Professional/trustworthy design aesthetic  
✅ Firebase OAuth authentication  
✅ Dashboard with quick links  
✅ Multi-step appraisal form  
✅ Condition assessment  
✅ Results visualization  
✅ Responsive (web-first)  
✅ Form validation (Zod)  
✅ Error handling  
✅ Loading states  

---

## Features Coming Soon (Week 4+)

- Listings tracker page
- Seller email template display
- Subscription/billing page
- Photo upload (on-site appraisals)
- Mobile app (React Native)
- Analytics dashboard
- API documentation

---

## Common Issues

### "Firebase config not found"
Ensure .env.local has all FIREBASE variables set correctly.

### "API connection refused"
Make sure backend is running on port 3000.

### TypeScript errors
Run `npm run type-check` to find issues.

---

## Support

For questions, contact: benoit@fliplogic.com

---

## License

MIT © 2026 FlipLogic
