import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth, db, googleProvider } from "./firebase-config.js";
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "firebase/auth";
import {
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp,
    limit
} from "firebase/firestore";

// ========== GEMINI API SETUP ==========
let API_KEY = "";
try {
    if (import.meta && import.meta.env) {
        API_KEY = import.meta.env.VITE_API_KEY;
    }
} catch (err) {
    console.error("Error accessing env vars:", err);
}

let genAI, model;
try {
    if (API_KEY) {
        genAI = new GoogleGenerativeAI(API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    }
} catch (e) {
    console.error("Failed to initialize Gemini:", e);
}

// ========== GLOBAL STATE ==========
let currentUser = null;
let currentChatId = null;
let chatMessages = [];
let urlContext = null; // Stores { url: string, content: string }
const THEME_KEY = 'ask_abraz_theme';
const LOCAL_CHAT_KEY = 'ask_abraz_local_chat';

// ========== SIDEBAR TABS & WEB READER ==========
function initSidebarTabs() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            switchSidebarTab(target);
        });
    });
}

function switchSidebarTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.sidebar-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
    });
    document.getElementById(tabName === 'chats' ? 'chats-content' : 'webreader-content').classList.add('active');
}

// ========== DYNAMIC THEME & URL CONTEXT ==========
async function fetchWebsiteContent(url) {
    const loadBtn = document.getElementById('load-url-btn');
    const statusDiv = document.getElementById('url-status');

    // Validate URL
    try {
        new URL(url);
    } catch {
        updateUrlStatus('Invalid URL format', 'error');
        return null;
    }

    // Show loading state
    loadBtn.textContent = '⏳ Loading...';
    loadBtn.disabled = true;
    updateUrlStatus('Fetch ho raha hai...', 'loading');

    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) throw new Error('Fetch failed');

        let html = await response.text();

        // Extract content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // --- Dynamic Theme Extraction ---
        // Try to get theme color from meta tag or favicon
        let themeColor = '#667eea'; // Default
        const metaTheme = doc.querySelector('meta[name="theme-color"]');
        if (metaTheme) themeColor = metaTheme.content;

        // Get Favicon
        let favicon = `https://www.google.com/s2/favicons?domain=${url}&sz=64`;

        // Get Title
        const siteTitle = doc.title || new URL(url).hostname;

        // Apply Theme
        applyWebReaderTheme(themeColor, siteTitle, url, favicon);

        // Process Content
        const elementsToRemove = doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript');
        elementsToRemove.forEach(el => el.remove());

        let mainContent = doc.querySelector('article, main, .content, .post') || doc.body;
        let textContent = mainContent.textContent
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .trim()
            .substring(0, 8000);

        if (textContent.length < 100) throw new Error('No content found');

        // Success
        urlContext = { url, content: textContent, title: siteTitle, theme: themeColor };

        updateUrlStatus('✅ Loaded!', 'success');
        showToast('Website Loaded!');

        // Switch to Web Reader Chat Mode
        document.getElementById('chat-container').classList.add('hidden');
        document.getElementById('web-reader-chat').classList.remove('hidden');

        // Add welcome message in Web Reader
        const wrContainer = document.getElementById('wr-chat-container');
        wrContainer.innerHTML = ''; // Clear previous
        const welcomeMsg = `
            <div class="message system-message">
                <div class="avatar" style="background: white; padding: 2px;"><img src="${favicon}" style="width:100%; border-radius: 4px;"></div>
                <div class="content">
                    <p><strong>${siteTitle}</strong> loaded! 🌐<br>
                    Is website ke baray mein kuch bhi pucho.</p>
                </div>
            </div>`;
        wrContainer.innerHTML = welcomeMsg;

        return textContent;

    } catch (error) {
        console.error('Fetch error:', error);
        updateUrlStatus('❌ Failed to load', 'error');
        return null;
    } finally {
        loadBtn.innerHTML = '🔗 Load Website';
        loadBtn.disabled = false;
    }
}

function applyWebReaderTheme(color, title, url, favicon) {
    // Update CSS variables for dynamic theme
    const root = document.documentElement;
    root.style.setProperty('--wr-bg', color);

    // Update Header Info
    document.getElementById('wr-site-title').textContent = title;
    document.getElementById('wr-site-url').textContent = new URL(url).hostname;
    document.getElementById('wr-site-icon').src = favicon;

    // Update Sidebar Info
    document.getElementById('loaded-site-info').classList.remove('hidden');
    document.getElementById('site-name').textContent = title.substring(0, 20) + '...';
    document.getElementById('site-favicon').src = favicon;
}

