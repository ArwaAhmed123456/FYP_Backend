const express = require('express');
const multer = require('multer');
const { processOcr, ocrHealth } = require('../controller/ocrProxyController');

const router = express.Router();

// Keep images in memory — no disk I/O needed since we forward the buffer directly
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are accepted'));
    }
  },
});

router.post('/', upload.single('image'), processOcr);
router.get('/health', ocrHealth);

module.exports = router;
