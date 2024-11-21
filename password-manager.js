"use strict";

/********* External Imports ********/
import {
  byteArrayToString,
  genRandomSalt,
  untypedToTypedArray,
  bufferToUntypedArray,
  stringToByteArray,
} from "./lib.js";

// Detect the environment and set `subtle` appropriately
const subtle = (typeof window !== "undefined" && window.crypto && window.crypto.subtle)
  ? window.crypto.subtle // Browser
  : (await import('crypto')).webcrypto.subtle; // Node.js

/********* Implementation ********/
export class Keychain {
  constructor() {
    this.data = {
      salt_master_key: null,
      salt_mac: null,
      salt_aes: null,
      password_sig: null,
      kvs_salts: {},
      kvs: {},
      version: "CS 255 Password Manager v1.0",
    };

    this.secrets = {
      mac_key: null,
      aes_key: null,
      kvs_hash: null,
    };

    this.ready = true;
  }

  static async keyDerivation(password) {
    const passwordBuffer = stringToByteArray(password);
    const salt_master_key = genRandomSalt();
    const salt_mac = genRandomSalt();
    const salt_aes = genRandomSalt();

    const key_material = await subtle.importKey(
      "raw",
      passwordBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const mac_key = await subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt_mac,
        iterations: Keychain.PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      key_material,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign", "verify"]
    );

    const aes_key = await subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt_aes,
        iterations: Keychain.PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      key_material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    return { salt_master_key, salt_mac, salt_aes, mac_key, aes_key };
  }

  static async init(password) {
    const key_data = await Keychain.keyDerivation(password);
    const keychain_instance = new Keychain();

    keychain_instance.secrets.mac_key = key_data.mac_key;
    keychain_instance.secrets.aes_key = key_data.aes_key;

    const kvsBuffer = stringToByteArray(JSON.stringify(keychain_instance.data.kvs));
    keychain_instance.secrets.kvs_hash = byteArrayToString(
      await subtle.digest("SHA-256", kvsBuffer)
    );

    keychain_instance.data.salt_master_key = key_data.salt_master_key;
    keychain_instance.data.salt_mac = key_data.salt_mac;
    keychain_instance.data.salt_aes = key_data.salt_aes;

    const passwordBuffer = stringToByteArray(password);
    keychain_instance.data.password_sig = byteArrayToString(
      await subtle.sign({ name: "HMAC" }, key_data.mac_key, passwordBuffer)
    );

    return keychain_instance;
  }

  async dump() {
    if (!this.ready) return null;

    const serialized = JSON.stringify(this.data);
    const serializedBuffer = stringToByteArray(serialized);
    const checksum = byteArrayToString(
      await subtle.digest("SHA-256", serializedBuffer)
    );

    return [serialized, checksum];
  }

  async get(name) {
    if (!this.ready) throw new Error("Keychain not initialized");

    const kvsBuffer = stringToByteArray(JSON.stringify(this.data.kvs));
    const new_kvs_hash = byteArrayToString(await subtle.digest("SHA-256", kvsBuffer));
    if (new_kvs_hash !== this.secrets.kvs_hash)
      throw new Error("Rollback tampering detected");

    const nameBuffer = stringToByteArray(name);
    const encrypted_domain = byteArrayToString(
      await subtle.sign({ name: "HMAC" }, this.secrets.mac_key, nameBuffer)
    );

    if (!(encrypted_domain in this.data.kvs)) return null;

    const encrypted_password = untypedToTypedArray(this.data.kvs[encrypted_domain]);
    const decrypted_password = await subtle.decrypt(
      { name: "AES-GCM", iv: this.data.kvs_salts[encrypted_domain], additionalData: nameBuffer },
      this.secrets.aes_key,
      encrypted_password
    );

    return Keychain.unpad(byteArrayToString(decrypted_password));
  }

  async set(name, value) {
    if (!this.ready) throw new Error("Keychain not initialized");

    const kvsBuffer = stringToByteArray(JSON.stringify(this.data.kvs));
    const new_kvs_hash = byteArrayToString(await subtle.digest("SHA-256", kvsBuffer));
    if (new_kvs_hash !== this.secrets.kvs_hash)
      throw new Error("Rollback tampering detected");

    const password_salt = genRandomSalt(12);
    const nameBuffer = stringToByteArray(name);
    const paddedValueBuffer = stringToByteArray(Keychain.pad(value, 64, "\0"));

    const encrypted_password = bufferToUntypedArray(
      await subtle.encrypt(
        { name: "AES-GCM", iv: password_salt, additionalData: nameBuffer },
        this.secrets.aes_key,
        paddedValueBuffer
      )
    );

    const encrypted_domain = byteArrayToString(
      await subtle.sign({ name: "HMAC" }, this.secrets.mac_key, nameBuffer)
    );

    this.data.kvs[encrypted_domain] = encrypted_password;
    this.data.kvs_salts[encrypted_domain] = password_salt;

    this.secrets.kvs_hash = byteArrayToString(
      await subtle.digest("SHA-256", stringToByteArray(JSON.stringify(this.data.kvs)))
    );
  }

  async remove(name) {
    if (!this.ready) throw new Error("Keychain not initialized");

    const nameBuffer = stringToByteArray(name);
    const encrypted_domain = byteArrayToString(
      await subtle.sign({ name: "HMAC" }, this.secrets.mac_key, nameBuffer)
    );

    if (!(encrypted_domain in this.data.kvs)) return false;

    delete this.data.kvs[encrypted_domain];
    delete this.data.kvs_salts[encrypted_domain];

    const kvsBuffer = stringToByteArray(JSON.stringify(this.data.kvs));
    this.secrets.kvs_hash = byteArrayToString(await subtle.digest("SHA-256", kvsBuffer));

    return true;
  }

  static async load(password, repr, trustedDataCheck) {
    const reprBuffer = stringToByteArray(repr);

    if (trustedDataCheck) {
      const checksum = byteArrayToString(await subtle.digest("SHA-256", reprBuffer));
      if (checksum !== trustedDataCheck) {
        throw new Error("trustedDataCheck integrity test failed in load()");
      }
    }

    const password_manager = JSON.parse(repr);

    const passwordBuffer = stringToByteArray(password);

    const key_material = await subtle.importKey(
      "raw",
      passwordBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const mac_key = await subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: untypedToTypedArray(password_manager.salt_mac),
        iterations: Keychain.PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      key_material,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign", "verify"]
    );

    const aes_key = await subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: untypedToTypedArray(password_manager.salt_aes),
        iterations: Keychain.PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      key_material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    const generatedPasswordSig = byteArrayToString(
      await subtle.sign({ name: "HMAC" }, mac_key, passwordBuffer)
    );

    if (generatedPasswordSig !== password_manager.password_sig) {
      throw new Error("Invalid password provided for loading keychain");
    }

    const keychain_instance = new Keychain();
    keychain_instance.data = password_manager;
    keychain_instance.secrets.mac_key = mac_key;
    keychain_instance.secrets.aes_key = aes_key;
    keychain_instance.secrets.kvs_hash = byteArrayToString(
      await subtle.digest("SHA-256", stringToByteArray(JSON.stringify(keychain_instance.data.kvs)))
    );

    return keychain_instance;
  }

  static pad(value, n, padChar) {
    let padded = value + "1";
    while (padded.length < n) padded += padChar;
    return padded;
  }

  static unpad(value) {
    return value.replace(/1[\0]*$/, "");
  }
}

Keychain.PBKDF2_ITERATIONS = 100000;
