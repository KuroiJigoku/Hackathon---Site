#!/usr/bin/env node
/*
Generates an Argon2 hash for an admin password and a secure JWT secret.

Usage:
  node scripts/generate_secrets.mjs          # prompts for password
  node scripts/generate_secrets.mjs --pass mypassword --write   # non-interactive, writes to .env

Note: ensure project dependencies are installed (`npm install`) so `argon2` is available.
*/

import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import fs from 'fs';

function base64url(buf){
  return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function prompt(question){
  return new Promise((res) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', function(data){
      process.stdin.pause();
      res(data.toString().trim());
    });
  });
}

async function main(){
  const args = process.argv.slice(2);
  let passArg = null;
  let writeEnv = false;
  for(let i=0;i<args.length;i++){
    if(args[i] === '--pass' && args[i+1]){ passArg = args[i+1]; i++; }
    if(args[i] === '--write') writeEnv = true;
  }

  let password = passArg;
  if(!password){
    password = await prompt('Enter admin password (input hidden not supported here): ');
    if(!password){
      console.error('No password provided, aborting.');
      process.exit(1);
    }
  }

  try{
    // Use argon2id with recommended parameters (defaults are safe)
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const secret = base64url(randomBytes(32));

    console.log('\n--- Generated values ---');
    console.log('ADMIN_PASS_HASH=' + hash);
    console.log('JWT_SECRET=' + secret);
    console.log('------------------------\n');

    if(writeEnv){
      const envPath = '.env';
      let contents = '';
      if(fs.existsSync(envPath)) contents = fs.readFileSync(envPath,'utf8');
      // replace or append
      const setOrReplace = (key, value, src) => {
        const re = new RegExp('^' + key + '=.*$', 'm');
        if(re.test(src)) return src.replace(re, `${key}=${value}`);
        return src + (src && !src.endsWith('\n') ? '\n' : '') + `${key}=${value}\n`;
      };
      contents = setOrReplace('ADMIN_PASS_HASH', hash, contents);
      contents = setOrReplace('JWT_SECRET', secret, contents);
      fs.writeFileSync(envPath, contents, 'utf8');
      console.log('.env updated with new values (ADMIN_PASS_HASH and JWT_SECRET)');
    }
  } catch(err){
    console.error('Error generating secrets:', err);
    process.exit(1);
  }
}

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}
