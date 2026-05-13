const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate PDF invoice for a transaction
 * @param {Object} invoiceData - Invoice data
 * @param {string} outputPath - Optional output path (if not provided, returns buffer)
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function generateInvoicePDF(invoiceData, outputPath = null) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];
      
      // Collect PDF data
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        if (outputPath) {
          fs.writeFileSync(outputPath, pdfBuffer);
        }
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(24)
         .fillColor('#474747')
         .text('TABEEB', 50, 50, { align: 'left' });
      
      doc.fontSize(10)
         .fillColor('#616161')
         .text('Medical Appointment Invoice', 50, 80);

      // Invoice Details
      doc.fontSize(16)
         .fillColor('#212121')
         .text('INVOICE', 50, 120);

      // Invoice Number and Date
      doc.fontSize(10)
         .fillColor('#616161')
         .text(`Invoice #: ${invoiceData.paymentIntentId}`, 400, 120, { align: 'right' })
         .text(`Date: ${formatDate(invoiceData.createdAt)}`, 400, 135, { align: 'right' });

      // Line
      doc.moveTo(50, 160)
         .lineTo(550, 160)
         .strokeColor('#E0E0E0')
         .lineWidth(1)
         .stroke();

      // Patient Information
      let yPos = 180;
      doc.fontSize(12)
         .fillColor('#212121')
         .text('Bill To:', 50, yPos);
      
      doc.fontSize(10)
         .fillColor('#616161')
         .text(invoiceData.patientName || 'Patient', 50, yPos + 20)
         .text(invoiceData.patientEmail || '', 50, yPos + 35);

      // Doctor Information
      doc.fontSize(12)
         .fillColor('#212121')
         .text('Service Provider:', 300, yPos);
      
      doc.fontSize(10)
         .fillColor('#616161')
         .text(invoiceData.doctorName || 'Doctor', 300, yPos + 20)
         .text(invoiceData.doctorSpecialization || '', 300, yPos + 35);

      // Appointment Details
      yPos = 280;
      doc.fontSize(12)
         .fillColor('#212121')
         .text('Appointment Details:', 50, yPos);
      
      doc.fontSize(10)
         .fillColor('#616161')
         .text(`Date: ${formatDate(invoiceData.appointmentDate)}`, 50, yPos + 20)
         .text(`Time: ${invoiceData.appointmentTime}`, 50, yPos + 35)
         .text(`Type: ${invoiceData.appointmentType || 'In-Person'}`, 50, yPos + 50);

      // Billing Breakdown
      yPos = 380;
      doc.fontSize(12)
         .fillColor('#212121')
         .text('Billing Breakdown', 50, yPos);

      // Table Header
      doc.fontSize(10)
         .fillColor('#616161')
         .text('Description', 50, yPos + 25)
         .text('Amount', 450, yPos + 25, { align: 'right' });

      doc.moveTo(50, yPos + 40)
         .lineTo(550, yPos + 40)
         .strokeColor('#E0E0E0')
         .lineWidth(1)
         .stroke();

      // Items
      let itemY = yPos + 50;
      const items = [
        { description: 'Consultation Fee', amount: invoiceData.billingBreakdown.consultationFee },
        { description: 'Service Fee', amount: invoiceData.billingBreakdown.serviceFee },
        { description: 'Tax', amount: invoiceData.billingBreakdown.tax },
      ];

      items.forEach(item => {
        doc.fontSize(10)
           .fillColor('#212121')
           .text(item.description, 50, itemY)
           .text(`$${item.amount.toFixed(2)}`, 450, itemY, { align: 'right' });
        itemY += 20;
      });

      // Total
      itemY += 10;
      doc.moveTo(50, itemY)
         .lineTo(550, itemY)
         .strokeColor('#E0E0E0')
         .lineWidth(1)
         .stroke();

      itemY += 15;
      doc.fontSize(14)
         .fillColor('#212121')
         .font('Helvetica-Bold')
         .text('Total', 50, itemY)
         .text(`$${invoiceData.amount.toFixed(2)}`, 450, itemY, { align: 'right' });

      // Payment Information
      itemY += 50;
      doc.fontSize(12)
         .fillColor('#212121')
         .font('Helvetica')
         .text('Payment Information', 50, itemY);

      doc.fontSize(10)
         .fillColor('#616161')
         .text(`Payment Method: ${formatPaymentMethod(invoiceData.paymentMethod)}`, 50, itemY + 20)
         .text(`Transaction ID: ${invoiceData.paymentIntentId}`, 50, itemY + 35)
         .text(`Status: ${invoiceData.status.toUpperCase()}`, 50, itemY + 50);

      // Footer
      const footerY = 750;
      doc.fontSize(8)
         .fillColor('#9E9E9E')
         .text('Thank you for choosing Tabeeb!', 50, footerY, { align: 'center', width: 500 })
         .text('This is an automated invoice. For questions, please contact support.', 50, footerY + 15, { align: 'center', width: 500 });

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Format date for invoice
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format payment method for display
 */
function formatPaymentMethod(paymentMethod) {
  if (!paymentMethod) return 'Card';
  if (paymentMethod.card) {
    const brand = paymentMethod.card.brand || 'Card';
    const last4 = paymentMethod.card.last4 || '****';
    return `${brand.charAt(0).toUpperCase() + brand.slice(1)} ending in ${last4}`;
  }
  return paymentMethod.type || 'Card';
}

module.exports = {
  generateInvoicePDF,
};

