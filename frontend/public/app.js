// ===== Configuration & State =====
const socket = io('https://tm-live-backend.onrender.com');
const savedName = localStorage.getItem('tm_username');
if (!savedName) window.location.href = 'login.html';
let myName = savedName;
let myUserId = null; // assigned after generateUserId is defined
let currentCall = null;
let localStream = null;
let peerConnection = null;
let currentTargetId = null;
let notifications = [];
let recentCalls = [];
let favorites = [];
let chatHistory = [];
let isDarkMode = false;

// ===== Colors for Usernames =====
const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFD93D', '#6BCB7F'];

// ===== Emoji List =====
const emojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
    '🙂', '🙃', '🫠', '😉', '😊', '😇', '🥰', '😍',
    '🤩', '😘', '😗', '☺', '😚', '😙', '🥲', '😋',
    '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢',
    '🫣', '😏', '😶', '😐', '😑', '😬', '🙄', '😯',
    '😦', '😧', '😮', '😲', '🥱', '😳', '🤠', '😱',
    '😖', '😣', '😞', '😓', '😟', '😕', '🫤', '😝',
    '🥸', '😔', '😪', '😤', '😠', '😡', '🤬', '🥵',
    '🥶', '🤯', '😨', '😰', '😥', '😢', '😭', '😱',
    '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
    '🙁', '😖', '😣', '😞', '😓', '😟', '😕', '😿',
    '🙀', '😽', '😸', '😹', '😻', '😼', '🐱', '🐶'
];

// ===== Utility Functions =====
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}
myUserId = generateUserId();

function getUserColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) - hash) + username.charCodeAt(i);
        hash |= 0;
    }
    return colors[Math.abs(hash) % colors.length];
}

function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Notification Functions =====
function addNotification(content, type = 'normal', important = false) {
    const notification = {
        id: generateUserId(),
        content: content,
        type: type,
        important: important,
        timestamp: getCurrentTime(),
        read: false
    };
    
    notifications.unshift(notification);
    updateNotificationCount();
    renderNotifications();
    
    // Show browser notification
    if (Notification.permission === 'granted') {
        new Notification('TM Live', {
            body: content,
            icon: '/icon.png'
        });
    }
}

function updateNotificationCount() {
    const unreadCount = notifications.filter(n => !n.read).length;
    document.getElementById('notificationCount').textContent = unreadCount;
}

function renderNotifications() {
    const notificationList = document.getElementById('notificationList');
    notificationList.innerHTML = notifications.map(notification => `
        <div class="notification-item ${notification.important ? 'important' : ''} ${notification.type}" 
             onclick="${notification.important ? 'handleNotificationClick(\'' + notification.id + '\')' : ''}">
            <div class="notification-item-time">${notification.timestamp}</div>
            <div class="notification-item-content">${escapeHtml(notification.content)}</div>
            ${notification.important ? `
                <div class="notification-item-actions">
                    <button class="notification-btn-action" onclick="handleNotificationClick('${notification.id}')">
                        View
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function showNotifications() {
    document.getElementById('notificationPanel').classList.add('active');
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}

function closeNotifications() {
    document.getElementById('notificationPanel').classList.remove('active');
}

function handleNotificationClick(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
        notification.read = true;
        updateNotificationCount();
        renderNotifications();
        addNotification(`You viewed: ${notification.content}`, 'success');
    }
}

function closeAllNotifications() {
    notifications.forEach(n => n.read = true);
    updateNotificationCount();
    renderNotifications();
}

// ===== Settings Functions =====
function showSettings() {
    addNotification('Settings panel opened', 'info');
    // Here you can add more settings options
    const settings = {
        darkMode: isDarkMode,
        notificationsEnabled: Notification.permission === 'granted',
        soundEnabled: true
    };
    console.log('Current settings:', settings);
}

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    
    const icon = document.querySelector('.dark-mode-btn i');
    const text = document.querySelector('.dark-mode-btn span');
    
    if (isDarkMode) {
        icon.className = 'fas fa-sun';
        text.textContent = 'Light Mode';
        addNotification('Dark mode enabled', 'success');
    } else {
        icon.className = 'fas fa-moon';
        text.textContent = 'Dark Mode';
        addNotification('Light mode enabled', 'success');
    }
}

