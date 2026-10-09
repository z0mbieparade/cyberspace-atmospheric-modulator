// =====================================================
// PASSPHRASE ENCRYPTION
// =====================================================
// Text locked with a key made from a passphrase, with the browser's own Web
// Crypto: PBKDF2-SHA-256 (OWASP's 600,000 iterations) over a random salt,
// then AES-256-GCM, which also refuses text that was changed. The text is
// gzipped first, so a locked copy is often smaller than the plain one.
//
// A locked text is base64 of: a format byte, the salt, the IV, the
// ciphertext. The salt travels with it, so the passphrase alone opens it
// anywhere. The format byte is authenticated too (GCM's additional data),
// so it cannot be swapped to have the text read another way.
//
// A key can be kept (exportTextKey) and used again (importTextKey) without
// the passphrase: whoever reads a kept key can open what it locked, but
// does not learn a passphrase they may have used elsewhere. Each lock draws
// a fresh random IV, so one key can lock many times.

const PASSPHRASE_FORMAT = 1;
const PASSPHRASE_KDF_ITERATIONS = 600000;
const PASSPHRASE_SALT_BYTES = 16;
const PASSPHRASE_IV_BYTES = 12;
const PASSPHRASE_HEADER_BYTES = 1 + PASSPHRASE_SALT_BYTES + PASSPHRASE_IV_BYTES;

/**
 * A key that does not open a locked text: the wrong passphrase, or a text
 * that was changed. GCM cannot tell them apart.
 */
class WrongPassphraseError extends Error {}

/**
 * Make a key from a passphrase.
 * @param {string} passphrase
 * @param {Uint8Array} [salt] - a locked text's (lockedTextSalt), to open
 *   it; none for a new random one, to lock with
 * @returns {Promise<{salt: Uint8Array, key: CryptoKey}>}
 * @throws {TypeError} where the page has no Web Crypto (not https)
 */
async function deriveTextKey(passphrase, salt = randomBytes(PASSPHRASE_SALT_BYTES)) {
	const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
	const key = await crypto.subtle.deriveKey(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSPHRASE_KDF_ITERATIONS },
		// Extractable, so exportTextKey can keep it
		material, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
	return { salt, key };
}

/**
 * A key as text, to keep.
 * @param {{salt: Uint8Array, key: CryptoKey}} textKey
 * @returns {Promise<{salt: string, key: string}>} base64
 * @throws {TypeError} where the page has no Web Crypto
 */
async function exportTextKey({ salt, key }) {
	return { salt: bytesToBase64(salt), key: bytesToBase64(ownBytes(await crypto.subtle.exportKey('raw', key))) };
}

/**
 * A kept key, ready to use.
 * @param {*} kept - from exportTextKey
 * @returns {Promise<{salt: Uint8Array, key: CryptoKey}|null>} null when it
 *   is not a key
 */
async function importTextKey(kept) {
	try {
		const salt = base64ToBytes(kept.salt);
		// Extractable, so it can be kept again after each save
		const key = await crypto.subtle.importKey('raw', base64ToBytes(kept.key), 'AES-GCM', true, ['encrypt', 'decrypt']);
		return salt.length === PASSPHRASE_SALT_BYTES ? { salt, key } : null;
	} catch (e) {
		// Not a key, or the browser refused it: the user types the passphrase
		console.error(LOG_PREFIX + ' Could not use a kept key:', e);
		return null;
	}
}

/**
 * Lock text.
 * @param {string} text
 * @param {{salt: Uint8Array, key: CryptoKey}} textKey - from deriveTextKey
 *   or importTextKey
 * @returns {Promise<string>} base64
 * @throws {TypeError} where the page has no Web Crypto or CompressionStream
 */
async function encryptText(text, { salt, key }) {
	const iv = randomBytes(PASSPHRASE_IV_BYTES);
	const packed = await pipeBytes(new TextEncoder().encode(text), new CompressionStream('gzip'));
	const ciphertext = ownBytes(await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: new Uint8Array([PASSPHRASE_FORMAT]) }, key, packed));
	const out = new Uint8Array(PASSPHRASE_HEADER_BYTES + ciphertext.length);
	out.set([PASSPHRASE_FORMAT], 0);
	out.set(salt, 1);
	out.set(iv, 1 + PASSPHRASE_SALT_BYTES);
	out.set(ciphertext, PASSPHRASE_HEADER_BYTES);
	return bytesToBase64(out);
}

