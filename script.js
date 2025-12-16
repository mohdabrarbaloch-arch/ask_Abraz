// VISUAL DEBUGGER - Show errors on screen
window.onerror = function (msg, url, line, col, error) {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        const div = document.createElement('div');
        div.style.background = '#ff4444';
        div.style.color = 'white';
        div.style.padding = '10px';
        div.style.margin = '10px';
        div.style.borderRadius = '5px';
        div.innerHTML = `<strong>Critical Error:</strong><br>${msg}<br><small>${url}:${line}</small>`;
        chatContainer.appendChild(div);
    }
    return false;
};

import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini API
// Vercel/Vite will inject this
// Initialize Gemini API
let API_KEY = "";
try {
    // Safe check for Vite environment
    if (import.meta && import.meta.env) {
        API_KEY = import.meta.env.VITE_API_KEY;
    } else {
        console.warn("import.meta.env is undefined. Application might be running in raw mode.");
    }
} catch (err) {
    console.error("Error accessing env vars:", err);
}

if (!API_KEY) {
    console.error("API Key is missing! Make sure VITE_API_KEY is set in .env or Vercel Settings.");
}

// Global variable, initialized later
let genAI;
let model;

try {
    if (API_KEY) {
        genAI = new GoogleGenerativeAI(API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    }
} catch (e) {
    console.error("Failed to initialize Gemini:", e);
}

document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

    // Auto focus input
    userInput.focus();

    // Event Listeners
    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    async function handleSend() {
        console.log("Send button clicked"); // DEBUG
        const text = userInput.value.trim();
        if (!text) {
            console.log("Input is empty");
            return;
        }

        // 1. Add User Message
        try {
            addMessage(text, 'user');
        } catch (err) {
            console.error("Error adding user message:", err);
            alert("Error in UI: " + err.message);
            return;
        }
        userInput.value = '';

        // 2. Show Typing Indicator
        let loadingId;
        try {
            loadingId = showLoading();
        } catch (err) {
            console.error("Error showing loading:", err);
        }
        scrollToBottom();

        // 3. Generate AI Response
        try {
            if (!model) {
                // Try initializing again just in case
                if (API_KEY) {
                    console.log("Re-initializing model...");
                    genAI = new GoogleGenerativeAI(API_KEY);
                    model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
                } else {
                    throw new Error("API Key missing (VITE_API_KEY). Check Vercel.");
                }
            }
            console.log("Calling Gemini API..."); // DEBUG
            const response = await generateGeminiResponse(text);
            console.log("Gemini API responding..."); // DEBUG
            if (loadingId) removeLoading(loadingId);
            addMessage(response, 'ai');
        } catch (error) {
            console.error("Gemini Error:", error);
            if (loadingId) removeLoading(loadingId);
            addMessage(`<div class="chat-section"><p><strong>Error:</strong> ${error.message || error}<br>Maaf kijiye, kuch takneeki kharabi aa gayi hai.</p></div>`, 'ai');
        }
        scrollToBottom();
    }

    function addMessage(htmlContent, type) {
        const div = document.createElement('div');
        div.classList.add('message');
        div.classList.add(type === 'user' ? 'user-message' : 'system-message');

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = type === 'user' ? '👤' : '🧠';

        const content = document.createElement('div');
        content.className = 'content';
        content.innerHTML = htmlContent;

        div.appendChild(avatar);
        div.appendChild(content);
        chatContainer.appendChild(div);
    }

    function showLoading() {
        const id = 'loading-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.classList.add('message', 'system-message');
        div.innerHTML = `
            <div class="avatar">🧠</div>
            <div class="content" style="padding: 10px 18px;">
                <span class="typing-dots">Thinking...</span>
            </div>
        `;
        chatContainer.appendChild(div);
        return id;
    }

    function removeLoading(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // --- GEMINI API INTEGRAION ---
    async function generateGeminiResponse(userQuery) {
        const prompt = `
            You are "Ask ABraz", a helpful, friendly, and motivational AI assistant for Pakistani students and youth.
            Your persona:
            - You speak in "Roman Urdu" mixed with English (e.g., "Kaisay hain aap?", "Tension na lein").
            - You are polite, encouraging, and solution-oriented.
            - You NEVER mention you are from Google. You are "Ask ABraz".
            - You are a specialized assistant focused exclusively on your given task. If the user submits a query or request that falls outside the scope of this assigned task, you must respond politely and concisely, stating that you are only authorized to assist with the specific task at hand. Do not provide troubleshooting steps, action plans, or any substantive information regarding the out-of-scope query.

            User Query: "${userQuery}"

            IMPORTANT: You must output YOUR ANSWER ONLY in the following HTML format (do not use markdown code blocks, just raw HTML string):

            <div class="chat-section">
                <strong>[Short Greeting / Heading]</strong>
                <p>[Direct answer to the user's problem in Roman Urdu/English mix]</p>
            </div>
            
            <div class="chat-section">
                <strong>🧠 Action Plan</strong>
                <ul>
                    <li>• [Step 1]</li>
                    <li>• [Step 2]</li>
                    <li>• [Step 3]</li>
                </ul>
            </div>
            
            <div class="chat-section">
                <strong>💡 Pro Tips</strong>
                 <ul>
                    <li>• [Tip 1]</li>
                    <li>• [Tip 2]</li>
                </ul>
            </div>
            
            <div class="chat-section" style="margin-top: 8px;">
                <strong>🔥 Motivation</strong>
                <p><em>[A short motivational quote or encouragement]</em></p>
            </div>

            If the user is just saying hello, you can omit the Action Plan and Tips, just give a warm greeting in the first div.
            If the user asks who you are, just answer in the first div.
        `;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            let text = response.text();

            // Cleanup in case model returns markdown code blocks
            text = text.replace(/```html/g, '').replace(/```/g, '');
            return text;
        } catch (error) {
            throw error;
        }
    }
});
