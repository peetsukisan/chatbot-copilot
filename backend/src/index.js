require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const webhookRoutes = require('./api/routes/webhook');
const adminRoutes = require('./api/routes/admin');
const customerRoutes = require('./api/routes/customer');
const chatRoutes = require('./api/routes/chat');
const reportRoutes = require('./api/routes/report');

const { initDatabase } = require('./models/database');
const { initVectorDB } = require('./services/vector/pinecone');
const { setupScheduledJobs } = require('./jobs/scheduler');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// Socket.io for real-time admin dashboard
const io = new Server(server, {
    cors: {
        origin: process.env.ADMIN_CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
    }
});

// Make io available to routes
app.set('io', io);

// Middleware
app.use(express.json());
app.use(cors({
    origin: process.env.ADMIN_CORS_ORIGIN || '*'
}));

// Routes
app.use('/webhook', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    logger.info(`Admin connected: ${socket.id}`);

    socket.on('join-admin', () => {
        socket.join('admin-room');
        logger.info(`Socket ${socket.id} joined admin room`);
    });

    socket.on('disconnect', () => {
        logger.info(`Admin disconnected: ${socket.id}`);
    });
});

// Initialize and start server
async function startServer() {
    try {
        // Initialize SQLite database
        await initDatabase();
        logger.info('Database initialized');

        // Initialize Pinecone vector database (cloud)
        await initVectorDB();
        logger.info('Pinecone vector database initialized');

        // Setup scheduled jobs (wake-up campaigns, daily reports, etc.)
        setupScheduledJobs(io);
        logger.info('Scheduled jobs initialized');

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            logger.info(`🚀 Server running on port ${PORT}`);
            logger.info(`📱 Webhook URL: http://localhost:${PORT}/webhook`);
            logger.info(`🔧 Admin API: http://localhost:${PORT}/api/admin`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = { app, io };
