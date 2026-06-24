// Picks the data store automatically:
//   - DATABASE_URL set  -> PostgreSQL (cloud / production, persists forever)
//   - otherwise         -> SQLite file (local dev, zero-config)
// Both expose the same async interface, so server.js is identical either way.
const store = process.env.DATABASE_URL ? require("./db.pg") : require("./db.sqlite");
console.log(`Data store: ${store.kind}`);
module.exports = store;
