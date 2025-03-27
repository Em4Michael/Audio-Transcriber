const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

// Load .env file
dotenv.config();

// Read the original background.js
const backgroundPath = path.join(__dirname, 'background.js');
let content = fs.readFileSync(backgroundPath, 'utf8');

// Replace the placeholder with the actual API key
content = content.replace('__OPENAI_API_KEY__', JSON.stringify(process.env.OPENAI_API_KEY));

// Write the modified content to a temporary file
const tempPath = path.join(__dirname, 'background.temp.js');
fs.writeFileSync(tempPath, content);

console.log('Environment variables injected into background.temp.js');