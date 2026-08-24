// scripts/generate-vapid.js — Gera o par de chaves VAPID para push.
// Uso: npm run keys
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('\nCopie estas chaves para o seu arquivo .env:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('\n');
