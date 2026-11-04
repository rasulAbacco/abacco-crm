import multer from 'multer';

// Imports are held in memory (max 5 MB, one file) and parsed immediately.
export const singleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('file');