// ===== Video Call Functions =====
async function startLocalVideo() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        document.getElementById('localVideo').srcObject = localStream;
        document.getElementById('localStatus').innerHTML = '<i class="fas fa-video"></i>';
        return true;
    } catch(err) {
        alert('Could not access camera: ' + err.message);
        addNotification('Failed to access camera: ' + err.message, 'error', true);
        return false;
    }
}

function initPeerConnection(targetId) {
    const configuration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    
    peerConnection = new RTCPeerConnection(configuration);
    currentTargetId = targetId;
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: targetId, candidate: event.candidate });
        }
    };
    
    peerConnection.ontrack = (event) => {
        document.getElementById('remoteVideo').srcObject = event.streams[0];
        document.getElementById('remoteStatus').innerHTML = '<i class="fas fa-video"></i>';
    };
    
    peerConnection.onconnectionstatechange = () => {
        const status = peerConnection.connectionState;
        let icon = '<i class="fas fa-video"></i>';
        
        if (status === 'connected') {
            icon = '<i class="fas fa-video"></i>';
        } else if (status === 'disconnected') {
            icon = '<i class="fas fa-video-slash"></i>';
        }
        
        document.getElementById('localStatus').innerHTML = icon;
        document.getElementById('remoteStatus').innerHTML = icon;
    };
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

window.makeCall = async function(target, targetId) {
    currentCall = targetId;
    const started = await startLocalVideo();
    if (!started) return;
    
    document.getElementById('videoContainer').style.display = 'grid';
    document.getElementById('localUserName').textContent = myName;
    await initPeerConnection(targetId);
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { target: targetId, offer: offer });
    
    updateStatus(`📞 Calling ${target}...`);
    addNotification(`Calling ${target}...`, 'info');
    
    // Add to recent calls
    recentCalls.unshift({
        user: target,
        time: getCurrentTime(),
        type: 'video'
    });
    renderRecentCalls();
};

window.endCall = function() {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    document.getElementById('videoContainer').style.display = 'none';
    document.getElementById('localVideo').srcObject = null;
    document.getElementById('remoteVideo').srcObject = null;
    
    if (currentCall) {
        socket.emit('end_call', { target: currentCall });
    }
    
    currentCall = null;
    updateStatus('Call ended');
    addNotification('Call ended', 'success');
};

window.toggleCamera = function() {
    const track = localStream?.getVideoTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        const icon = track.enabled ? 'fa-video' : 'fa-video-slash';
        document.getElementById('localStatus').innerHTML = `<i class="fas ${icon}"></i>`;
        addNotification(track.enabled ? 'Camera enabled' : 'Camera disabled', 'info');
    }
};

window.toggleMicrophone = function() {
    const track = localStream?.getAudioTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        const icon = track.enabled ? 'fa-microphone' : 'fa-microphone-slash';
        document.getElementById('localStatus').innerHTML = `<i class="fas ${icon}"></i>`;
        addNotification(track.enabled ? 'Microphone enabled' : 'Microphone disabled', 'info');
    }
};

window.shareScreen = async function() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection?.getSenders().find(s => s.track?.kind === 'video');
        
        if (sender) {
            sender.replaceTrack(videoTrack);
            addNotification('Screen sharing started', 'success');
        }
        
        videoTrack.onended = () => {
            if (localStream) {
                const originalTrack = localStream.getVideoTracks()[0];
                sender.replaceTrack(originalTrack);
                addNotification('Screen sharing ended', 'info');
            }
        };
    } catch(err) {
        addNotification('Screen share failed: ' + err.message, 'error', true);
    }
};

function startNewCall() {
    const users = document.querySelectorAll('.user-item-name span');
    if (users.length > 0) {
        const userName = users[0].textContent;
        window.makeCall(userName, userName);
    } else {
        addNotification('No users available to call', 'warning', true);
    }
}

