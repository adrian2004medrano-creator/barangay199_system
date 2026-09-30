const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
let databaseImportInProgress = false;
app.use((req, res, next) => {
  if (databaseImportInProgress && req.path.startsWith('/api/')) {
    return res.status(503).json({ message: 'Database restore is in progress. Please try again shortly.' });
  }
  next();
});

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV is production.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to your Supabase Postgres connection string.');
}
const jwtSecret = process.env.JWT_SECRET || 'barangay199-local-development-secret-change-before-deployment';
const smtpUser = process.env.SMTP_USER;
const mailFrom = process.env.MAIL_FROM || smtpUser;
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpConfigured = Boolean(process.env.SMTP_PASS);
const mailTransporter = smtpConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: process.env.SMTP_PASS }
    })
  : null;

// --- Database (Supabase Postgres) -----------------------------------------
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

const requireAuth = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    req.auth = jwt.verify(token, jwtSecret);
    const { rows } = await db.query('SELECT id, role FROM users WHERE id = $1', [req.auth.id]);
    if (!rows.length) {
      return res.status(401).json({ message: 'User account no longer exists. Please sign in again.' });
    }
    req.auth.role = rows[0].role;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  }
};
const requireSuperadmin = (req, res, next) => {
  if (req.auth?.role !== 'superadmin') {
    return res.status(403).json({ message: 'Only a superadmin can manage user accounts.' });
  }
  next();
};
const requireRoles = (roles) => (req, res, next) => {
  if (!roles.includes(req.auth?.role)) {
    return res.status(403).json({ message: 'Your role is not allowed to access this resource.' });
  }
  next();
};
const officialRoles = ['superadmin', 'admin'];
const requireOfficial = requireRoles(officialRoles);
const requireBackupAccess = requireRoles(['superadmin', 'admin']);

const uploadDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const imageStorage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (req, file, callback) => {
    callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return callback(new Error('Only JPEG, PNG, WebP, and GIF images are allowed.'));
    }
    callback(null, true);
  }
});
const uploadResidentPhoto = (req, res, next) => {
  imageUpload.single('photo')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'The photo must be 5 MB or smaller.' : err.message;
      return res.status(400).json({ message });
    }
    next();
  });
};
app.use('/uploads', express.static(uploadDirectory));

const residentSelectColumns = 'id, photo, name, first_name, middle_initial, last_name, age, sex, civil_status, birthdate, birthplace, address, purok, contact_number, occupation, voter_status, household_no, date_registered, status, created_at';

// --- Database backups (pg_dump / psql against Supabase) --------------------
const databaseBackupDirectory = path.join(__dirname, 'backups');
const databaseSafetyBackupDirectory = path.join(databaseBackupDirectory, 'import-safety');
fs.mkdirSync(databaseBackupDirectory, { recursive: true });
fs.mkdirSync(databaseSafetyBackupDirectory, { recursive: true });
const backupFilenamePattern = /^barangay199-backup-\d{8}T\d{6}Z-[a-f0-9-]{36}\.sql$/;

const databaseBackupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 }
}).single('backup');
const uploadDatabaseBackup = (req, res, next) => {
  databaseBackupUpload(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'The database backup must be 100 MB or smaller.' : error.message;
      return res.status(400).json({ message });
    }
    next();
  });
};

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', (error) => reject(new Error(`${command} could not be started (${error.message}). Make sure the PostgreSQL client tools are installed and on PATH.`)));
  child.on('close', (code) => {
    if (code === 0) return resolve();
    reject(new Error(stderr.trim() || `${command} exited with code ${code}.`));
  });
});

const createDatabaseBackup = async (directory = databaseBackupDirectory) => {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const filename = `barangay199-backup-${timestamp}-${crypto.randomUUID()}.sql`;
  const temporaryPath = path.join(directory, `${filename}.tmp`);
  const backupPath = path.join(directory, filename);

  await runCommand('pg_dump', [
    process.env.DATABASE_URL,
    '--no-owner',
    '--no-privileges',
    '--format=plain',
    '--file', temporaryPath
  ]);
  await fs.promises.rename(temporaryPath, backupPath);
  return { filename, size: (await fs.promises.stat(backupPath)).size };
};

const listDatabaseBackups = async () => {
  const files = await fs.promises.readdir(databaseBackupDirectory);
  const backups = await Promise.all(files
    .filter((filename) => backupFilenamePattern.test(filename))
    .map(async (filename) => {
      const stats = await fs.promises.stat(path.join(databaseBackupDirectory, filename));
      return { filename, size: stats.size, created_at: stats.mtime.toISOString() };
    }));
  return backups.sort((first, second) => second.created_at.localeCompare(first.created_at));
};

const notifyAllUsers = async (actorId, message) => {
  try {
    await db.query(
      "INSERT INTO notifications (recipient_id, actor_id, message) SELECT id, $1, $2 FROM users WHERE role = ANY($3)",
      [actorId, message, officialRoles]
    );
  } catch (error) {
    console.error('Failed to create system notification:', error.message);
  }
};

const notifyChatUsers = async (actorId, message, recipientId = null) => {
  try {
    if (recipientId === null) {
      await db.query(
        `INSERT INTO notifications (recipient_id, actor_id, message)
         SELECT id, $1, $2 FROM users WHERE id <> $1 AND role = ANY($3)`,
        [actorId, message, officialRoles]
      );
    } else {
      await db.query(
        `INSERT INTO notifications (recipient_id, actor_id, message)
         SELECT id, $1, $2 FROM users WHERE id = $3 AND id <> $1 AND role = ANY($4)`,
        [actorId, message, recipientId, officialRoles]
      );
    }
  } catch (error) {
    console.error('Failed to create chat notification:', error.message);
  }
};

