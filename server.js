const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// ✅ Ensure uploads folder exists (VERY IMPORTANT for Railway)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// In-memory data store
const ipDataStore = {};
const codeFilesStore = {};

// Helper to get client IP
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;
  return ip || 'unknown-ip';
};

const FILE_LIFETIME = 5 * 60 * 1000;
const CODE_LIFETIME = 10 * 60 * 1000;

const deleteFileAndData = (filename) => {
  const filePath = path.join(uploadDir, filename);

  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Error deleting file ${filename}:`, err);
    });
  }

  for (const ip in ipDataStore) {
    ipDataStore[ip].files = ipDataStore[ip].files.filter(f => f.filename !== filename);
  }

  for (const code in codeFilesStore) {
    if (codeFilesStore[code].filename === filename) {
      delete codeFilesStore[code];
    }
  }
};

// ---------------- ROUTES ---------------- //

// Test route (VERY IMPORTANT for browser testing)
app.get('/', (req, res) => {
  res.send('DreamShare backend is running 🚀');
});

// IP DATA
app.get('/api/ip/data', (req, res) => {
  const ip = getClientIp(req);
  if (!ipDataStore[ip]) {
    ipDataStore[ip] = { texts: [], files: [] };
  }
  res.json(ipDataStore[ip]);
});

app.post('/api/ip/text', (req, res) => {
  const ip = getClientIp(req);
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: 'Text is required' });

  if (!ipDataStore[ip]) ipDataStore[ip] = { texts: [], files: [] };

  const newText = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    text,
    timestamp: Date.now()
  };

  ipDataStore[ip].texts.push(newText);
  res.json({ success: true, text: newText });

  setTimeout(() => {
    if (ipDataStore[ip]) {
      ipDataStore[ip].texts = ipDataStore[ip].texts.filter(t => t.id !== newText.id);
    }
  }, FILE_LIFETIME);
});

app.post('/api/ip/upload', upload.single('file'), (req, res) => {
  const ip = getClientIp(req);

  if (!req.file) return res.status(400).json({ error: 'File is required' });

  if (!ipDataStore[ip]) ipDataStore[ip] = { texts: [], files: [] };

  const newFile = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    timestamp: Date.now()
  };

  ipDataStore[ip].files.push(newFile);
  res.json({ success: true, file: newFile });

  setTimeout(() => deleteFileAndData(req.file.filename), FILE_LIFETIME);
});

app.get('/api/ip/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);

  let originalName = filename;
  for (const ip in ipDataStore) {
    const fileObj = ipDataStore[ip].files.find(f => f.filename === filename);
    if (fileObj) {
      originalName = fileObj.originalname;
      break;
    }
  }

  if (fs.existsSync(filePath)) {
    res.download(filePath, originalName);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// CODE SHARE
const generateCode = () => {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
};

app.post('/api/code/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required' });

  let code;
  do {
    code = generateCode();
  } while (codeFilesStore[code]);

  codeFilesStore[code] = {
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    timestamp: Date.now()
  };

  res.json({ success: true, code });

  setTimeout(() => deleteFileAndData(req.file.filename), CODE_LIFETIME);
});

app.get('/api/code/download/:code', (req, res) => {
  let { code } = req.params;
  code = code.trim().toUpperCase();

  const fileInfo = codeFilesStore[code];
  if (!fileInfo) {
    return res.status(404).json({ error: 'Invalid code or expired' });
  }

  const filePath = path.join(uploadDir, fileInfo.filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath, fileInfo.originalname);
  } else {
    res.status(404).json({ error: 'File not found on server' });
  }
});

// ---------------- START SERVER ---------------- //

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
