const fileModel = require('../models/file.model');
const fs = require('fs');
const path = require('path');

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { roomId } = req.body;
    
    if (!roomId) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const fileUrl = `/uploads/files/${req.file.filename}`;

    const file = await fileModel.create(
      req.userId,
      roomId,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      fileUrl
    );

    console.log('File uploaded:', file);

    res.status(201).json({
      id: file.id,
      url: fileUrl,
      filename: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
    });

  } catch (error) {
    console.error('Upload file error:', error);
    
    // Clean up file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    
    res.status(500).json({ error: 'Failed to upload file' });
  }
};

exports.getFiles = async (req, res) => {
  try {
    const { roomId } = req.params;
    const files = await fileModel.findByRoomId(roomId);
    
    res.json(files);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await fileModel.findById(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check ownership
    if (file.user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete from filesystem
    const filepath = path.join('/var/www/chatapp/uploads/files', file.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Delete from database
    await fileModel.delete(fileId);

    res.json({ message: 'File deleted' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};