// --- Schema bootstrap --------------------------------------------------------
const initializeSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      middle_initial VARCHAR(30),
      last_name VARCHAR(100) NOT NULL,
      age INT NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      position VARCHAR(100) NOT NULL DEFAULT '',
      profile_picture VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'");
  await db.query("UPDATE users SET role = 'admin' WHERE role = 'staff'");

  await db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash CHAR(64) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      attempts SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS residents (
      id SERIAL PRIMARY KEY,
      photo VARCHAR(255),
      first_name VARCHAR(100) NOT NULL DEFAULT '',
      middle_initial VARCHAR(30),
      last_name VARCHAR(150) NOT NULL DEFAULT '',
      name VARCHAR(255) NOT NULL,
      age INT,
      sex VARCHAR(50),
      civil_status VARCHAR(100),
      birthdate DATE,
      birthplace VARCHAR(255),
      address VARCHAR(255) NOT NULL DEFAULT '',
      purok VARCHAR(100),
      contact_number VARCHAR(50),
      occupation VARCHAR(255),
      voter_status VARCHAR(50),
      household_no VARCHAR(100),
      date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_residents_name ON residents (name)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_residents_purok ON residents (purok)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS certificate_requests (
      id SERIAL PRIMARY KEY,
      resident_id INT REFERENCES residents(id) ON DELETE SET NULL,
      requestor_name VARCHAR(255) NOT NULL,
      certificate_type VARCHAR(100) NOT NULL,
      purpose VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      remarks VARCHAR(500),
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP,
      processed_by INT REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_certificate_requests_status ON certificate_requests (status, requested_at)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS blotter_reports (
      id SERIAL PRIMARY KEY,
      case_no VARCHAR(50) UNIQUE NOT NULL,
      complainant_name VARCHAR(255) NOT NULL,
      respondent_name VARCHAR(255) NOT NULL,
      incident_type VARCHAR(150) NOT NULL,
      incident_date DATE,
      incident_location VARCHAR(255),
      narrative TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      filed_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_blotter_status ON blotter_reports (status, created_at)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'general',
      posted_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements (created_at)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INT,
      message VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      read_at TIMESTAMP
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, read_at, created_at)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message VARCHAR(2000) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_chat_conversation_clears (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cleared_through_id BIGINT NOT NULL DEFAULT 0,
      cleared_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS private_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message VARCHAR(2000) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      read_at TIMESTAMP,
      deleted_at TIMESTAMP,
      sender_hidden_at TIMESTAMP,
      recipient_hidden_at TIMESTAMP
    )
  `);

  const bootstrapEmail = 'superadmin@barangay199.gov.ph';
  const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [bootstrapEmail]);
  if (!existing.length) {
    await db.query(
      `INSERT INTO users (first_name, middle_initial, last_name, age, email, password, role, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['Juan', 'D.', 'Dela Cruz', 45, bootstrapEmail, bcrypt.hashSync('superadmin123', 10), 'superadmin', 'Barangay Captain']
    );
    console.log(`Seeded bootstrap superadmin account (${bootstrapEmail} / superadmin123). Change this password after first login.`);
  }
};

db.query('SELECT 1')
  .then(async () => {
    console.log('Connected to Supabase Postgres successfully!');
    await initializeSchema();
    console.log('Database schema is ready.');
  })
  .catch((error) => {
    console.error('Database connection/initialization failed:', error.message);
    process.exit(1);
  });

// --- Health -----------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend running' });
});

// --- Database backups --------------------------------------------------------
app.get('/api/database-backups', requireAuth, requireBackupAccess, async (req, res) => {
  try {
    res.json(await listDatabaseBackups());
  } catch (error) {
    console.error('Failed to list database backups:', error.message);
    res.status(500).json({ message: 'Could not load database backups.' });
  }
});

app.post('/api/database-backups', requireAuth, requireBackupAccess, async (req, res) => {
  try {
    const backup = await createDatabaseBackup();
    res.status(201).json({ ...backup, created_at: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to create database backup:', error.message);
    res.status(500).json({ message: `Could not create the database backup. ${error.message}` });
  }
});

app.delete('/api/database-backups/:filename', requireAuth, requireBackupAccess, async (req, res) => {
  const { filename } = req.params;
  if (!backupFilenamePattern.test(filename)) {
    return res.status(400).json({ message: 'Invalid database backup filename.' });
  }
  try {
    await fs.promises.unlink(path.join(databaseBackupDirectory, filename));
    res.json({ message: 'Database backup deleted.' });
  } catch (error) {
    res.status(error.code === 'ENOENT' ? 404 : 500).json({ message: 'Could not delete the database backup.' });
  }
});

app.post('/api/database-backups/import', requireAuth, requireBackupAccess, uploadDatabaseBackup, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a SQL backup file to import.' });
  if (path.extname(req.file.originalname).toLowerCase() !== '.sql') {
    return res.status(400).json({ message: 'Only .sql database backups can be imported.' });
  }
  if (databaseImportInProgress) {
    return res.status(409).json({ message: 'Another database restore is already in progress.' });
  }

  let safetyBackup;
  databaseImportInProgress = true;
  const uploadedPath = path.join(databaseSafetyBackupDirectory, `${crypto.randomUUID()}.sql`);
  try {
    await fs.promises.writeFile(uploadedPath, req.file.buffer);
    safetyBackup = await createDatabaseBackup(databaseSafetyBackupDirectory);
    await runCommand('psql', [process.env.DATABASE_URL, '--set', 'ON_ERROR_STOP=1', '--file', uploadedPath]);
    res.json({ message: 'Database backup imported successfully.', safety_backup: safetyBackup.filename });
  } catch (error) {
    console.error('Failed to import database backup:', error.message);
    res.status(safetyBackup ? 500 : 400).json({
      message: safetyBackup
        ? `Import failed. A safety backup of the previous database was saved as ${safetyBackup.filename}. Details: ${error.message}`
        : error.message
    });
  } finally {
    await fs.promises.unlink(uploadedPath).catch(() => {});
    databaseImportInProgress = false;
  }
});

app.get('/api/database-backups/:filename/download', requireAuth, requireBackupAccess, (req, res) => {
  const { filename } = req.params;
  if (!backupFilenamePattern.test(filename)) {
    return res.status(400).json({ message: 'Invalid database backup filename.' });
  }
  res.download(path.join(databaseBackupDirectory, filename), filename, (error) => {
    if (error && !res.headersSent) {
      res.status(error.code === 'ENOENT' ? 404 : 500).json({ message: 'Could not download the database backup.' });
    }
  });
});

// --- Notifications ------------------------------------------------------------
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, actor_id, message, created_at, read_at FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.auth.id]
    );
    const { rows: counts } = await db.query(
      'SELECT COUNT(*) AS unread_count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL',
      [req.auth.id]
    );
    res.json({ notifications: rows, unread_count: Number(counts[0].unread_count) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load notifications.', error: error.message });
  }
});