function closeWebReaderMode() {
    urlContext = null;
    document.getElementById('web-reader-chat').classList.add('hidden');
    document.getElementById('chat-container').classList.remove('hidden');
    document.getElementById('loaded-site-info').classList.add('hidden');
    document.getElementById('url-input').value = '';
    updateUrlStatus('', '');

    // Reset theme
    document.documentElement.style.removeProperty('--wr-bg');
}

function updateUrlStatus(message, type) {
    const status = document.getElementById('url-status');
    if (status) {
        status.textContent = message;
        status.className = `url-status show ${type}`;
    }
}

// ========== THEME MANAGEMENT ==========
function loadTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        return true;
    } else if (savedTheme === 'light') {
        return false;
    } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
        return true;
    }
    return false;
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.textContent = isDark ? '☀️' : '🌙';
}

// ========== VOICE INPUT ==========
let recognition = null;
let isRecording = false;

function initVoiceInput() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'ur-PK';

        recognition.onresult = (e) => {
            document.getElementById('user-input').value = e.results[0][0].transcript;
            stopRecording();
        };
        recognition.onerror = () => stopRecording();
        recognition.onend = () => stopRecording();
        return true;
    }
    return false;
}

function startRecording() {
    if (recognition && !isRecording) {
        recognition.start();
        isRecording = true;
        const btn = document.getElementById('voice-btn');
        btn.classList.add('recording');
        btn.textContent = '🔴';
    }
}

function stopRecording() {
    if (isRecording) {
        try { recognition?.stop(); } catch (e) { }
        isRecording = false;
        const btn = document.getElementById('voice-btn');
        btn?.classList.remove('recording');
        if (btn) btn.textContent = '🎤';
    }
}

// ========== TEXT-TO-SPEECH ==========
function speakText(text) {
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/•/g, '').trim();
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'hi-IN';
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
    }
}

function stopSpeaking() {
    speechSynthesis?.cancel();
}

// ========== CLIPBOARD ==========
function copyToClipboard(text, button) {
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    navigator.clipboard.writeText(cleanText).then(() => {
        button.classList.add('copied');
        button.innerHTML = '✓ Copied!';
        showToast("Copied!");
        setTimeout(() => {
            button.classList.remove('copied');
            button.innerHTML = '📋 Copy';
        }, 2000);
    });
}

// ========== TOAST ==========
function showToast(message) {
    document.querySelector('.toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ========== AUTHENTICATION ==========
async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        showToast(`Welcome, ${result.user.displayName}!`);
    } catch (error) {
        console.error("Sign in error:", error);
        showToast("Sign in failed. Please try again.");
    }
}

async function logOut() {
    try {
        await signOut(auth);
        showToast("Logged out successfully");
        currentChatId = null;
        chatMessages = [];
    } catch (error) {
        console.error("Logout error:", error);
    }
}

function updateAuthUI(user) {
    const signInBtn = document.getElementById('google-signin-btn');
    const userProfile = document.getElementById('user-profile');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    if (user) {
        signInBtn.classList.add('hidden');
        userProfile.classList.remove('hidden');
        userAvatar.src = user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName);
        userName.textContent = user.displayName;
    } else {
        signInBtn.classList.remove('hidden');
        userProfile.classList.add('hidden');
    }
}

// ========== FIRESTORE OPERATIONS ==========
async function saveConversation() {
    if (!currentUser || chatMessages.length === 0) return;

    const title = chatMessages[0]?.content?.substring(0, 50).replace(/<[^>]*>/g, '') || 'New Chat';

    try {
        if (currentChatId) {
            // Update existing conversation
            await updateDoc(doc(db, 'users', currentUser.uid, 'chats', currentChatId), {
                messages: chatMessages,
                updatedAt: serverTimestamp()
            });
        } else {
            // Create new conversation
            const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'chats'), {
                title: title,
                messages: chatMessages,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            currentChatId = docRef.id;
            loadConversationList(); // Refresh sidebar
        }
    } catch (error) {
        console.error("Error saving conversation:", error);
    }
}

async function loadConversationList() {
    if (!currentUser) return;

    const listContainer = document.getElementById('conversation-list');
    listContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">Loading...</div>';

    try {
        const q = query(
            collection(db, 'users', currentUser.uid, 'chats'),
            orderBy('updatedAt', 'desc'),
            limit(20)
        );
        const snapshot = await getDocs(q);

        listContainer.innerHTML = '';

        if (snapshot.empty) {
            listContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">No conversations yet</div>';
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = 'conversation-item' + (docSnap.id === currentChatId ? ' active' : '');
            item.innerHTML = `
                <span class="icon">💬</span>
                <span class="title">${data.title || 'Chat'}</span>
            `;
            item.onclick = () => loadConversation(docSnap.id, data);
            listContainer.appendChild(item);
        });
    } catch (error) {
        console.error("Error loading conversations:", error);
        listContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">Error loading</div>';
    }
}

