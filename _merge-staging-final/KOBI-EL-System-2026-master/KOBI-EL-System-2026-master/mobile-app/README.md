# Techno Kol ERP — Mobile App

React Native + Expo mobile client for the KOBI-EL-System-2026 ERP.

## Quick Start

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (iOS / Android)

### Install dependencies
```bash
cd "mobile-app"
npm install
```

### Configure API
Create a `.env` file (optional):
```
EXPO_PUBLIC_API_URL=http://<YOUR_SERVER_IP>:3100
EXPO_PUBLIC_OPS_URL=http://<YOUR_SERVER_IP>:3200
```
If omitted, defaults to `localhost:3100` / `localhost:3200`.

### Run
```bash
npx expo start
```
Then scan the QR code with **Expo Go** on your phone.

### Platform-specific
```bash
npx expo start --android   # Android emulator
npx expo start --ios       # iOS simulator (macOS only)
```

## Features

| Screen | Description |
|--------|-------------|
| Login | RTL Hebrew login with secure token storage |
| Dashboard | KPI cards, recent projects, urgent alerts |
| Work Orders | List + detail view with status timeline |
| Employees | Field/office status, call integration |
| Projects | Progress bars, budget vs actual |
| Materials | Inventory with color-coded stock levels |
| Finance | Revenue/expense KPIs, invoice list |
| Alerts | Severity-sorted, acknowledge-able alerts |
| AI Assistant | Dual assistant: עוזר קובי + עוזר עוזי |
| Profile | User info + system config + logout |

## Architecture

- **Expo** managed workflow — no Xcode/Android Studio needed
- **React Navigation** — bottom tabs + stack navigators
- **Zustand** — global auth state
- **TanStack Query** — data fetching with caching
- **expo-secure-store** — encrypted token storage
- **Palantir dark theme** — `#0b0d10` bg, `#4a9eff` accent
- **Hebrew RTL** — all text right-aligned, writingDirection rtl

## API Connections
- `onyx-procurement` → port 3100 (finance, materials, auth)
- `techno-kol-ops` → port 3200 (work orders, employees, projects)

## Build for Production
```bash
npx eas build --platform android
npx eas build --platform ios
```
Requires EAS CLI and Expo account.
