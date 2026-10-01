const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customerName: String,
    foodItem: String,
    price: Number,
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);