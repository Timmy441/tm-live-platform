require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { router: authRouter, User } = require('./auth');
const adminRouter = require('./admin');

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5001').split(',').map(s => s.trim());
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  message: 'Too many authentication attempts, please try again later.'
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many admin requests, please slow down.'
});

app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(express.json());
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/admin', adminLimiter, adminRouter);
app.use('/api', apiLimiter);

app.post('/api/chatbot', (req, res) => {
  const userMessage = String(req.body?.message || '').trim();
  if (!userMessage) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const text = userMessage.toLowerCase();
  let answer = 'Thanks for your question! I am available 24/7 and can help with account setup, streaming, gifts, payouts, and platform rules.';

  const helpMap = [
    { match: /pricing|cost|price|subscription/, reply: 'TM Live currently offers a free core experience. Premium tools and upgrades will be available soon. Contact support if you need enterprise billing details.' },
    { match: /sign ?up|register|create account/, reply: 'To sign up, navigate to the registration page and enter your desired username, email address, and password. You can start streaming once your account is verified.' },
    { match: /live stream|go live|streaming|stream/, reply: 'To start streaming, click the Go Live button and allow camera/microphone access. Then invite viewers to your stream room or share the stream link.' },
    { match: /earnings|withdraw|payout|payment|diamonds/, reply: 'Earnings are shown in your dashboard. Diamonds convert to cash at the platform rate, and payout requests are typically processed within 3-5 business days.' },
    { match: /gift|send gift|gifted|gifts/, reply: 'Gifts can be sent during a live stream. Each gift adds diamonds to the recipient and creates a notification so creators know you supported them.' },
    { match: /ban|blocked|suspended/, reply: 'If an account is banned or suspended, please contact support directly using the email on the footer. Our team can review your account status.' },
    { match: /support|help|customer service|contact/, reply: 'I am here 24/7. You can also reach real support at support@tmlive.com or WhatsApp via the contact button in the footer.' },
    { match: /technical|error|bug|issue/, reply: 'For technical issues, try refreshing the page first. If the problem persists, send us a screenshot or describe the error and support will respond quickly.' }
  ];

  for (const item of helpMap) {
    if (item.match.test(text)) {
      answer = item.reply;
      break;
    }
  }

  res.json({ answer });
});