app.put('/api/notifications/read', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET read_at = NOW() WHERE recipient_id = $1 AND read_at IS NULL', [req.auth.id]);
    res.json({ message: 'Notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark notifications as read.', error: error.message });
  }
});

app.delete('/api/notifications/:notificationId', requireAuth, async (req, res) => {
  const notificationId = Number(req.params.notificationId);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ message: 'Invalid notification ID.' });
  }
  try {
    const { rowCount } = await db.query('DELETE FROM notifications WHERE id = $1 AND recipient_id = $2', [notificationId, req.auth.id]);
    if (!rowCount) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ message: 'Notification deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete notification.', error: error.message });
  }
});

// --- Team chat -----------------------------------------------------------------
app.get('/api/team-chat/messages', requireAuth, requireOfficial, async (req, res) => {
  const afterId = req.query.after_id === undefined ? null : Number(req.query.after_id);
  if (afterId !== null && (!Number.isSafeInteger(afterId) || afterId < 0)) {
    return res.status(400).json({ message: 'Invalid chat message cursor.' });
  }
  try {
    const query = `
      SELECT messages.id, messages.sender_id, messages.message, messages.created_at, messages.deleted_at,
             users.first_name, users.middle_initial, users.last_name, users.role
      FROM team_chat_messages AS messages
      INNER JOIN users ON users.id = messages.sender_id
      WHERE messages.id > COALESCE((SELECT cleared_through_id FROM team_chat_conversation_clears WHERE user_id = $1), 0)
      ${afterId === null ? '' : 'AND messages.id > $2'}
      ORDER BY messages.id ${afterId === null ? 'DESC' : 'ASC'}
      LIMIT 100
    `;
    const params = afterId === null ? [req.auth.id] : [req.auth.id, afterId];
    const { rows } = await db.query(query, params);
    res.json({ messages: afterId === null ? rows.reverse() : rows });
  } catch {
    res.status(500).json({ message: 'Could not load team chat messages.' });
  }
});

app.delete('/api/team-chat/conversation', requireAuth, requireOfficial, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT COALESCE(MAX(id), 0) AS last_message_id FROM team_chat_messages');
    const lastMessageId = Number(rows[0].last_message_id);
    await db.query(
      `INSERT INTO team_chat_conversation_clears (user_id, cleared_through_id, cleared_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET cleared_through_id = GREATEST(team_chat_conversation_clears.cleared_through_id, $2), cleared_at = NOW()`,
      [req.auth.id, lastMessageId]
    );
    await db.query(
      "DELETE FROM notifications WHERE recipient_id = $1 AND message LIKE 'New team chat message from %'",
      [req.auth.id]
    );
    res.json({ message: 'Team conversation removed from your inbox.' });
  } catch {
    res.status(500).json({ message: 'Could not delete the team conversation from your inbox.' });
  }
});

app.post('/api/team-chat/messages', requireAuth, requireOfficial, async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 2000) {
    return res.status(400).json({ message: 'Enter a message between 1 and 2,000 characters.' });
  }
  try {
    const { rows: inserted } = await db.query(
      'INSERT INTO team_chat_messages (sender_id, message) VALUES ($1, $2) RETURNING id',
      [req.auth.id, message]
    );
    const { rows } = await db.query(
      `SELECT messages.id, messages.sender_id, messages.message, messages.created_at, messages.deleted_at,
              users.first_name, users.middle_initial, users.last_name, users.role
       FROM team_chat_messages AS messages
       INNER JOIN users ON users.id = messages.sender_id
       WHERE messages.id = $1`,
      [inserted[0].id]
    );
    const senderName = [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ') || 'A team member';
    await notifyChatUsers(req.auth.id, `New team chat message from ${senderName}.`);
    res.status(201).json({ message: rows[0] });
  } catch {
    res.status(500).json({ message: 'Could not send the team chat message.' });
  }
});

app.delete('/api/team-chat/messages/:messageId', requireAuth, requireOfficial, async (req, res) => {
  const messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ message: 'Invalid team chat message ID.' });
  }
  try {
    const { rowCount } = await db.query(
      'UPDATE team_chat_messages SET deleted_at = NOW() WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL',
      [messageId, req.auth.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Message not found or you cannot delete it.' });
    res.json({ message: 'Team chat message deleted.' });
  } catch {
    res.status(500).json({ message: 'Could not delete the team chat message.' });
  }
});

app.get('/api/team-chat/users', requireAuth, requireOfficial, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, first_name, middle_initial, last_name, role FROM users WHERE id <> $1 ORDER BY first_name, last_name',
      [req.auth.id]
    );
    res.json({ users: rows });
  } catch {
    res.status(500).json({ message: 'Could not load chat recipients.' });
  }
});

