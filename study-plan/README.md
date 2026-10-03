This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Family Access

Set a family access password before opening the site:

```bash
FAMILY_ACCESS_PASSWORD=your-password
```

The local file is `study-plan/.env.local`. On the production server, keep the same variable in the server environment or `/www/study-plan/.env.local`.

## Cloud deployment

The production application uses PostgreSQL for shared learning data and a persistent upload
directory outside the release tree. GitHub Actions deploys `main`, runs database migrations,
builds the Next.js application, restarts the service, and checks `/api/health`.

See [CLOUD_DEPLOYMENT.md](./CLOUD_DEPLOYMENT.md) for the server environment, GitHub Secrets,
HTTPS, backup, restore, and verification checklist.

## National Day mathematics practice (700 questions)

`/subjects/[id]/national-day-math-practice` is the chapter directory only. It does
not fetch or render questions. Each of the seven chapter links opens
`/subjects/[id]/national-day-math-practice/CH01` through `CH07`, with ten questions
per page, type/difficulty filters, and a chapter-specific wrong-question list.
The URL selects the chapter even when a different location is restored from cloud progress.

Both the directory and chapter page show answered count, fully correct count,
and accuracy. Accuracy is fully correct questions / submitted unique questions,
rounded to one decimal place, using each question's **latest** submitted result.
Partial multi-item scores do not count as a fully correct question; retries do
not increase the answered count. An unanswered chapter displays `—`, not `0%`.
Existing cloud progress and drafts retain their original scope and schema.

Public JSON and passive SVG files are used without PDF extraction. Private
answers are encrypted in `src/server/holiday-math-700/answers.encrypted.json` and
decrypted only on the server with `HOLIDAY_MATH_700_KEY`; never expose that key
through `NEXT_PUBLIC_*`. Answers and explanations are returned only after a
complete submission. The source quality caveats remain visible in the UI.

Run the automated statistics and grading regression tests with:

```bash
node --test scripts/test-holiday-math-700-stats.mjs scripts/test-holiday-math-700.mjs
```

The browser regression script uses a separate headless Chrome context at
`127.0.0.1:9227` and an isolated preview at `127.0.0.1:3005`. It mocks progress
requests, blocks external browser traffic, and must not run against production
student records. After a production build, run
`node scripts/test-holiday-math-700-privacy.mjs` to check client bundles for private material.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
