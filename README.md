# Ask ABraz 🧠

An AI-powered assistant for students, built with **Gemini API** and **Vite**.

## Setup Locally

1.  **Install Node.js** (if not installed).
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file and add your API Key:
    ```
    VITE_API_KEY=your_api_key_here
    ```
4.  Run the app:
    ```bash
    npm run dev
    ```

## Deploying to Vercel

1.  Push code to GitHub.
2.  Import project in Vercel.
3.  In **Environment Variables**, add:
    - `VITE_API_KEY` = `your_actual_api_key`
4.  Deploy!

## Security Note (Important!)

Since this is a client-side app, your API Key is visible in the browser network tab. To prevent misuse:
1.  Go to **Google AI Studio / Google Cloud Console**.
2.  Find your API Key settings.
3.  **Restrict the Key** to your specific domains:
    - `localhost` (for testing)
    - `ask-abraz.vercel.app` (your live site)
This ensures no one else can use your key on their website.
