const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(`${err.message} — ${req.method} ${req.originalUrl}`, { stack: err.stack });

  // Validation errors
  if (err.name === 'ValidationError')
    return res.status(400).json({ success: false, message: err.message });

  // DB duplicate key
  if (err.code === '23505')
    return res.status(409).json({ success: false, message: 'هذا السجل موجود مسبقاً' });

  // DB foreign key violation
  if (err.code === '23503')
    return res.status(400).json({ success: false, message: 'يوجد ارتباط بسجلات أخرى' });

  const status = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'حدث خطأ في الخادم'
    : err.message;

  res.status(status).json({ success: false, message });
};

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { errorHandler, AppError };
