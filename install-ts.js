const url = 'https://registry.npmjs.org/typescript/-/typescript-5.7.3.tgz';
const dest = './node_modules/typescript';
const https = require('https');
const fs = require('fs');
const zlib = require('zlib');
const tar = require('tar');

https.get(url, (res) => {
  if (res.statusCode === 302 || res.statusCode === 301) {
    https.get(res.headers.location, handleResponse);
  } else {
    handleResponse(res);
  }
});

function handleResponse(res) {
  const extract = tar.x({ cwd: dest, strip: 1 });
  res.pipe(zlib.createGunzip()).pipe(extract);
  extract.on('finish', () => {
    console.log('TypeScript installed!');
  });
}