app.get('/api/team-chat/private/:userId/messages', requireAuth, requireOfficial, async (req, res) => {
  const recipientId = Number(req.params.userId);
  const afterId = req.query.after_id === undefined ? null : Number(req.query.after_id);
  if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || recipientId === Number(req.auth.id)) {
    return res.status(400).json({ message: 'Choose a valid chat recipient.' });
  }
  if (afterId !== null && (!Number.isSafeInteger(afterId) || afterId < 0)) {
    return res.status(400).json({ message: 'Invalid chat message cursor.' });
  }
  try {
    const { rows: users } = await db.query('SELECT id FROM users WHERE id = $1', [recipientId]);
    if (!users.length) return res.status(404).json({ message: 'Chat recipient not found.' });

    await db.query(
      'UPDATE private_chat_messages SET read_at = NOW() WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL AND recipient_hidden_at IS NULL',
      [recipientId, req.auth.id]
    );

    const query = `
      SELECT messages.id, messages.sender_id, messages.recipient_id, messages.message,
             messages.created_at, messages.read_at, messages.deleted_at,
             users.first_name, users.middle_initial, users.last_name, users.role
      FROM private_chat_messages AS messages
      INNER JOIN users ON users.id = messages.sender_id
      WHERE ((messages.sender_id = $1 AND messages.recipient_id = $2)
             OR (messages.sender_id = $2 AND messages.recipient_id = $1))
        AND ((messages.sender_id = $1 AND messages.sender_hidden_at IS NULL)
             OR (messages.recipient_id = $1 AND messages.recipient_hidden_at IS NULL))
      ${afterId === null ? '' : 'AND messages.id > $3'}
      ORDER BY messages.id ${afterId === null ? 'DESC' : 'ASC'}
      LIMIT 100
    `;
    const params = afterId === null ? [req.auth.id, recipientId] : [req.auth.id, recipientId, afterId];
    const { rows } = await db.query(query, params);
    res.json({ messages: afterId === null ? rows.reverse() : rows });
  } catch {
    res.status(500).json({ message: 'Could not load private messages.' });
  }
});

