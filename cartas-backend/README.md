# Cartas backend (Google Sheet)

Stores the letters from the **Cartas: write one, open one** section. Shopify ignores
this folder; it's here so the code is versioned with the theme.

## How the team uses it

| Column | What it does |
|---|---|
| **Status** | `Pending` when a letter arrives. Set it to `Show` to put the letter in the bag, or `Hide` to keep it out. |
| **Text** | The letter. You can edit it, for example to remove names, before setting it to Show. |
| **Type / Audio URL** | For a voice letter, add a row by hand with Type `voice` and an audio URL (upload the file in Shopify → Content → Files and copy its link). |
| **WhatsApp** | The writer's number. It's never sent to the website. |
| **Private** | Ticked by the writer. A private letter never appears on the site, even if its Status is Show. |
| **Yo también / Gracias / Respira / Total stamps** | Live stamp counts. |

The site updates within 2 minutes. To publish right away, use the menu
**Cartas → Publish changes to the site now**.

## Setup (once, about 10 minutes)

1. Create a new Google Sheet, for example "TEKILA Cartas", in the account the team uses.
2. Open **Extensions → Apps Script**, delete the sample code, and paste in all of `Code.gs` from this folder. Save.
3. In the function dropdown, choose **setup** and click **Run**. Approve the permissions; Google will say "unverified app", so click Advanced → Go to project. This creates the `Cartas` tab with its columns.
4. (Optional) To get an email for every new letter, go to **Project Settings → Script properties** and add `NOTIFY_EMAIL` with your email address.
5. Click **Deploy → New deployment → Web app**, then set:
   - Execute as: **Me**
   - Who has access: **Anyone**
   
   Deploy, then copy the **Web app URL** (it ends in `/exec`).
6. In Shopify, go to **Online Store → Customize → Home page → TEKILA cartas** and paste the URL into **Cartas backend URL**. Save.

After any change to `Code.gs`, go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**.
That keeps the same URL.

## API (used by `assets/tk-cartas.js`)

- `GET  <url>?action=list&limit=20` returns `{ letters: [{ number, type, text | audio, stamps: { yo, gracias, respira } }] }`
- `POST <url>` with `{"action":"seal","text","phone","private"}` returns `{ number }`
- `POST <url>` with `{"action":"stamp","number","type":"yo|gracias|respira"}` returns `{ ok: true }`

POST bodies are sent as `text/plain` JSON because Apps Script can't answer CORS preflight requests.
