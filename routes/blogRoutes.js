const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const router = express.Router();
const Blog = require('../models/BlogModel');
const { extractUserFromRequest } = require('../services/authorizationService');
const { getOrCreateTranslation } = require('../services/translationService');
const { getPatientLanguage } = require('../utils/getPatientLanguage');

const ALLOWED_GENRES = ['Cardiology', 'Nutrition', 'Mental Health', 'Fitness', 'General', 'COVID-19',
  'Women Health', 'Child Health', 'Lifestyle', 'Public Health', 'Disease Awareness'];

const { ipKeyGenerator } = require('express-rate-limit');
const publicBlogLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
const createBlogLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => extractUserFromRequest(req)?.userId || ipKeyGenerator(req),
});

const BLOG_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'blogs');
const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Utility: build base filter for public listing
 * - Patients and anonymous users: approved only
 * - Doctors: approved only for this endpoint (their own dashboard uses a different route)
 */
function buildPublicFilter(query) {
  const { genre, language, search, source, authorId } = query;

  const filter = {
    status: 'approved',
  };

  if (genre) {
    filter.genre = genre;
  }
  if (language) {
    filter.language = language;
  }
  if (source) {
    filter.source = source;
  }
  if (authorId) {
    filter.authorId = authorId;
  }

  if (search && search.trim().length > 0) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ title: regex }, { content: regex }, { sourceName: regex }, { genre: regex }];
  }

  return filter;
}

/**
 * GET /api/blogs
 * Public blog listing for patients and doctors
 * - Only approved blogs
 * - Supports filters and search
 */
router.get('/', publicBlogLimiter, async (req, res) => {
  try {
    const MAX_LIMIT = 100;
    const rawLimit = parseInt(req.query.limit, 10);
    const rawSkip = parseInt(req.query.skip, 10);
    const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 20 : rawLimit, MAX_LIMIT);
    const skip = isNaN(rawSkip) || rawSkip < 0 ? 0 : rawSkip;
    const sortParam = req.query.sort || '';
    const filter = buildPublicFilter(req.query);

    let sort = { createdAt: -1 };
    if (sortParam === 'credibility') {
      sort = { credibilityScore: -1, createdAt: -1 };
    } else if (sortParam === 'popularity') {
      sort = { views: -1, createdAt: -1 };
    }

    const [blogs, total] = await Promise.all([
      Blog.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Blog.countDocuments(filter),
    ]);

    // Translate titles for the requesting patient (list view: title only)
    const userInfo = extractUserFromRequest(req);
    const userId = userInfo?.userId;
    const lang = await getPatientLanguage(userId);

    const translatedBlogs = await Promise.all(
      blogs.map(async (blog) => {
        if (lang !== 'ur') return blog;
        const translated = await getOrCreateTranslation(
          'Blog',
          blog._id,
          { title: blog.title },
          lang
        );
        return { ...blog, title: translated.title ?? blog.title };
      })
    );

    res.json({
      success: true,
      data: translatedBlogs,
      pagination: { total, limit, skip },
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs',
    });
  }
});

/**
 * GET /api/blogs/doctor/mine
 * Doctor blog dashboard (must be before /:id)
 */
router.get('/doctor/mine', async (req, res) => {
  try {
    const userInfo = extractUserFromRequest(req);

    if (!userInfo || userInfo.userRole !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can view their blogs',
      });
    }

    const blogs = await Blog.find({
      authorId: userInfo.userId,
      authorRole: 'doctor',
    }).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      data: blogs,
    });
  } catch (error) {
    console.error('Error fetching doctor blogs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor blogs',
    });
  }
});

/**
 * POST /api/blogs/doctor
 * Create a new blog (Doctor only). Accepts either:
 * - title, content, genre, language (text blog)
 * - title, language, file (base64), filename (PDF upload) → saved as pending for admin approval
 */
const MAX_TEXT_CONTENT_BYTES = 200 * 1024; // 200 KB