app.delete('/api/team-chat/private/:userId/conversation', requireAuth, requireOfficial, async (req, res) => {
  const otherUserId = Number(req.params.userId);
  if (!Number.isSafeInteger(otherUserId) || otherUserId <= 0 || otherUserId === Number(req.auth.id)) {
    return res.status(400).json({ message: 'Choose a valid private conversation.' });
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE private_chat_messages
       SET sender_hidden_at = CASE WHEN sender_id = $1 THEN COALESCE(sender_hidden_at, NOW()) ELSE sender_hidden_at END,
           recipient_hidden_at = CASE WHEN recipient_id = $1 THEN COALESCE(recipient_hidden_at, NOW()) ELSE recipient_hidden_at END
       WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
         AND ((sender_id = $1 AND sender_hidden_at IS NULL) OR (recipient_id = $1 AND recipient_hidden_at IS NULL))`,
      [req.auth.id, otherUserId]
    );
    if (!rowCount) return res.status(404).json({ message: 'Conversation not found.' });
    await db.query(
      "DELETE FROM notifications WHERE recipient_id = $1 AND actor_id = $2 AND message LIKE 'New private message from %'",
      [req.auth.id, otherUserId]
    );
    res.json({ message: 'Conversation removed from your inbox.' });
  } catch {
    res.status(500).json({ message: 'Could not delete this conversation from your inbox.' });
  }
});

app.post('/api/team-chat/private/:userId/messages', requireAuth, requireOfficial, async (req, res) => {
  const recipientId = Number(req.params.userId);
  const message = String(req.body.message || '').trim();
  if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || recipientId === Number(req.auth.id)) {
    return res.status(400).json({ message: 'Choose a valid chat recipient.' });
  }
  if (!message || message.length > 2000) {
    return res.status(400).json({ message: 'Enter a message between 1 and 2,000 characters.' });
  }
  try {
    const { rows: users } = await db.query('SELECT id FROM users WHERE id = $1', [recipientId]);
    if (!users.length) return res.status(404).json({ message: 'Chat recipient not found.' });

    const { rows: inserted } = await db.query(
      'INSERT INTO private_chat_messages (sender_id, recipient_id, message) VALUES ($1, $2, $3) RETURNING id',
      [req.auth.id, recipientId, message]
    );
    const { rows } = await db.query(
      `SELECT messages.id, messages.sender_id, messages.recipient_id, messages.message,
              messages.created_at, messages.read_at, messages.deleted_at,
              users.first_name, users.middle_initial, users.last_name, users.role
       FROM private_chat_messages AS messages
       INNER JOIN users ON users.id = messages.sender_id
       WHERE messages.id = $1`,
      [inserted[0].id]
    );
    const senderName = [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ') || 'A team member';
    await notifyChatUsers(req.auth.id, `New private message from ${senderName}.`, recipientId);
    res.status(201).json({ message: rows[0] });
  } catch {
    res.status(500).json({ message: 'Could not send the private message.' });
  }
});

app.delete('/api/team-chat/private/messages/:messageId', requireAuth, requireOfficial, async (req, res) => {
  const messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ message: 'Invalid private message ID.' });
  }
  try {
    const { rowCount } = await db.query(
      'UPDATE private_chat_messages SET deleted_at = NOW() WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL',
      [messageId, req.auth.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Message not found or you cannot delete it.' });
    res.json({ message: 'Private message deleted.' });
  } catch {
    res.status(500).json({ message: 'Could not delete the private message.' });
  }
});

// --- Dashboard -----------------------------------------------------------------
app.get('/api/dashboard', requireAuth, requireRoles(officialRoles), async (req, res) => {
  try {
    const { rows: residentCountRows } = await db.query('SELECT COUNT(*) AS resident_count FROM residents');
    const { rows: purokRows } = await db.query("SELECT purok, COUNT(*) AS resident_count FROM residents WHERE purok IS NOT NULL AND purok <> '' GROUP BY purok ORDER BY purok");
    const { rows: certificateRows } = await db.query("SELECT COUNT(*) AS pending_count FROM certificate_requests WHERE status = 'pending'");
    const { rows: blotterRows } = await db.query("SELECT COUNT(*) AS open_count FROM blotter_reports WHERE status = 'open'");

    const summary = {
      role: req.auth.role,
      totals: {
        residents: Number(residentCountRows[0].resident_count),
        puroks: purokRows.length,
        pendingCertificates: Number(certificateRows[0].pending_count),
        openBlotterCases: Number(blotterRows[0].open_count)
      },
      residentsByPurok: purokRows.map((row) => ({ purok: row.purok, resident_count: Number(row.resident_count) }))
    };

    if (req.auth.role === 'superadmin') {
      const { rows: userRows } = await db.query('SELECT role, COUNT(*) AS account_count FROM users GROUP BY role ORDER BY role');
      const usersByRole = userRows.map((row) => ({ role: row.role, account_count: Number(row.account_count) }));
      summary.totals.accounts = usersByRole.reduce((total, role) => total + role.account_count, 0);
      summary.usersByRole = usersByRole;
    }

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Could not load dashboard data.', error: error.message });
  }
});

// --- Residents -------------------------------------------------------------
app.get('/api/search/residents', requireAuth, requireOfficial, async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (name.length < 2) return res.json([]);
  try {
    const { rows } = await db.query(
      'SELECT id, name, age, purok FROM residents WHERE name ILIKE $1 ORDER BY name LIMIT 10',
      [`%${name.slice(0, 100)}%`]
    );
    res.json(rows.map((row) => ({ ...row, age: row.age === null ? null : Number(row.age) })));
  } catch (error) {
    res.status(500).json({ message: 'Resident name search failed.', error: error.message });
  }
});

app.get('/api/residents', requireAuth, requireOfficial, async (req, res) => {
  const { purok } = req.query;
  try {
    const { rows } = purok
      ? await db.query(`SELECT ${residentSelectColumns} FROM residents WHERE purok = $1 ORDER BY name`, [purok])
      : await db.query(`SELECT ${residentSelectColumns} FROM residents ORDER BY name`);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching residents', error: error.message });
  }
});

app.get('/api/residents/:id', requireAuth, requireOfficial, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT ${residentSelectColumns} FROM residents WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Resident not found.' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching resident', error: error.message });
  }
});

const splitResidentName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || '';
  const middleInitial = parts.length > 1 && /^[A-Za-z]\.?$/.test(parts[0]) ? parts.shift() : '';
  return { firstName, middleInitial, lastName: parts.join(' ') };
};
const getResidentNameParts = (data) => {
  const legacy = splitResidentName(data.name);
  const firstName = String(data.first_name || legacy.firstName).trim();
  const middleInitial = String(data.middle_initial || legacy.middleInitial).trim();
  const lastName = String(data.last_name || legacy.lastName).trim();
  return { firstName, middleInitial, lastName, fullName: [firstName, middleInitial, lastName].filter(Boolean).join(' ') };
};

app.post('/api/residents', requireAuth, requireOfficial, uploadResidentPhoto, async (req, res) => {
  const data = req.body;
  const nameParts = getResidentNameParts(data);
  if (!nameParts.firstName || !nameParts.lastName || !data.address) {
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ message: 'First name, last name, and address are required.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO residents (
        photo, name, first_name, middle_initial, last_name, age, sex, civil_status, birthdate, birthplace,
        address, purok, contact_number, occupation, voter_status, household_no
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id`,
      [
        req.file ? `/uploads/${req.file.filename}` : null,
        nameParts.fullName,
        nameParts.firstName,
        nameParts.middleInitial || null,
        nameParts.lastName,
        data.age || null,
        data.sex || null,
        data.civil_status || null,
        data.birthdate || null,
        data.birthplace || null,
        data.address,
        data.purok || null,
        data.contact_number || null,
        data.occupation || null,
        data.voter_status || null,
        data.household_no || null
      ]
    );
    await notifyAllUsers(req.auth.id, `A new resident was registered: ${nameParts.fullName}.`);
    res.status(201).json({ message: 'Resident record created successfully.', id: rows[0].id });
  } catch (error) {
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ message: 'Failed to create resident record.', error: error.message });
  }
});

