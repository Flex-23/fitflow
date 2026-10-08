# FitFlow

FitFlow is a gym management system I built to run a gym from one place: a web
dashboard for the staff, and a mobile app for the members.

The idea came from a real problem. Running a gym means a lot of manual work:
keeping track of who is subscribed, who is late on a payment, writing a training
or diet plan for each member, and then chasing everyone on WhatsApp to send it.
FitFlow puts all of that in one system, and gives the members their own app so
they can follow their subscription and their program without asking the front
desk every time.

It is built Arabic-first (right to left), and it is already used in a real gym.

## What the staff can do (web dashboard)

- Register members and manage their subscriptions, renewals and freezes.
- Track payments, debts and daily expenses.
- Write a training and a nutrition program for each member and send it as a
  clean, printable Arabic PDF.
- Keep a library of exercise videos and link them to the exercises.
- See reports, and an activity log of what every staff member did.
- Give the owner, managers, reception and coaches each their own access level.

## What the member gets (mobile app)

- Sign in with the phone number the gym registered, using a one-time code sent
  over WhatsApp. Each account is tied to one phone.
- See the subscription, how many days are left, and a reminder before it ends.
- Open the training and nutrition program, and watch the exercise videos inside
  the app.
- Track attendance and keep a daily streak.
- Arabic interface, with a light and a dark theme.

## Built with

- Web: Next.js, React, TypeScript, Tailwind CSS
- Database: PostgreSQL with Prisma
- Mobile: Flutter
- Hosting: Vercel and Supabase

## Running it locally

```bash
npm install
cp .env.example .env     # fill in the values
npm run db:deploy        # set up the database
npm run db:seed          # create the first manager account
npm run dev              # http://localhost:3000
```

The gym's WhatsApp sender runs as a separate background worker so messages go
out from the gym's own number.