router.post('/doctor', createBlogLimiter, async (req, res) => {
  try {
    const userInfo = extractUserFromRequest(req);

    if (!userInfo || userInfo.userRole !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can create blogs',
      });
    }

    const { title, content, genre, language, attachments, file: fileBase64, filename } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title is required',
      });
    }

    let blogPayload = {
      title: title.trim().slice(0, 500),
      genre: ALLOWED_GENRES.includes(genre) ? genre : 'General',
      language: language === 'ur' ? 'ur' : 'en',
      authorId: userInfo.userId,
      authorRole: 'doctor',
      source: 'doctor',
      sourceName: 'Doctor Portal',
      status: 'pending',
    };

    if (fileBase64 && typeof fileBase64 === 'string') {
      // PDF upload: save file and create blog with attachment
      if (fileBase64.length > MAX_PDF_BYTES * 1.4) {
        return res.status(400).json({ success: false, message: 'File too large (max 15 MB)' });
      }
      let buffer;
      try {
        buffer = Buffer.from(fileBase64, 'base64');
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid file encoding' });
      }
      if (buffer.length > MAX_PDF_BYTES) {
        return res.status(400).json({ success: false, message: 'File too large (max 15 MB)' });
      }
      const safeName = (filename && path.basename(String(filename))) || 'article.pdf';
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
      ensureDir(BLOG_UPLOAD_DIR);
      const filePath = path.join(BLOG_UPLOAD_DIR, uniqueName);
      await fs.promises.writeFile(filePath, buffer);
      const attachmentUrl = `/api/uploads/blogs/${uniqueName}`;
      blogPayload.content = 'PDF attached. Open the attachment below to read the article.';
      blogPayload.attachments = [
        { name: safeName.replace(/\.pdf$/i, '') || 'article', url: attachmentUrl, type: 'application/pdf' },
      ];
    } else {
      // Text content
      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Either write content or upload a PDF',
        });
      }
      if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_CONTENT_BYTES) {
        return res.status(400).json({ success: false, message: 'Content too long (max 200 KB)' });
      }
      blogPayload.content = content.trim();
      blogPayload.attachments = [];
    }

    const blog = await Blog.create(blogPayload);

    res.status(201).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    console.error('Error creating blog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create blog',
    });
  }
});

/**
 * GET /api/blogs/:id
 * Read a single blog and increment views
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid blog ID' });
    }
    const userInfo = extractUserFromRequest(req);

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    const isDoctor = userInfo?.userRole === 'doctor';
    const isAuthor = isDoctor && blog.authorId?.toString() === userInfo.userId?.toString();

    if ((!userInfo || userInfo.userRole === 'patient') && blog.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view this blog',
      });
    }

    if (userInfo && isDoctor && blog.status !== 'approved' && !isAuthor) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view this blog',
      });
    }

    // Increment view count only after authorization passes
    await Blog.updateOne({ _id: id }, { $inc: { views: 1 } });
    blog.views = (blog.views || 0) + 1;

    // Translate title + content for the requesting patient (single view)
    let responseData = blog.toObject ? blog.toObject() : blog;

    if (!isDoctor) {
      const lang = await getPatientLanguage(userInfo?.userId);
      if (lang === 'ur') {
        const translated = await getOrCreateTranslation(
          'Blog',
          blog._id,
          { title: responseData.title, content: responseData.content },
          lang
        );
        responseData = {
          ...responseData,
          title: translated.title ?? responseData.title,
          content: translated.content ?? responseData.content,
        };
      }
    }

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blog',
    });
  }
});

/**
 * POST /api/blogs/:id/rate
 * Rate a blog (1-5)
 */
router.post('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid blog ID' });
    }
    const { rating } = req.body;

    const numericRating = Number(rating);
    if (!numericRating || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a number between 1 and 5',
      });
    }

    const blog = await Blog.findByIdAndUpdate(
      id,
      [
        {
          $set: {
            ratingCount: { $add: [{ $ifNull: ['$ratingCount', 0] }, 1] },
            rating: {
              $round: [
                {
                  $divide: [
                    { $add: [{ $multiply: [{ $ifNull: ['$rating', 0] }, { $ifNull: ['$ratingCount', 0] }] }, numericRating] },
                    { $add: [{ $ifNull: ['$ratingCount', 0] }, 1] },
                  ],
                },
                2,
              ],
            },
          },
        },
      ],
      { new: true }
    );
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    res.json({
      success: true,
      data: {
        rating: blog.rating,
        ratingCount: blog.ratingCount,
      },
    });
  } catch (error) {
    console.error('Error rating blog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit rating',
    });
  }
});

module.exports = router;