app.put('/api/residents/:id', requireAuth, requireOfficial, uploadResidentPhoto, async (req, res) => {
  const data = req.body;
  const nameParts = getResidentNameParts(data);
  if (!nameParts.firstName || !nameParts.lastName || !data.address) {
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ message: 'First name, last name, and address are required.' });
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE residents SET
        photo = COALESCE($1, photo), name = $2, first_name = $3, middle_initial = $4, last_name = $5,
        age = $6, sex = $7, civil_status = $8, birthdate = $9, birthplace = $10, address = $11, purok = $12,
        contact_number = $13, occupation = $14, voter_status = $15, household_no = $16, status = COALESCE($17, status)
       WHERE id = $18`,
      [
        req.file ? `/uploads/${req.file.filename}` : null,
        nameParts.fullName,
        nameParts.firstName,
        nameParts.middleInitial || null,
        nameParts.lastName,
        data.age || null,
        data.sex || null,
        data.civil_status || null,
        data.birthdate || null,
        data.birthplace || null,
        data.address,
        data.purok || null,
        data.contact_number || null,
        data.occupation || null,
        data.voter_status || null,
        data.household_no || null,
        data.status || null,
        req.params.id
      ]
    );
    if (!rowCount) return res.status(404).json({ message: 'Resident not found.' });
    await notifyAllUsers(req.auth.id, `A resident record was updated: ${nameParts.fullName}.`);
    res.json({ message: 'Resident updated successfully.' });
  } catch (error) {
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ message: 'Failed to update resident record.', error: error.message });
  }
});

app.delete('/api/residents/:id', requireAuth, requireOfficial, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM residents WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Resident not found.' });
    await notifyAllUsers(req.auth.id, 'A resident record was deleted.');
    res.json({ message: 'Resident deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete resident.', error: error.message });
  }
});

// --- Certificate requests ----------------------------------------------------
app.get('/api/certificates', requireAuth, requireOfficial, async (req, res) => {
  const { status } = req.query;
  try {
    const { rows } = status
      ? await db.query('SELECT * FROM certificate_requests WHERE status = $1 ORDER BY requested_at DESC', [status])
      : await db.query('SELECT * FROM certificate_requests ORDER BY requested_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching certificate requests', error: error.message });
  }
});

app.post('/api/certificates', requireAuth, requireOfficial, async (req, res) => {
  const { resident_id, requestor_name, certificate_type, purpose } = req.body;
  if (!requestor_name || !certificate_type || !purpose) {
    return res.status(400).json({ message: 'Requestor name, certificate type, and purpose are required.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO certificate_requests (resident_id, requestor_name, certificate_type, purpose)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [resident_id || null, requestor_name, certificate_type, purpose]
    );
    await notifyAllUsers(req.auth.id, `A new ${certificate_type} request was filed for ${requestor_name}.`);
    res.status(201).json({ message: 'Certificate request created successfully.', id: rows[0].id });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create certificate request.', error: error.message });
  }
});

app.put('/api/certificates/:id', requireAuth, requireOfficial, async (req, res) => {
  const { status, remarks } = req.body;
  const allowedStatuses = ['pending', 'approved', 'released', 'rejected'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid certificate status.' });
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE certificate_requests SET status = $1, remarks = $2, processed_at = NOW(), processed_by = $3 WHERE id = $4`,
      [status, remarks || null, req.auth.id, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Certificate request not found.' });
    res.json({ message: 'Certificate request updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update certificate request.', error: error.message });
  }
});

app.delete('/api/certificates/:id', requireAuth, requireOfficial, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM certificate_requests WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Certificate request not found.' });
    res.json({ message: 'Certificate request deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete certificate request.', error: error.message });
  }
});

// --- Blotter reports -----------------------------------------------------------
app.get('/api/blotter', requireAuth, requireOfficial, async (req, res) => {
  const { status } = req.query;
  try {
    const { rows } = status
      ? await db.query('SELECT * FROM blotter_reports WHERE status = $1 ORDER BY created_at DESC', [status])
      : await db.query('SELECT * FROM blotter_reports ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching blotter reports', error: error.message });
  }
});

app.post('/api/blotter', requireAuth, requireOfficial, async (req, res) => {
  const { complainant_name, respondent_name, incident_type, incident_date, incident_location, narrative } = req.body;
  if (!complainant_name || !respondent_name || !incident_type) {
    return res.status(400).json({ message: 'Complainant, respondent, and incident type are required.' });
  }
  try {
    const caseNo = `BR-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
    const { rows } = await db.query(
      `INSERT INTO blotter_reports (case_no, complainant_name, respondent_name, incident_type, incident_date, incident_location, narrative, filed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [caseNo, complainant_name, respondent_name, incident_type, incident_date || null, incident_location || null, narrative || null, req.auth.id]
    );
    await notifyAllUsers(req.auth.id, `A new blotter case ${caseNo} was filed.`);
    res.status(201).json({ message: 'Blotter report filed successfully.', id: rows[0].id, case_no: caseNo });
  } catch (error) {
    res.status(500).json({ message: 'Failed to file blotter report.', error: error.message });
  }
});

app.put('/api/blotter/:id', requireAuth, requireOfficial, async (req, res) => {
  const { status, narrative } = req.body;
  const allowedStatuses = ['open', 'settled', 'endorsed', 'closed'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid blotter status.' });
  }
  try {
    const { rowCount } = await db.query(
      'UPDATE blotter_reports SET status = $1, narrative = COALESCE($2, narrative) WHERE id = $3',
      [status, narrative || null, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Blotter report not found.' });
    res.json({ message: 'Blotter report updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update blotter report.', error: error.message });
  }
});

app.delete('/api/blotter/:id', requireAuth, requireOfficial, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM blotter_reports WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Blotter report not found.' });
    res.json({ message: 'Blotter report deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete blotter report.', error: error.message });
  }
});

// --- Announcements --------------------------------------------------------------
app.get('/api/announcements', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT announcements.*, users.first_name, users.last_name
       FROM announcements INNER JOIN users ON users.id = announcements.posted_by
       ORDER BY announcements.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching announcements', error: error.message });
  }
});

app.post('/api/announcements', requireAuth, requireOfficial, async (req, res) => {
  const { title, content, category } = req.body;
  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required.' });
  }
  try {
    const { rows } = await db.query(
      'INSERT INTO announcements (title, content, category, posted_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [title, content, category || 'general', req.auth.id]
    );
    await notifyAllUsers(req.auth.id, `A new announcement was posted: ${title}.`);
    res.status(201).json({ message: 'Announcement posted successfully.', id: rows[0].id });
  } catch (error) {
    res.status(500).json({ message: 'Failed to post announcement.', error: error.message });
  }
});

app.delete('/api/announcements/:id', requireAuth, requireOfficial, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Announcement not found.' });
    res.json({ message: 'Announcement deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete announcement.', error: error.message });
  }
});

