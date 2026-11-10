# Taskday

A lightweight daily task reminder app built with React, Tailwind CSS, Vite, and Lucide icons.

## Run locally

```sh
npm install
npm run dev
```

Run `npm run build` for a production bundle and `npm run lint` for ESLint.

## Features

- Add, edit, complete, and delete tasks
- Search by task title, filter by All, Today, Pending, Completed, or Overdue, and sort by due date/time
- Dashboard counts for total, pending, completed, and overdue tasks
- Responsive task cards and validation for required title, date, and time
- Local browser storage so tasks survive a page refresh
- In-app due-time alerts while the app is open
- Optional desktop/browser alerts after enabling notification permission

Tasks and alert de-duplication are stored in this browser's `localStorage`; they are not synced across devices.