/**
 * The parts of a locked text.
 * @param {string} locked - base64
 * @returns {{salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array}}
 * @throws {Error} when it is not one this version can open; the message is
 *   for the user
 */
function lockedTextParts(locked) {
	let bytes;
	try {
		bytes = base64ToBytes(locked.replace(/\s+/g, ''));
	} catch (e) {
		throw new Error('The locked text is damaged.');
	}
	if (bytes.length <= PASSPHRASE_HEADER_BYTES || bytes[0] !== PASSPHRASE_FORMAT) throw new Error('The locked text is damaged, or from a newer version.');
	return {
		salt: bytes.subarray(1, 1 + PASSPHRASE_SALT_BYTES),
		iv: bytes.subarray(1 + PASSPHRASE_SALT_BYTES, PASSPHRASE_HEADER_BYTES),
		ciphertext: bytes.subarray(PASSPHRASE_HEADER_BYTES),
	};
}

/**
 * The salt a locked text's key was made with: a passphrase makes that key
 * again with it (deriveTextKey), and a kept key with another salt is not it.
 * @param {string} locked - base64
 * @returns {Uint8Array}
 * @throws {Error} as lockedTextParts
 */
function lockedTextSalt(locked) {
	return lockedTextParts(locked).salt;
}

/**
 * Open a locked text.
 * @param {string} locked - base64, from encryptText
 * @param {{salt: Uint8Array, key: CryptoKey}} textKey
 * @returns {Promise<string>}
 * @throws {WrongPassphraseError} when the key does not open it, or it was
 *   changed
 * @throws {Error} when it is damaged or from a newer version; messages are
 *   for the user
 */
async function decryptText(locked, { key }) {
	const { iv, ciphertext } = lockedTextParts(locked);
	let packed;
	try {
		packed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new Uint8Array([PASSPHRASE_FORMAT]) }, key, ciphertext);
	} catch (e) {
		throw new WrongPassphraseError('That passphrase does not open it, or it was changed.');
	}
	try {
		return new TextDecoder().decode(await pipeBytes(ownBytes(packed), new DecompressionStream('gzip')));
	} catch (e) {
		// Authenticated, so made by this code: only a bug gets here
		throw new Error('The locked text opened, but is damaged.');
	}
}

/**
 * Whether two salts are the same, so one key opens what the other locked.
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
function sameSalt(a, b) {
	return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/**
 * Bytes run through a compression or decompression stream.
 * @param {Uint8Array} bytes
 * @param {CompressionStream|DecompressionStream} stream
 * @returns {Promise<Uint8Array>}
 * @throws {TypeError} when the bytes are not what the stream expects
 */
async function pipeBytes(bytes, stream) {
	const piped = new Response(bytes).body.pipeThrough(stream);
	return ownBytes(await new Response(piped).arrayBuffer());
}

/**
 * A copy, in this script's own memory, of bytes the page's objects made.
 * In a sandboxed userscript (Greasemonkey 4 on Firefox) crypto.subtle and
 * Response belong to the page: a Uint8Array over their buffer is the
 * page's too, and its subarray() reads a constructor the sandbox may not,
 * failing with "Permission denied to access property constructor".
 * Copying with set() reads only the bytes.
 * @param {ArrayBuffer} buffer
 * @returns {Uint8Array}
 */
function ownBytes(buffer) {
	const view = new Uint8Array(buffer);
	const copy = new Uint8Array(view.length);
	copy.set(view);
	return copy;
}

/**
 * Random bytes, in this script's own array: getRandomValues fills the one
 * it is given, and what it returns may be the page's wrapper of it.
 * @param {number} length
 * @returns {Uint8Array}
 */
function randomBytes(length) {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

/**
 * Bytes as base64, in slices: spreading a long array into one call
 * overflows the stack.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/**
 * base64 as bytes.
 * @param {string} text
 * @returns {Uint8Array}
 * @throws {DOMException} when it is not base64
 */
function base64ToBytes(text) {
	return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}