// --- Auth ------------------------------------------------------------------
app.post('/api/auth/register', requireAuth, requireSuperadmin, async (req, res) => {
  const { first_name, middle_initial, last_name, age, email, password, role } = req.body;
  if (!first_name || !last_name || !age || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required: first_name, last_name, age, email, password, role.' });
  }
  const allowedRoles = ['admin', 'user'];
  const normalizedRole = String(role).trim().toLowerCase();
  if (!allowedRoles.includes(normalizedRole)) {
    return res.status(400).json({ message: 'Invalid role. Allowed roles: admin, user.' });
  }
  const parsedAge = Number(age);
  if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
    return res.status(400).json({ message: 'Age must be a valid number.' });
  }
  if (String(middle_initial || '').trim().length > 30) {
    return res.status(400).json({ message: 'Middle initial must be 30 characters or fewer.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const hashedPassword = bcrypt.hashSync(String(password), 10);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (first_name, middle_initial, last_name, age, email, password, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [String(first_name).trim(), String(middle_initial || '').trim() || null, String(last_name).trim(), parsedAge, cleanEmail, hashedPassword, normalizedRole]
    );
    await notifyAllUsers(req.auth.id, 'A user account was created.');
    res.status(201).json({
      message: 'User registered successfully.',
      user: {
        id: rows[0].id,
        first_name: String(first_name).trim(),
        middle_initial: String(middle_initial || '').trim() || null,
        last_name: String(last_name).trim(),
        age: parsedAge,
        email: cleanEmail,
        role: normalizedRole
      }
    });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'Email already exists.' });
    res.status(500).json({ message: 'Registration failed.', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(String(password), user.password)) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    const { password: _password, ...safeUser } = user;
    const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
    res.json({ message: 'Login successful.', user: safeUser, accessToken });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', error: error.message });
  }
});

