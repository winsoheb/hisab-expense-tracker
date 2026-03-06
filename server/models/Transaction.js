const mongoose = require('mongoose');
const transactionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    docId: { type: String }, // For migration/sync lookup
    type: { type: String, required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    mode: { type: String, required: true },
    date: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Transaction', transactionSchema);