app.use(express.static(path.join(__dirname, '../frontend/public')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

const io = new Server(httpServer, { cors: corsOptions });
const users = {};
const waitingCalls = {};
const liveStreams = {}; // { streamerId: { username, viewers: [], startTime, roomId } }

const adminNamespace = io.of('/admin');
adminNamespace.use(async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const secret = process.env.JWT_SECRET;
    const payload = require('jsonwebtoken').verify(token, secret);
    const user = await User.findById(payload.id);
    if (!user || !user.isAdmin) return next(new Error('Admin access required'));
    socket.adminUser = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

adminNamespace.on('connection', (socket) => {
  const stats = {
    activeUsers: Object.keys(users).length,
    liveStreams: Object.values(liveStreams).map(stream => ({
      streamer: stream.username,
      viewers: stream.viewerCount,
      roomId: stream.roomId,
      startedAt: stream.startTime
    }))
  };
  socket.emit('admin_init', stats);
});

function emitAdminUpdate(event, payload) {
  adminNamespace.emit('admin_event', { event, payload, time: new Date().toISOString() });
  if (event === 'user_join' || event === 'user_leave') {
    adminNamespace.emit('admin_user_count', { count: Object.keys(users).length });
  }
  if (event === 'stream_started' || event === 'stream_finished' || event === 'viewer_joined' || event === 'viewer_left') {
    adminNamespace.emit('admin_streams', {
      streams: Object.values(liveStreams).map(stream => ({
        streamer: stream.username,
        viewers: stream.viewerCount,
        roomId: stream.roomId,
        startedAt: stream.startTime
      }))
    });
  }
}

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  socket.on('user_join', (username) => {
    users[socket.id] = { username, room: 'general' };
    io.emit('user_list', Object.values(users).map(u => u.username));
    io.emit('chat_message', {
      username: 'System',
      message: `${username} joined the chat`,
      time: new Date().toLocaleTimeString()
    });
    emitAdminUpdate('user_join', { username });
  });

  socket.on('typing', (isTyping) => {
    const user = users[socket.id];
    if (user) socket.broadcast.emit('user_typing', { username: user.username, isTyping });
  });

  // Gift notification
  socket.on('gift_sent', (data) => {
    io.emit('gift_received', {
      fromUser: data.fromUser,
      toUser: data.toUser,
      giftName: data.giftName,
      giftEmoji: data.giftEmoji,
      diamonds: data.diamonds
    });
    // Also send to stream room if streamer is live
    if (data.streamRoom) {
      io.to(data.streamRoom).emit('stream_gift', data);
    }
  });

  // ===== LIVE STREAM EVENTS =====

  // Streamer starts live
  socket.on('start_stream', (data) => {
    const { username } = data;
    const roomId = `stream_${socket.id}`;
    socket.join(roomId);
    liveStreams[socket.id] = {
      streamerId: socket.id,
      username,
      roomId,
      viewerCount: 0,
      startTime: new Date().toISOString()
    };
    // Notify everyone someone is live
    io.emit('stream_started', {
      streamerId: socket.id,
      username,
      roomId
    });
    emitAdminUpdate('stream_started', { streamer: username, roomId });
    console.log(`🔴 ${username} went live`);
  });

  // Viewer joins stream
  socket.on('join_stream', (data) => {
    const { roomId, username } = data;
    socket.join(roomId);
    const stream = Object.values(liveStreams).find(s => s.roomId === roomId);
    if (stream) {
      stream.viewerCount++;
      io.to(stream.streamerId).emit('viewer_joined', { username, viewerCount: stream.viewerCount });
      socket.emit('stream_info', stream);
      io.to(roomId).emit('stream_comment', {
        username: 'System',
        message: `${username} joined the stream`,
        time: new Date().toLocaleTimeString()
      });
      emitAdminUpdate('viewer_joined', { streamer: stream.username, username, viewerCount: stream.viewerCount });
    }
  });

  // Stream comment/chat
  socket.on('stream_comment', (data) => {
    io.to(data.roomId).emit('stream_comment', {
      username: data.username,
      message: data.message,
      time: new Date().toLocaleTimeString()
    });
  });

  // WebRTC offer from streamer to viewer
  socket.on('stream_offer', (data) => {
    io.to(data.viewerSocketId).emit('stream_offer', {
      offer: data.offer,
      streamerId: socket.id
    });
  });

  // WebRTC answer from viewer to streamer
  socket.on('stream_answer', (data) => {
    io.to(data.streamerId).emit('stream_answer', {
      answer: data.answer,
      viewerSocketId: socket.id
    });
  });

  // ICE candidates for stream
  socket.on('stream_ice', (data) => {
    io.to(data.target).emit('stream_ice', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // Streamer ends stream
  socket.on('end_stream', (data) => {
    const stream = liveStreams[socket.id];
    if (stream) {
      io.to(stream.roomId).emit('stream_ended', { username: stream.username });
      io.emit('stream_finished', { streamerId: socket.id, username: stream.username });
      emitAdminUpdate('stream_finished', { streamer: stream.username, roomId: stream.roomId });
      delete liveStreams[socket.id];
      console.log(`⚫ ${stream.username} ended stream`);
    }
  });

  // Video call signaling
  socket.on('call_user', (data) => {
    const targetSocket = Object.keys(users).find(key => users[key].username === data.target);
    if (targetSocket) {
      waitingCalls[targetSocket] = socket.id;
      io.to(targetSocket).emit('incoming_call', { from: users[socket.id].username, fromId: socket.id });
    }
  });

  socket.on('accept_call', (data) => {
    io.to(data.fromId).emit('call_accepted', { from: users[socket.id].username, fromId: socket.id });
  });

  socket.on('reject_call', (data) => {
    io.to(data.fromId).emit('call_rejected');
  });

  socket.on('offer', (data) => {
    io.to(data.target).emit('offer', { offer: data.offer, from: socket.id });
  });

  socket.on('answer', (data) => {
    io.to(data.target).emit('answer', { answer: data.answer, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    io.to(data.target).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
  });

  socket.on('end_call', (data) => {
    io.to(data.target).emit('call_ended');
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      if (liveStreams[socket.id]) {
        const stream = liveStreams[socket.id];
        io.to(stream.roomId).emit('stream_ended', { username: stream.username });
        io.emit('stream_finished', { streamerId: socket.id, username: stream.username });
        emitAdminUpdate('stream_finished', { streamer: stream.username, roomId: stream.roomId });
        delete liveStreams[socket.id];
      }
      delete users[socket.id];
      io.emit('user_list', Object.values(users).map(u => u.username));
      io.emit('chat_message', {
        username: 'System',
        message: `${user.username} left the chat`,
        time: new Date().toLocaleTimeString()
      });
      emitAdminUpdate('user_leave', { username: user.username });
    }
  });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err));

httpServer.listen(5001, () => {
  console.log('✅ Server on http://localhost:5001');
  console.log('✅ Video calling ready!');
  console.log('✅ Live streaming ready!');
});
