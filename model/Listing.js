const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema({
        orPartyNames: {
            type: String,
            required: true,
            unique: true
        },
        eePartyNames: {
            type: String,
            required: true,
            unique: true
        },
        townNames: { type: String },
        docDate: { type: Date }
    });

const Listing = mongoose.model("Knox_Probates", listingSchema);
module.exports = Listing;