function showDashboardPanel(panel) {
    const onlineSection = document.getElementById('onlineSection');
    const recentSection = document.getElementById('recentSection');
    const chatPanel = document.getElementById('chatPanel');
    const panelButtons = document.querySelectorAll('.panel-btn');
    panelButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.panel === panel));

    if (panel === 'chat') {
        document.querySelector('.sidebar').style.display = 'none';
        chatPanel.style.display = 'flex';
    } else {
        document.querySelector('.sidebar').style.display = 'block';
        chatPanel.style.display = 'flex';
    }

    onlineSection.style.display = panel === 'recent' ? 'none' : 'block';
    recentSection.style.display = panel === 'recent' ? 'block' : 'none';

    if (panel === 'online') {
        document.querySelector('.sidebar').scrollTop = 0;
    }
}

function joinGameRoom() {
    showDashboardPanel('chat');
    updateStatus('🎮 Joined the Snake Arena');
    addNotification('Snake Arena is live — use chat, stream, or video call to connect with your team.', 'success');
}

function updateGameRoomPlayers(otherPlayerCount) {
    const countEl = document.getElementById('gamePlayersCount');
    if (!countEl) return;
    const currentCount = Math.min(4, Math.max(1, otherPlayerCount + 1));
    countEl.textContent = `${currentCount}/4`;
}

// ===== Chat Functions =====
window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text) {
        const messageData = {
            message: text,
            username: myName,
            time: getCurrentTime(),
            userId: myUserId
        };
        
        socket.emit('send_message', { message: text });
        
        // Add to chat history
        chatHistory.push(messageData);
        
        // Add my message to display
        addMessage(messageData);
        
        input.value = '';
        addNotification(`Message sent to all users`, 'success');
    }
};

const supportMessages = [];

