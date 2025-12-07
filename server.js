const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS responses (
                id SERIAL PRIMARY KEY,
                answer VARCHAR(10),
                device TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS photos (
                id SERIAL PRIMARY KEY,
                filename TEXT,
                original_name TEXT,
                path TEXT,
                size INTEGER,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Database tables initialized');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

initDatabase();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.post('/api/save-answer', async (req, res) => {
    const { answer, device } = req.body;
    
    try {
        const result = await pool.query(
            'INSERT INTO responses (answer, device) VALUES ($1, $2) RETURNING *',
            [answer, device || 'unknown']
        );
        
        console.log('Sweetbyte answered:', answer, 'at', new Date().toISOString());
        
        res.json({
            success: true,
            message: 'Answer saved!',
            data: result.rows[0]
        });
    } catch (err) {
        console.error('Error saving answer:', err);
        res.status(500).json({ error: 'Failed to save answer' });
    }
});

app.post('/api/upload-photo', upload.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    try {
        const result = await pool.query(
            'INSERT INTO photos (filename, original_name, path, size) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.file.filename, req.file.originalname, `/uploads/${req.file.filename}`, req.file.size]
        );
        
        res.json({
            success: true,
            message: 'Photo uploaded successfully',
            photo: result.rows[0]
        });
    } catch (err) {
        console.error('Error saving photo:', err);
        res.status(500).json({ error: 'Failed to save photo' });
    }
});

app.get('/api/get-photos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM photos ORDER BY timestamp DESC');
        res.json({
            success: true,
            photos: result.rows
        });
    } catch (err) {
        console.error('Error getting photos:', err);
        res.status(500).json({ error: 'Failed to get photos' });
    }
});

app.post('/api/check-response', async (req, res) => {
    const { adminKey } = req.body;
    
    if (adminKey !== 'Sweetbyte2024') {
        return res.status(401).json({ error: 'Invalid admin key' });
    }
    
    try {
        const responseResult = await pool.query('SELECT * FROM responses ORDER BY timestamp DESC LIMIT 1');
        const photoResult = await pool.query('SELECT COUNT(*) as count FROM photos');
        
        const hasAnswered = responseResult.rows.length > 0;
        
        res.json({
            success: true,
            hasAnswered: hasAnswered,
            response: hasAnswered ? responseResult.rows[0] : null,
            photoCount: parseInt(photoResult.rows[0].count)
        });
    } catch (err) {
        console.error('Error checking response:', err);
        res.status(500).json({ error: 'Failed to check response' });
    }
});

app.post('/api/delete-responses', async (req, res) => {
    const { adminKey } = req.body;
    
    if (adminKey !== 'Sweetbyte2024') {
        return res.status(401).json({ error: 'Invalid admin key' });
    }
    
    try {
        await pool.query('DELETE FROM responses');
        console.log('All responses deleted by admin');
        
        res.json({
            success: true,
            message: 'All responses deleted'
        });
    } catch (err) {
        console.error('Error deleting responses:', err);
        res.status(500).json({ error: 'Failed to delete responses' });
    }
});

app.post('/api/admin-get-photos', async (req, res) => {
    const { adminKey } = req.body;
    
    if (adminKey !== 'Sweetbyte2024') {
        return res.status(401).json({ error: 'Invalid admin key' });
    }
    
    try {
        const result = await pool.query('SELECT * FROM photos ORDER BY timestamp DESC');
        res.json({
            success: true,
            photos: result.rows
        });
    } catch (err) {
        console.error('Error getting photos:', err);
        res.status(500).json({ error: 'Failed to get photos' });
    }
});

app.get('/api/response-status', async (req, res) => {
    try {
        const responseResult = await pool.query('SELECT * FROM responses ORDER BY timestamp DESC LIMIT 1');
        const photoResult = await pool.query('SELECT COUNT(*) as count FROM photos');
        
        const hasAnswered = responseResult.rows.length > 0;
        const latestResponse = hasAnswered ? responseResult.rows[0] : null;
        
        res.json({
            hasAnswered: hasAnswered,
            answer: latestResponse ? latestResponse.answer : null,
            timestamp: latestResponse ? latestResponse.timestamp : null,
            photoCount: parseInt(photoResult.rows[0].count)
        });
    } catch (err) {
        console.error('Error getting status:', err);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎂 Server running on port ${PORT}`);
    console.log(`📱 Admin panel: http://localhost:${PORT}?admin=true`);
    console.log(`💖 Sweetbyte link: http://localhost:${PORT}?view=sweetbyte`);
});