const passwordResetResponse = { message: 'If an account exists for that email, a password reset code has been sent.' };
const hashResetCode = (userId, code) => crypto.createHmac('sha256', jwtSecret).update(`${userId}:${code}`).digest('hex');

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (!mailTransporter) {
    return res.status(503).json({ message: 'Password reset email is not configured. Contact the administrator.' });
  }
  try {
    const { rows: users } = await db.query('SELECT id, first_name, email FROM users WHERE email = $1', [email]);
    if (!users.length) return res.json(passwordResetResponse);
    const user = users[0];

    const { rows: codes } = await db.query('SELECT created_at FROM password_reset_codes WHERE user_id = $1', [user.id]);
    if (codes.length && Date.now() - new Date(codes[0].created_at).getTime() < 60_000) {
      return res.json(passwordResetResponse);
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = hashResetCode(user.id, code);
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await db.query(
      `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, attempts)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (user_id) DO UPDATE SET code_hash = $2, expires_at = $3, attempts = 0, created_at = NOW()`,
      [user.id, codeHash, expiresAt]
    );

    try {
      await mailTransporter.sendMail({
        from: mailFrom,
        to: user.email,
        subject: 'Your Barangay 199 password reset code',
        text: `Hello ${user.first_name},\n\nYour password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.\n\nBarangay 199`
      });
      res.json(passwordResetResponse);
    } catch (mailError) {
      console.error('Password reset email delivery failed:', mailError.message);
      await db.query('DELETE FROM password_reset_codes WHERE user_id = $1 AND code_hash = $2', [user.id, codeHash]);
      res.status(503).json({ message: 'Could not send the reset email. Check the mail configuration or try again later.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Could not request a password reset.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const newPassword = String(req.body.new_password || '');
  const invalidCode = () => res.status(400).json({ message: 'The reset code is invalid or expired.' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) return invalidCode();
  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ message: 'The new password must be between 8 and 128 characters.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT users.id, password_reset_codes.code_hash, password_reset_codes.expires_at, password_reset_codes.attempts
       FROM users JOIN password_reset_codes ON password_reset_codes.user_id = users.id
       WHERE users.email = $1`,
      [email]
    );
    if (!rows.length) return invalidCode();

    const reset = rows[0];
    if (Number(reset.attempts) >= 5 || new Date(reset.expires_at).getTime() <= Date.now()) {
      await db.query('DELETE FROM password_reset_codes WHERE user_id = $1', [reset.id]);
      return invalidCode();
    }

    const expectedHash = hashResetCode(reset.id, code);
    const actualHash = String(reset.code_hash);
    const isValid = /^[a-f0-9]{64}$/i.test(actualHash)
      && crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(actualHash, 'hex'));

    const { rowCount: attemptRows } = await db.query(
      'UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = $1 AND attempts < 5 AND expires_at > NOW()',
      [reset.id]
    );
    if (!attemptRows || !isValid) return invalidCode();

    const { rowCount: consumedRows } = await db.query(
      'DELETE FROM password_reset_codes WHERE user_id = $1 AND code_hash = $2 AND expires_at > NOW()',
      [reset.id, actualHash]
    );
    if (!consumedRows) return invalidCode();

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [passwordHash, reset.id]);
    res.json({ message: 'Password reset successfully. Sign in with your new password.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not reset the password.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, first_name, middle_initial, last_name, age, email, role, position, profile_picture FROM users WHERE id = $1',
      [req.auth.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User account not found.' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load profile.', error: error.message });
  }
});

app.delete('/api/auth/me/profile-picture', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT profile_picture FROM users WHERE id = $1', [req.auth.id]);
    if (!rows.length) return res.status(404).json({ message: 'User account not found.' });

    const photoPath = rows[0].profile_picture;
    await db.query('UPDATE users SET profile_picture = NULL WHERE id = $1', [req.auth.id]);
    if (photoPath?.startsWith('/uploads/')) {
      fs.promises.unlink(path.join(uploadDirectory, path.basename(photoPath))).catch(() => {});
    }

    const { rows: profiles } = await db.query(
      'SELECT id, first_name, middle_initial, last_name, age, email, role, position, profile_picture FROM users WHERE id = $1',
      [req.auth.id]
    );
    await notifyAllUsers(req.auth.id, 'A user profile picture was removed.');
    res.json(profiles[0]);
  } catch (error) {
    res.status(500).json({ message: 'Could not remove the profile picture.', error: error.message });
  }
});

app.put('/api/auth/me', requireAuth, imageUpload.single('profile_picture'), async (req, res) => {
  const firstName = String(req.body.first_name || '').trim();
  const middleInitial = String(req.body.middle_initial || '').trim();
  const lastName = String(req.body.last_name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const age = Number(req.body.age);
  const discardUploadedPhoto = () => { if (req.file) fs.unlink(req.file.path, () => {}); };

  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    discardUploadedPhoto();
    return res.status(400).json({ message: 'First and last name are required and must be 100 characters or fewer.' });
  }
  if (middleInitial.length > 30) {
    discardUploadedPhoto();
    return res.status(400).json({ message: 'Middle initial must be 30 characters or fewer.' });
  }
  if (!Number.isInteger(age) || age < 18 || age > 120) {
    discardUploadedPhoto();
    return res.status(400).json({ message: 'Age must be a whole number between 18 and 120.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
    discardUploadedPhoto();
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  try {
    const photoValue = req.file ? `/uploads/${req.file.filename}` : null;
    const { rowCount } = await db.query(
      `UPDATE users SET first_name = $1, middle_initial = $2, last_name = $3, age = $4, email = $5,
        profile_picture = COALESCE($6, profile_picture) WHERE id = $7`,
      [firstName, middleInitial || null, lastName, age, email, photoValue, req.auth.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'User account not found.' });

    const { rows } = await db.query(
      'SELECT id, first_name, middle_initial, last_name, age, email, role, position, profile_picture FROM users WHERE id = $1',
      [req.auth.id]
    );
    await notifyAllUsers(req.auth.id, 'A user profile was updated.');
    res.json(rows[0]);
  } catch (error) {
    discardUploadedPhoto();
    const isDuplicateEmail = error.code === '23505';
    res.status(isDuplicateEmail ? 409 : 500).json({
      message: isDuplicateEmail ? 'That email address is already in use.' : 'Failed to update profile.',
      ...(!isDuplicateEmail && { error: error.message })
    });
  }
});

app.put('/api/auth/password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');
  if (!currentPassword || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ message: 'Enter your current password and a new password between 8 and 128 characters.' });
  }
  try {
    const { rows } = await db.query('SELECT password FROM users WHERE id = $1', [req.auth.id]);
    if (!rows.length) return res.status(404).json({ message: 'User account not found.' });
    if (!bcrypt.compareSync(currentPassword, rows[0].password)) {
      return res.status(400).json({ message: 'Your current password is incorrect.' });
    }
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [passwordHash, req.auth.id]);
    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update your password.' });
  }
});

app.get('/api/users', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, first_name, middle_initial, last_name, age, email, role, created_at FROM users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

app.delete('/api/users/:id', requireAuth, requireSuperadmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ message: 'Invalid user account ID.' });
  }
  if (targetId === Number(req.auth.id)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }
  try {
    const { rows } = await db.query('SELECT profile_picture FROM users WHERE id = $1', [targetId]);
    if (!rows.length) return res.status(404).json({ message: 'User account not found.' });

    const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [targetId]);
    if (!rowCount) return res.status(404).json({ message: 'User account not found.' });

    await notifyAllUsers(req.auth.id, 'A user account was deleted.');
    const photoPath = rows[0].profile_picture;
    if (photoPath?.startsWith('/uploads/')) {
      fs.promises.unlink(path.join(uploadDirectory, path.basename(photoPath))).catch(() => {});
    }
    res.json({ message: 'User account deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user account.', error: error.message });
  }
});

// --- AI assistant --------------------------------------------------------------
const assistantRateLimits = new Map();
const createLocalModelPrompt = (question) => (
  `You are the Barangay 199 Assistant, a helpful English and Filipino assistant for barangay residents and staff. Answer the user's question clearly and directly about barangay services, requirements, and processes. If you are unsure, say so instead of inventing facts.\n\nUser question: ${question}`
);

const askLocalModel = async (question) => {
  if (process.env.LOCAL_LLM_ENABLED !== 'true') return null;
  const baseUrl = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = String(process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim();
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: createLocalModelPrompt(question), stream: false, options: { temperature: 0.2, num_ctx: 2048 } }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) return null;
    const result = await response.json();
    return String(result.response || '').trim() || null;
  } catch {
    return null;
  }
};

app.post('/api/assistant/chat', requireAuth, async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (message.length < 2 || message.length > 1000) {
    return res.status(400).json({ message: 'Enter a question between 2 and 1,000 characters.' });
  }

  const now = Date.now();
  const accountId = Number(req.auth.id);
  const usage = assistantRateLimits.get(accountId);
  if (usage && usage.resetAt > now && usage.count >= 20) {
    return res.status(429).json({ message: 'Chat limit reached. Please wait a minute before sending another question.' });
  }
  assistantRateLimits.set(accountId, usage && usage.resetAt > now
    ? { count: usage.count + 1, resetAt: usage.resetAt }
    : { count: 1, resetAt: now + 60_000 });

  const localModelReply = await askLocalModel(message);
  if (localModelReply) {
    return res.json({ reply: localModelReply, source: null, model: 'local' });
  }
  res.json({
    reply: 'Hindi makuha ang local AI model ngayon. Siguraduhing tumatakbo ang Ollama at naka-install ang napiling model.',
    source: null,
    model: 'unavailable'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
