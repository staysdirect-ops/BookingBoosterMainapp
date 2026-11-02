// PM2 settings for a 20i Node.js Optimised Managed Cloud Server.
// Copy to the site's document root next to package.json, and set cwd to that folder's full path.
module.exports = {
  apps: [{
    name: 'booking-booster.co.uk',
    cwd: __dirname,
    script: 'npm',
    args: 'start',
    env: { NODE_ENV: 'production' },
  }],
};