async function loadConversation(chatId, data) {
    currentChatId = chatId;
    chatMessages = data.messages || [];

    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';

    // Add welcome message
    addWelcomeMessage();

    // Render saved messages
    chatMessages.forEach(msg => {
        renderMessage(msg.content, msg.type);
    });

    // Update active state in sidebar
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    event?.target?.closest('.conversation-item')?.classList.add('active');

    // Close sidebar on mobile
    closeSidebar();
}

function startNewChat() {
    currentChatId = null;
    chatMessages = [];

    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';
    addWelcomeMessage();

    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    closeSidebar();
    showToast("New chat started!");
}

// ========== LOCAL STORAGE (for non-logged users) ==========
function saveLocalChat() {
    if (currentUser) return; // Use Firestore for logged users
    localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(chatMessages));
}

function loadLocalChat() {
    try {
        const saved = localStorage.getItem(LOCAL_CHAT_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
}

// ========== SIDEBAR ==========
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
}

// ========== UI HELPERS ==========
function addWelcomeMessage() {
    const chatContainer = document.getElementById('chat-container');
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'message system-message welcome-msg';
    welcomeDiv.innerHTML = `
        <div class="avatar">🧠</div>
        <div class="content">
            <p>Assalam o Alaikum Jan 👋<br>
                Main hoon <strong>Ask ABraz 🧠</strong>, 'Har Maslay Ka Hal' AI.<br>
                Bas apna masla likho… main solution de deta hun ⭐</p>
        </div>
    `;
    chatContainer.appendChild(welcomeDiv);
}

function renderMessage(htmlContent, type) {
    const isWebReader = urlContext !== null;
    const targetId = isWebReader ? 'wr-chat-container' : 'chat-container';
    const chatContainer = document.getElementById(targetId);

    const div = document.createElement('div');
    div.className = `message ${type === 'user' ? 'user-message' : 'system-message'}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = type === 'user' ? '👤' : '🧠';

    const content = document.createElement('div');
    content.className = 'content';
    content.innerHTML = htmlContent;

    if (type === 'ai') {
        const actions = document.createElement('div');
        actions.className = 'message-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.innerHTML = '📋 Copy';
        copyBtn.onclick = () => copyToClipboard(htmlContent, copyBtn);

        const speakBtn = document.createElement('button');
        speakBtn.className = 'action-btn';
        speakBtn.innerHTML = '🔊 Sunein';
        speakBtn.onclick = () => {
            if (speechSynthesis.speaking) {
                stopSpeaking();
                speakBtn.innerHTML = '🔊 Sunein';
            } else {
                speakText(htmlContent);
                speakBtn.innerHTML = '⏹️ Stop';
            }
        };

        actions.appendChild(copyBtn);
        actions.appendChild(speakBtn);
        content.appendChild(actions);
    }

    div.appendChild(avatar);
    div.appendChild(content);
    chatContainer.appendChild(div);
}

function showLoading() {
    const isWebReader = urlContext !== null;
    const targetId = isWebReader ? 'wr-chat-container' : 'chat-container';
    const chatContainer = document.getElementById(targetId);

    const id = 'loading-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message system-message';
    div.innerHTML = `
        <div class="avatar">🧠</div>
        <div class="content" style="padding: 14px 18px;">
            <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
    `;
    chatContainer.appendChild(div);
    return id;
}

function removeLoading(id) {
    document.getElementById(id)?.remove();
}

function scrollToBottom() {
    const isWebReader = urlContext !== null;
    const targetId = isWebReader ? 'wr-chat-container' : 'chat-container';
    const chatContainer = document.getElementById(targetId);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ========== GEMINI API ==========
async function generateGeminiResponse(userQuery) {
    // Build conversation context from previous messages
    let context = "";
    const recentMessages = chatMessages.slice(-6); // Last 6 messages for context

    if (recentMessages.length > 0) {
        context = "Previous conversation:\n";
        recentMessages.forEach(msg => {
            const cleanContent = msg.content.replace(/<[^>]*>/g, '').substring(0, 200);
            context += `${msg.type === 'user' ? 'User' : 'ABraz'}: ${cleanContent}\n`;
        });
        context += "\n";
    }

    // Check if URL context is active
    let websiteContext = "";
    if (urlContext && urlContext.content) {
        websiteContext = `
        IMPORTANT: The user has loaded a website. You MUST answer based on this website's content ONLY.
        Website URL: ${urlContext.url}
        Website Content:
        ---
        ${urlContext.content.substring(0, 6000)}
        ---
        
        RULES for URL Context Mode:
        - Answer ONLY based on the website content above
        - If the question is not related to the website, politely say the website mein ye information nahi hai
        - Summarize, explain, or answer based on the website content
        - Keep responses focused on the loaded website
        `;
    }

    const prompt = `
        You are "Ask ABraz", a helpful, friendly, and motivational AI assistant for Pakistani students and youth.
        Your persona:
        - You speak in "Roman Urdu" mixed with English (e.g., "Kaisay hain aap?", "Tension na lein").
        - You are polite, encouraging, and solution-oriented.
        - You NEVER mention you are from Google. You are "Ask ABraz".
        - You remember previous context and refer to it naturally.
        - You are a specialized assistant focused on helping students with problems.

        ${websiteContext}
        ${context}
        
        Current User Query: "${userQuery}"

        IMPORTANT: Output your answer ONLY in the following HTML format (no markdown code blocks):

        <div class="chat-section">
            <strong>[Short Greeting / Heading]</strong>
            <p>[Direct answer in Roman Urdu/English mix]</p>
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
        
        <div class="chat-section">
            <strong>🔥 Motivation</strong>
            <p><em>[A short motivational message]</em></p>
        </div>

        If user is just greeting, omit Action Plan/Tips. If asking who you are, just give a brief intro.
    `;

    const result = await model.generateContent(prompt);
    let text = (await result.response).text();
    return text.replace(/```html/g, '').replace(/```/g, '');
}

// ========== MAIN SEND HANDLER ==========
async function handleSend() {
    const input = document.getElementById('user-input');
    const text = input.value.trim();
    if (!text) return;

    stopSpeaking();

    // Add user message
    chatMessages.push({ type: 'user', content: text, time: new Date().toISOString() });
    renderMessage(text, 'user');
    input.value = '';

    const loadingId = showLoading();
    scrollToBottom();

    try {
        if (!model && API_KEY) {
            genAI = new GoogleGenerativeAI(API_KEY);
            model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        }

        const response = await generateGeminiResponse(text);
        removeLoading(loadingId);

        chatMessages.push({ type: 'ai', content: response, time: new Date().toISOString() });
        renderMessage(response, 'ai');

        // Save conversation
        if (currentUser) {
            saveConversation();
        } else {
            saveLocalChat();
        }
    } catch (error) {
        console.error("Gemini Error:", error);
        removeLoading(loadingId);
        const errMsg = `<div class="chat-section"><p><strong>Error:</strong> ${error.message}<br>Maaf kijiye, kuch masla aa gaya.</p></div>`;
        renderMessage(errMsg, 'ai');
    }

    scrollToBottom();
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    const isDark = loadTheme();
    updateThemeIcon(isDark);
    initVoiceInput();

    // Auth state listener
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateAuthUI(user);

        if (user) {
            loadConversationList();
        } else {
            // Load local chat for anonymous users
            const localMessages = loadLocalChat();
            if (localMessages.length > 0) {
                chatMessages = localMessages;
                const chatContainer = document.getElementById('chat-container');
                chatContainer.innerHTML = '';
                addWelcomeMessage();
                localMessages.forEach(msg => renderMessage(msg.content, msg.type));
            }
        }
    });

    // Event Listeners
    document.getElementById('send-btn').addEventListener('click', handleSend);
    document.getElementById('user-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('google-signin-btn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logout-btn')?.addEventListener('click', logOut);
    document.getElementById('new-chat-btn')?.addEventListener('click', startNewChat);
    document.getElementById('menu-toggle')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

    document.getElementById('clear-chat-btn')?.addEventListener('click', () => {
        if (confirm("Clear this chat?")) {
            startNewChat();
        }
    });

    document.getElementById('voice-btn')?.addEventListener('click', () => {
        isRecording ? stopRecording() : startRecording();
    });

    document.getElementById('quick-suggestions')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('suggestion-chip')) {
            document.getElementById('user-input').value = e.target.dataset.query;
            handleSend();
        }
    });

    // URL Context Event Listeners
    document.getElementById('load-url-btn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('url-input');
        const url = urlInput.value.trim();
        if (url) {
            fetchWebsiteContent(url);
        } else {
            showToast('Please enter a URL');
        }
    });

    document.getElementById('url-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('load-url-btn').click();
        }
    });

    document.getElementById('clear-url-btn')?.addEventListener('click', closeWebReaderMode);
    document.getElementById('exit-web-reader')?.addEventListener('click', closeWebReaderMode);

    // Initialize logic
    initSidebarTabs();
    document.getElementById('user-input').focus();

    document.getElementById('user-input').focus();
});