function renderSupportMessages() {
    const container = document.getElementById('supportMessages');
    if (!container) return;
    container.innerHTML = supportMessages.map(msg => `
        <div class="support-message ${msg.sender}">
            ${escapeHtml(msg.text)}
        </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
}

function addSupportMessage(text, sender = 'bot') {
    supportMessages.push({ text, sender, time: getCurrentTime() });
    renderSupportMessages();
}

async function sendSupportMessage() {
    const input = document.getElementById('supportInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    addSupportMessage(text, 'user');
    input.value = '';

    try {
        const res = await fetch('/api/chatbot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        if (!res.ok) {
            addSupportMessage('Sorry, I could not get a response. Please try again later.', 'bot');
            return;
        }
        addSupportMessage(data.answer || 'I am here 24/7 and ready to help.', 'bot');
    } catch (err) {
        addSupportMessage('Unable to reach support service. Please try again later.', 'bot');
    }
}

function openSupportPanel() {
    const panel = document.getElementById('supportPanel');
    if (!panel) return;
    panel.classList.add('active');
    if (supportMessages.length === 0) {
        addSupportMessage('Hi! I am your 24/7 support assistant. Ask me anything about TM Live.', 'bot');
    }
}

function closeSupportPanel() {
    const panel = document.getElementById('supportPanel');
    if (!panel) return;
    panel.classList.remove('active');
}

function toggleSupportPanel() {
    const panel = document.getElementById('supportPanel');
    if (!panel) return;
    if (panel.classList.contains('active')) {
        closeSupportPanel();
    } else {
        openSupportPanel();
    }
}

function addMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const div = document.createElement('div');
    
    if (data.username === 'System') {
        div.className = 'system-message';
        div.innerHTML = data.message;
    } else {
        const isMyMessage = (data.username === myName);
        div.className = `message ${isMyMessage ? 'my-message' : 'other-message'}`;
        div.innerHTML = `
            <div class="message-header">
                <span class="message-name" style="color: ${getUserColor(data.username)}">${escapeHtml(data.username)}</span>
                <span class="message-time">${data.time || getCurrentTime()}</span>
            </div>
            <div class="message-bubble">${escapeHtml(data.message)}</div>
        `;
    }
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function clearChat() {
    document.getElementById('messages').innerHTML = '';
    chatHistory = [];
    addNotification('Chat cleared', 'info');
}

function exportChat() {
    if (chatHistory.length === 0) {
        addNotification('No chat history to export', 'warning', true);
        return;
    }
    
    const chatText = chatHistory.map(msg => 
        `[${msg.time}] ${msg.username}: ${msg.message}`
    ).join('\n');
    
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${myName}_${getCurrentTime()}.txt`;
    a.click();
    
    addNotification('Chat exported successfully', 'success');
}

// ===== User List Functions =====
function updateUsers(users) {
    const container = document.getElementById('userList');
    const otherUsers = users.filter(u => u !== myName);
    updateGameRoomPlayers(otherUsers.length);
    
    if (otherUsers.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">No other users online</div>';
        return;
    }
    
    container.innerHTML = otherUsers.map(user => {
        const safeId = user.replace(/[^a-z0-9]/gi,'_');
        return `
        <div class="user-item" style="flex-wrap:wrap; gap:4px;">
            <div class="user-item-name" style="cursor:pointer;" onclick="viewProfile('${user}')">
                <span class="user-item-status"></span>
                <span style="color: ${getUserColor(user)}">${escapeHtml(user)}</span>
            </div>
            <div class="user-item-meta" style="font-size:11px; color:#aaa; margin:4px 0;">
                Followers: <span id="followersCount_${safeId}" class="followers-badge" title="...">...</span>
            </div>
            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                <button class="call-btn" onclick="window.makeCall('${user}', '${user}')" title="Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="call-btn" onclick="openGiftModal('${user}')" title="Send Gift"
                    style="background:#d4a017; font-size:11px; padding:4px 8px;">
                    🎁
                </button>
                <button class="call-btn follow-btn-${safeId}"
                    style="background:#667eea; font-size:11px; padding:4px 8px;"
                    onclick="">Follow</button>
            </div>
        </div>
    `;
    }).join('');
    
    // Check follow status for each user
    otherUsers.forEach(user => {
        const btn = container.querySelector('.follow-btn-' + user.replace(/[^a-z0-9]/gi,'_'));
        if (btn) checkFollowStatus(user, btn);
    });
}

function createSafeId(username) {
    return username.replace(/[^a-z0-9]/gi,'_');
}

async function updateUserFollowerCount(username, count) {
    const id = `followersCount_${createSafeId(username)}`;
    const el = document.getElementById(id);
    if (el) {
        el.textContent = count;
        el.title = `${count} follower${count === 1 ? '' : 's'}`;
        el.setAttribute('aria-label', `${count} followers`);
    }
}

function renderRecentCalls() {
    const container = document.getElementById('recentCalls');
    
    if (recentCalls.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">No recent calls</div>';
        return;
    }
    
    container.innerHTML = recentCalls.slice(0, 10).map(call => `
        <div class="user-item">
            <div class="user-item-name">
                <span>${escapeHtml(call.user)}</span>
                <span style="color: #999; font-size: 11px;">${call.time}</span>
            </div>
            <button class="call-btn" onclick="window.makeCall('${call.user}', '${call.user}')">
                <i class="fas fa-phone"></i>
            </button>
        </div>
    `).join('');
}

function renderFavorites() {
    const container = document.getElementById('favoritesList');
    
    if (favorites.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">No favorites</div>';
        return;
    }
    
    container.innerHTML = favorites.map(user => `
        <div class="user-item">
            <div class="user-item-name">
                <span style="color: ${getUserColor(user)}">${escapeHtml(user)}</span>
            </div>
            <button class="call-btn" onclick="window.makeCall('${user}', '${user}')">
                <i class="fas fa-star"></i>
            </button>
        </div>
    `).join('');
}

function showAddFavorite() {
    const userName = prompt('Enter username to add as favorite:');
    if (userName && !favorites.includes(userName)) {
        favorites.push(userName);
        renderFavorites();
        addNotification(`${userName} added to favorites`, 'success');
    } else if (favorites.includes(userName)) {
        addNotification(`${userName} is already in favorites`, 'warning');
    }
}

// ===== Emoji Functions =====
function sendEmoji() {
    const emojiPicker = document.getElementById('emojiPicker');
    emojiPicker.classList.toggle('active');
    
    if (emojiPicker.classList.contains('active')) {
        renderEmojiPicker();
    }
}

function renderEmojiPicker() {
    const grid = document.querySelector('.emoji-grid');
    grid.innerHTML = emojis.map(emoji => `
        <div class="emoji-item" onclick="selectEmoji('${emoji}')">${emoji}</div>
    `).join('');
}

function selectEmoji(emoji) {
    const input = document.getElementById('messageInput');
    input.value += emoji;
    input.focus();
    document.getElementById('emojiPicker').classList.remove('active');
}

// ===== File Upload Functions =====
function attachFile() {
    document.getElementById('fileModal').classList.add('active');
}

function closeFileModal() {
    document.getElementById('fileModal').classList.remove('active');
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').innerHTML = '';
}

function handleFileUpload() {
    const file = document.getElementById('fileInput').files[0];
    if (file) {
        document.getElementById('filePreview').innerHTML = `
            <div style="padding: 15px; background: #f0f0f0; border-radius: 8px;">
                <strong>${file.name}</strong><br>
                <small>${file.size} bytes</small>
            </div>
        `;
    }
}

function uploadFile() {
    const file = document.getElementById('fileInput').files[0];
    if (file) {
        socket.emit('send_file', { file: file.name });
        addNotification(`File ${file.name} uploaded`, 'success');
        closeFileModal();
    }
}

// ===== Live Stream Functions =====
function startLiveStream() {
    window.location.href = 'livestream.html';
}

// ===== Snake Game Functions =====
let snakeGameState = {
    active: false,
    running: false,
    intervalId: null,
    direction: 'right',
    nextDirection: 'right',
    score: 0,
    snake: [],
    food: null,
    speed: 120,
    cellSize: 20,
    cols: 24,
    rows: 18,
    canvas: null,
    ctx: null
};

function openSnakeGame() {
    document.getElementById('gameModal').classList.add('active');
    if (!snakeGameState.canvas) {
        snakeGameState.canvas = document.getElementById('snakeCanvas');
        snakeGameState.ctx = snakeGameState.canvas.getContext('2d');
        resetSnakeGame();
    }
    snakeGameState.active = true;
    updateSnakeStatus('Ready');
    window.addEventListener('keydown', handleSnakeKey);
}

function closeSnakeGame() {
    document.getElementById('gameModal').classList.remove('active');
    snakeGameState.active = false;
    pauseSnakeGame();
    window.removeEventListener('keydown', handleSnakeKey);
}

function startSnakeGame() {
    if (!snakeGameState.active) openSnakeGame();
    if (snakeGameState.running) return;
    snakeGameState.running = true;
    updateSnakeStatus('Playing');
    snakeGameState.intervalId = setInterval(() => gameTick(), snakeGameState.speed);
}

function pauseSnakeGame() {
    if (!snakeGameState.running) return;
    snakeGameState.running = false;
    clearInterval(snakeGameState.intervalId);
    snakeGameState.intervalId = null;
    updateSnakeStatus('Paused');
}

function resetSnakeGame() {
    snakeGameState.direction = 'right';
    snakeGameState.nextDirection = 'right';
    snakeGameState.score = 0;
    snakeGameState.running = false;
    clearInterval(snakeGameState.intervalId);
    snakeGameState.intervalId = null;
    snakeGameState.snake = [
        { x: 6, y: 9 },
        { x: 5, y: 9 },
        { x: 4, y: 9 }
    ];
    snakeGameState.food = placeFood();
    drawSnakeGame();
    updateSnakeScore();
    updateSnakeStatus('Ready');
}

function placeFood() {
    const positions = [];
    for (let x = 0; x < snakeGameState.cols; x++) {
        for (let y = 0; y < snakeGameState.rows; y++) {
            const occupied = snakeGameState.snake.some(segment => segment.x === x && segment.y === y);
            if (!occupied) positions.push({ x, y });
        }
    }
    return positions[Math.floor(Math.random() * positions.length)];
}

function gameTick() {
    snakeGameState.direction = snakeGameState.nextDirection;
    const head = { ...snakeGameState.snake[0] };
    if (snakeGameState.direction === 'right') head.x++;
    if (snakeGameState.direction === 'left') head.x--;
    if (snakeGameState.direction === 'up') head.y--;
    if (snakeGameState.direction === 'down') head.y++;

    if (head.x < 0 || head.x >= snakeGameState.cols || head.y < 0 || head.y >= snakeGameState.rows) {
        endSnakeGame();
        return;
    }

    const collision = snakeGameState.snake.some(segment => segment.x === head.x && segment.y === head.y);
    if (collision) {
        endSnakeGame();
        return;
    }

    snakeGameState.snake.unshift(head);
    if (head.x === snakeGameState.food.x && head.y === snakeGameState.food.y) {
        snakeGameState.score += 10;
        snakeGameState.food = placeFood();
        updateSnakeScore();
    } else {
        snakeGameState.snake.pop();
    }

    drawSnakeGame();
}

function endSnakeGame() {
    pauseSnakeGame();
    updateSnakeStatus('Game Over');
    addNotification(`Snake game finished. Score: ${snakeGameState.score}`, 'info');
}

function drawSnakeGame() {
    const ctx = snakeGameState.ctx;
    const size = snakeGameState.cellSize;
    ctx.clearRect(0, 0, snakeGameState.canvas.width, snakeGameState.canvas.height);
    ctx.fillStyle = '#08101f';
    ctx.fillRect(0, 0, snakeGameState.canvas.width, snakeGameState.canvas.height);

    ctx.fillStyle = '#ffcd38';
    snakeGameState.snake.forEach((segment, index) => {
        ctx.fillStyle = index === 0 ? '#ffffff' : '#7c9eff';
        ctx.fillRect(segment.x * size, segment.y * size, size - 2, size - 2);
    });

    if (snakeGameState.food) {
        ctx.fillStyle = '#e53e3e';
        ctx.fillRect(snakeGameState.food.x * size, snakeGameState.food.y * size, size - 2, size - 2);
    }
}

function updateSnakeScore() {
    document.getElementById('snakeScore').textContent = snakeGameState.score;
}

function updateSnakeStatus(status) {
    document.getElementById('snakeStatus').textContent = status;
}

function handleSnakeKey(event) {
    if (!snakeGameState.active) return;
    const key = event.key;
    if (key === 'ArrowUp' && snakeGameState.direction !== 'down') snakeGameState.nextDirection = 'up';
    if (key === 'ArrowDown' && snakeGameState.direction !== 'up') snakeGameState.nextDirection = 'down';
    if (key === 'ArrowLeft' && snakeGameState.direction !== 'right') snakeGameState.nextDirection = 'left';
    if (key === 'ArrowRight' && snakeGameState.direction !== 'left') snakeGameState.nextDirection = 'right';
    if (key.toLowerCase() === 'p') pauseSnakeGame();
}

function joinGameRoom() {
    showDashboardPanel('chat');
    updateStatus('🎮 Joined the Snake Arena');
    addNotification('Snake Arena is live — use chat, stream, or video call to connect with your team.', 'success');
}

function updateGameRoomPlayers(otherPlayerCount) {
    const countEl = document.getElementById('gamePlayersCount');
    if (!countEl) return;
    const currentCount = Math.min(4, Math.max(1, otherPlayerCount + 1));
    countEl.textContent = `${currentCount}/4`;
}

function createGroupChat() {
    addNotification('Group chat feature - Coming soon!', 'info');
    // Implement group chat logic here
}

// ===== Status Functions =====
function updateStatus(msg) {
    document.getElementById('statusText').textContent = msg;
}

// ===== Event Listeners =====
const msgInput = document.getElementById('messageInput');

// Typing indicator
let typingTimeout;
msgInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 1000);
});

msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

const supportToggleBtn = document.getElementById('supportToggleBtn');
const supportCloseBtn = document.getElementById('supportCloseBtn');
const supportSendBtn = document.getElementById('supportSendBtn');
const supportInput = document.getElementById('supportInput');

if (supportToggleBtn) {
    supportToggleBtn.addEventListener('click', toggleSupportPanel);
}
if (supportCloseBtn) {
    supportCloseBtn.addEventListener('click', closeSupportPanel);
}
if (supportSendBtn) {
    supportSendBtn.addEventListener('click', sendSupportMessage);
}
if (supportInput) {
    supportInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendSupportMessage();
        }
    });
}

// Socket events
socket.on('user_typing', (data) => {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.innerHTML = data.isTyping ? `✏️ ${data.username} is typing...` : '';
});

socket.on('incoming_call', (data) => {
    addNotification(`${data.from} is calling you!`, 'important', true);
    
    if (confirm(`📞 ${data.from} is calling you. Accept?`)) {
        socket.emit('accept_call', { fromId: data.fromId });
        addNotification(`Call accepted with ${data.from}`, 'success');
    } else {
        socket.emit('reject_call', { fromId: data.fromId });
        addNotification(`Call rejected from ${data.from}`, 'warning');
    }
});

socket.on('call_accepted', (data) => {
    updateStatus(`✅ Call accepted with ${data.from}`);
    addNotification(`Call accepted with ${data.from}`, 'success');
});

