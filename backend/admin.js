const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('./auth');

// Simple Admin auth middleware: verifies token and checks isAdmin flag
async function authAdmin(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.id);
        if (!user) return res.status(401).json({ message: 'User not found' });
        if (!user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
        req.admin = user;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
}

// Audit Log model (simple)
const AuditLogSchema = new mongoose.Schema({
    type: String,
    actor: String,
    target: String,
    meta: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
});
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// GET /api/admin/users?page=&limit=&q=
router.get('/users', authAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const q = req.query.q ? { $or: [ { username: new RegExp(req.query.q, 'i') }, { email: new RegExp(req.query.q, 'i') } ] } : {};
        const total = await User.countDocuments(q);
        const users = await User.find(q).select('-password').skip((page-1)*limit).limit(limit).lean();
        res.json({ page, limit, total, users });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/admin/user/:id
router.get('/user/:id', authAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password').populate('followers', 'username').populate('following', 'username');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/user/:id/ban  { banned: true }
router.post('/user/:id/ban', authAdmin, async (req, res) => {
    try {
        const { banned } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { banned: !!banned }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await AuditLog.create({ type: 'ban', actor: req.admin.username, target: user.username, meta: { banned: user.banned } });
        res.json({ message: 'User updated', user });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/user/:id/make-admin { isAdmin: true }
router.post('/user/:id/make-admin', authAdmin, async (req, res) => {
    try {
        const { isAdmin } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { isAdmin: !!isAdmin }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await AuditLog.create({ type: 'admin-change', actor: req.admin.username, target: user.username, meta: { isAdmin: user.isAdmin } });
        res.json({ message: 'User updated', user });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/admin/audit?page=&limit=
router.get('/audit', authAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const total = await AuditLog.countDocuments();
        const logs = await AuditLog.find().sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean();
        res.json({ page, limit, total, logs });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
