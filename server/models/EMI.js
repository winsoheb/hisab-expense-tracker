const mongoose = require('mongoose');
const emiSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    docId: { type: String }, // For migration/sync lookup
    label: { type: String, required: true },
    principal: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    tenure: { type: Number, required: true },
    monthlyEmi: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    startDate: { type: String, required: true },
    isActive: { type: Boolean, default: true }
});
module.exports = mongoose.model('EMI', emiSchema);
