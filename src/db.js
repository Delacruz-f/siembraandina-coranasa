const knex = require('knex');
const cfg = require('../knexfile');
module.exports = knex(cfg[process.env.NODE_ENV || 'development']);