socket.on('call_rejected', () => {
    updateStatus('❌ Call rejected');
    addNotification('Call rejected', 'warning');
});

socket.on('call_ended', () => {
    updateStatus('Call ended by other user');
    addNotification('Call ended by other user', 'info');
    endCall();
});

socket.on('chat_message', (data) => {
    addMessage(data);
    addNotification(`New message from ${data.username}`, 'info');
});

socket.on('user_list', updateUsers);
socket.on('user_join', (user) => {
    addNotification(`${user} joined the chat`, 'success');
});

socket.on('user_leave', (user) => {
    addNotification(`${user} left the chat`, 'info');
});

// ===== Initialization =====
socket.emit('user_join', myName);

document.getElementById('statusText').textContent = `✅ Connected as ${myName}`;
updateStatus(`✅ Connected as ${myName}`);

addNotification(`Welcome to TM Live! You're connected as ${myName}`, 'success');

// Update user list initially
socket.emit('get_user_list');

// Render initial components
renderRecentCalls();
renderFavorites();

console.log('TM Live initialized successfully!');
function startNewCall() {
    const target = prompt('Enter username to call:');
    if (target) window.makeCall(target, target);
}

function logout() {
    localStorage.removeItem('tm_token');
    localStorage.removeItem('tm_username');
    socket.disconnect();
    window.location.href = 'login.html';
}
// ===== Follow System =====
const tmToken = localStorage.getItem('tm_token');

