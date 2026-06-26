const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// User Model
const UserSchema = new mongoose.Schema({
    username:  { type: String, required: true, unique: true },
    email:     { type: String, required: true, unique: true },
    password:  { type: String, required: true },
    bio:       { type: String, default: '' },
    profilePicture: { type: String, default: '' },
    diamonds:  { type: Number, default: 0 },
    isAdmin:   { type: Boolean, default: false },
    banned:    { type: Boolean, default: false },
    totalEarned: { type: Number, default: 0 },
    pendingPayout: { type: Number, default: 0 },
    paidOut:   { type: Number, default: 0 },
    bankName:  { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountName: { type: String, default: '' },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// Payout Request Model
const PayoutSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username:  String,
    amount:    Number,
    diamonds:  Number,
    bankName:  String,
    accountNumber: String,
    accountName: String,
    status:    { type: String, default: 'pending' },
    requestedAt: { type: Date, default: Date.now }
});
const Payout = mongoose.model('Payout', PayoutSchema);

// Gift Transaction Model
const GiftSchema = new mongoose.Schema({
    fromUser:   String,
    toUser:     String,
    giftName:   String,
    giftEmoji:  String,
    diamonds:   Number,
    createdAt:  { type: Date, default: Date.now }
});
const Gift = mongoose.model('Gift', GiftSchema);

// Auth Middleware
async function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.id);
        if (!user) return res.status(401).json({ message: 'Invalid token' });
        if (user.banned) return res.status(403).json({ message: 'Account banned' });
        req.user = payload;
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

// SIGN UP
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ message: 'Email already registered' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashed });
        await user.save();
        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid email or password' });
        if (user.banned) return res.status(403).json({ message: 'Account banned' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Invalid email or password' });
        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET PROFILE
router.get('/profile/:username', authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username })
            .select('-password')
            .populate('followers', 'username')
            .populate('following', 'username');
        if (!user) return res.status(404).json({ message: 'User not found' });
        const isFollowing = user.followers.some(f => f._id.toString() === req.user.id);
        res.json({
            username: user.username,
            bio: user.bio,
            profilePicture: user.profilePicture,
            diamonds: user.diamonds,
            totalEarned: user.totalEarned,
            followersCount: user.followers.length,
            followingCount: user.following.length,
            isFollowing,
            isOwnProfile: user._id.toString() === req.user.id
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// FOLLOW
router.post('/follow/:username', authMiddleware, async (req, res) => {
    try {
        const targetUser = await User.findOne({ username: req.params.username });
        const currentUser = await User.findById(req.user.id);
        if (!targetUser) return res.status(404).json({ message: 'User not found' });
        const alreadyFollowing = currentUser.following.includes(targetUser._id);
        if (alreadyFollowing) return res.status(400).json({ message: 'Already following' });
        currentUser.following.push(targetUser._id);
        targetUser.followers.push(currentUser._id);
        await currentUser.save();
        await targetUser.save();
        res.json({ message: 'Followed successfully', followersCount: targetUser.followers.length });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// UNFOLLOW
router.post('/unfollow/:username', authMiddleware, async (req, res) => {
    try {
        const targetUser = await User.findOne({ username: req.params.username });
        const currentUser = await User.findById(req.user.id);
        if (!targetUser) return res.status(404).json({ message: 'User not found' });
        currentUser.following = currentUser.following.filter(id => id.toString() !== targetUser._id.toString());
        targetUser.followers = targetUser.followers.filter(id => id.toString() !== currentUser._id.toString());
        await currentUser.save();
        await targetUser.save();
        res.json({ message: 'Unfollowed successfully', followersCount: targetUser.followers.length });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// UPDATE BIO
router.post('/update-bio', authMiddleware, async (req, res) => {
    try {
        const { bio } = req.body;
        await User.findByIdAndUpdate(req.user.id, { bio });
        res.json({ message: 'Bio updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// UPDATE PROFILE (bio + picture)
router.post('/update-profile', authMiddleware, async (req, res) => {
    try {
        const { bio, profilePicture } = req.body;
        const update = {};
        if (typeof bio === 'string') update.bio = bio;
        if (typeof profilePicture === 'string') update.profilePicture = profilePicture;
        const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
        res.json({
            message: 'Profile updated',
            bio: user.bio,
            profilePicture: user.profilePicture
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// SEND GIFT
router.post('/send-gift', authMiddleware, async (req, res) => {
    try {
        const { toUsername, giftName, giftEmoji, diamonds } = req.body;
        const sender = await User.findById(req.user.id);
        const receiver = await User.findOne({ username: toUsername });
        if (!receiver) return res.status(404).json({ message: 'User not found' });
        if (sender.username === toUsername) return res.status(400).json({ message: 'Cannot gift yourself' });

        // Record the gift
        await Gift.create({
            fromUser: sender.username,
            toUser: toUsername,
            giftName, giftEmoji, diamonds
        });

        // Add diamonds to receiver
        receiver.diamonds += diamonds;
        receiver.totalEarned += diamonds;
        await receiver.save();

        res.json({
            message: 'Gift sent!',
            receiverDiamonds: receiver.diamonds
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET MY EARNINGS
router.get('/earnings', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const recentGifts = await Gift.find({ toUser: user.username })
            .sort({ createdAt: -1 }).limit(10);
        const dollarsAvailable = (user.diamonds * 0.01).toFixed(2);
        res.json({
            diamonds: user.diamonds,
            dollarsAvailable,
            totalEarned: user.totalEarned,
            pendingPayout: user.pendingPayout,
            paidOut: user.paidOut,
            recentGifts
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// REQUEST PAYOUT
router.post('/request-payout', authMiddleware, async (req, res) => {
    try {
        const { bankName, accountNumber, accountName } = req.body;
        const user = await User.findById(req.user.id);
        const dollarsAvailable = user.diamonds * 0.01;

        if (dollarsAvailable < 20) {
            return res.status(400).json({ message: `Minimum $20 needed. You have $${dollarsAvailable.toFixed(2)}` });
        }

        // Save bank details
        user.bankName = bankName;
        user.accountNumber = accountNumber;
        user.accountName = accountName;
        user.pendingPayout += dollarsAvailable;
        user.diamonds = 0;
        await user.save();

        await Payout.create({
            userId: user._id,
            username: user.username,
            amount: dollarsAvailable,
            diamonds: user.diamonds,
            bankName, accountNumber, accountName
        });

        res.json({ message: 'Payout request submitted! Admin will process within 3-5 business days.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = { router, User };
