#!/usr/bin/env node
/**
 * scripts/mint-token.mjs
 * Mint a demo JWT for the mock (signed with the MOCK config secret).
 *
 *   npm run token                        # token for demo@ethernity.com
 *   npm run token -- -e someone@x.com    # custom email
 *
 * The email only has to match a registered mock user for protected routes.
 */
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';

const args = process.argv.slice(2);
let email = 'demo@ethernity.com';
const idx = args.indexOf('-e');
if (idx !== -1 && args[idx + 1]) email = args[idx + 1];

const token = jwt.sign(
  { sub: email },
  config.jwtSecret,
  { algorithm: config.jwtAlgorithm, expiresIn: '365d' }
);

console.log('email :', email);
console.log('token :');
console.log(token);