async function followUser(username, btn) {
    try {
        const res = await fetch(`https://tm-live-backend.onrender.com/api/auth/follow/${username}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tmToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            btn.textContent = 'Unfollow';
            btn.style.background = '#e53e3e';
            btn.onclick = () => unfollowUser(username, btn);
            if (typeof data.followersCount !== 'undefined') {
                updateUserFollowerCount(username, data.followersCount);
            }
            addNotification(`You are now following ${username}`, 'success');
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Could not follow user');
    }
}

async function unfollowUser(username, btn) {
    try {
        const res = await fetch(`https://tm-live-backend.onrender.com/api/auth/unfollow/${username}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tmToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            btn.textContent = 'Follow';
            btn.style.background = '#667eea';
            btn.onclick = () => followUser(username, btn);
            if (typeof data.followersCount !== 'undefined') {
                updateUserFollowerCount(username, data.followersCount);
            }
            addNotification(`You unfollowed ${username}`, 'info');
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Could not unfollow user');
    }
}

async function checkFollowStatus(username, btn) {
    try {
        const res = await fetch(`https://tm-live-backend.onrender.com/api/auth/profile/${username}`, {
            headers: { 'Authorization': `Bearer ${tmToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            if (typeof data.followersCount !== 'undefined') {
                updateUserFollowerCount(username, data.followersCount);
            }
            if (data.isFollowing) {
                btn.textContent = 'Unfollow';
                btn.style.background = '#e53e3e';
                btn.onclick = () => unfollowUser(username, btn);
            } else {
                btn.textContent = 'Follow';
                btn.style.background = '#667eea';
                btn.onclick = () => followUser(username, btn);
            }
        }
    } catch (err) {}
}

function viewProfile(username) {
    window.location.href = `profile.html?user=${username}`;
}

// ===== Gift System =====
const GIFTS = [
    { name: 'Rose',      emoji: '🌹', diamonds: 10  },
    { name: 'Heart',     emoji: '❤️',  diamonds: 20  },
    { name: 'Star',      emoji: '⭐',  diamonds: 50  },
    { name: 'Crown',     emoji: '👑',  diamonds: 100 },
    { name: 'Diamond',   emoji: '💎',  diamonds: 200 },
    { name: 'Rocket',    emoji: '🚀',  diamonds: 500 },
];

let selectedGift = null;
let giftTargetUsername = null;

function openGiftModal(username) {
    giftTargetUsername = username;
    document.getElementById('giftTargetName').textContent = username;
    document.getElementById('giftAlert').style.display = 'none';
    selectedGift = null;

    const grid = document.getElementById('giftGrid');
    grid.innerHTML = GIFTS.map((g, i) => `
        <div id="gift_${i}" onclick="selectGift(${i})" style="
            background:#0f0f1a; border-radius:12px; padding:14px; text-align:center;
            cursor:pointer; border:2px solid transparent; transition:all 0.2s;">
            <div style="font-size:28px;">${g.emoji}</div>
            <div style="font-size:12px; color:#ccc; margin-top:6px;">${g.name}</div>
            <div style="font-size:11px; color:#667eea; margin-top:2px;">${g.diamonds} 💎</div>
        </div>
    `).join('');

    const modal = document.getElementById('giftModal');
    modal.style.display = 'flex';
}

function selectGift(index) {
    selectedGift = GIFTS[index];
    document.querySelectorAll('[id^="gift_"]').forEach(el => {
        el.style.borderColor = 'transparent';
        el.style.background = '#0f0f1a';
    });
    const el = document.getElementById('gift_' + index);
    el.style.borderColor = '#667eea';
    el.style.background = 'rgba(102,126,234,0.15)';
}

function closeGiftModal() {
    document.getElementById('giftModal').style.display = 'none';
    selectedGift = null;
    giftTargetUsername = null;
}

async function confirmGift() {
    if (!selectedGift) {
        showGiftAlert('Please select a gift first', 'error');
        return;
    }
    try {
        const res = await fetch('https://tm-live-backend.onrender.com/api/auth/send-gift', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tmToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                toUsername: giftTargetUsername,
                giftName: selectedGift.name,
                giftEmoji: selectedGift.emoji,
                diamonds: selectedGift.diamonds
            })
        });
        const data = await res.json();
        if (res.ok) {
            // Notify everyone via socket
            socket.emit('gift_sent', {
                fromUser: myName,
                toUser: giftTargetUsername,
                giftName: selectedGift.name,
                giftEmoji: selectedGift.emoji,
                diamonds: selectedGift.diamonds
            });
            showGiftAlert(`🎉 Gift sent!`, 'success');
            setTimeout(closeGiftModal, 1500);
        } else {
            showGiftAlert(data.message, 'error');
        }
    } catch (err) {
        showGiftAlert('Could not send gift', 'error');
    }
}

function showGiftAlert(msg, type) {
    const el = document.getElementById('giftAlert');
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = type === 'success' ? 'rgba(56,161,105,0.2)' : 'rgba(229,62,62,0.2)';
    el.style.color = type === 'success' ? '#38a169' : '#e53e3e';
    el.style.border = `1px solid ${type === 'success' ? '#38a169' : '#e53e3e'}`;
}

// Show gift notification in chat when someone sends a gift
socket.on('gift_received', (data) => {
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.style.cssText = 'text-align:center; padding:10px; margin:8px 0; background:rgba(102,126,234,0.1); border-radius:10px; font-size:14px; border:1px solid rgba(102,126,234,0.3);';
    div.innerHTML = `${data.giftEmoji} <strong>${data.fromUser}</strong> sent <strong>${data.giftName}</strong> to <strong>${data.toUser}</strong> · ${data.diamonds} 💎`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
});
