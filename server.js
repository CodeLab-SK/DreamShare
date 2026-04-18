const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// In-memory data store
const ipDataStore = {}; // { '127.0.0.1': { texts: [], files: [] } }
const codeFilesStore = {}; // { 'CODE123': { fileInfo } }

// Helper to get client IP
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(/, /)[0] : req.connection.remoteAddress;
  return ip || 'unknown-ip';
};

const FILE_LIFETIME = 5 * 60 * 1000; // 5 minutes
const CODE_LIFETIME = 10 * 60 * 1000; // 10 minutes

const deleteFileAndData = (filename) => {
    const filePath = path.join(__dirname, 'uploads', filename);
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error deleting file ${filename}:`, err);
        });
    }

    // Delete from IP Store
    for (const ip in ipDataStore) {
        ipDataStore[ip].files = ipDataStore[ip].files.filter(f => f.filename !== filename);
    }

    // Delete from Code Store
    for (const code in codeFilesStore) {
        if (codeFilesStore[code].filename === filename) {
            delete codeFilesStore[code];
        }
    }
};

// -- FEATURE 1: Same IP Share -- //

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
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
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

app.delete('/api/ip/text/:id', (req, res) => {
  const ip = getClientIp(req);
  if (ipDataStore[ip]) {
      ipDataStore[ip].texts = ipDataStore[ip].texts.filter(t => t.id !== req.params.id);
  }
  res.json({ success: true });
});

app.delete('/api/ip/text', (req, res) => {
  const ip = getClientIp(req);
  if (ipDataStore[ip]) {
      ipDataStore[ip].texts = [];
  }
  res.json({ success: true });
});

app.delete('/api/ip/file/:filename', (req, res) => {
  const ip = getClientIp(req);
  const { filename } = req.params;
  
  if (ipDataStore[ip]) {
      // Find the file to verify it belongs to this IP
      const fileExists = ipDataStore[ip].files.find(f => f.filename === filename);
      if (fileExists) {
          deleteFileAndData(filename);
      }
  }
  res.json({ success: true });
});

app.post('/api/ip/upload', upload.single('file'), (req, res) => {
  const ip = getClientIp(req);
  if (!req.file) return res.status(400).json({ error: 'File is required' });

  if (!ipDataStore[ip]) ipDataStore[ip] = { texts: [], files: [] };

  const newFile = {
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    timestamp: Date.now()
  };

  ipDataStore[ip].files.push(newFile);
  res.json({ success: true, file: newFile });

  setTimeout(() => deleteFileAndData(req.file.filename), FILE_LIFETIME);
});

// Download IP shared file
app.get('/api/ip/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', filename);
  
  // Find the original name based on existing IP store
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


// -- FEATURE 2: Code Share -- //

const generateCode = () => {
    return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. A1B2C3
};

app.post('/api/code/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required' });

  let code;
  do {
      code = generateCode();
  } while (codeFilesStore[code]); // Ensure uniqueness

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
      return res.status(404).json({ error: 'Invalid code or file expired' });
  }

  const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
  if (fs.existsSync(filePath)) {
      res.download(filePath, fileInfo.originalname);
  } else {
      res.status(404).json({ error: 'File not found on server' });
  }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
