import expect from "expect.js";
import { Keychain } from "../password-manager.js";

describe("Password manager", async function () {
  this.timeout(5000);
  const password = "password123!";
  const kvs = {
    service1: "value1",
    service2: "value2",
    service3: "value3",
  };

  describe("functionality", async function () {
    it("inits without an error", async function () {
      await Keychain.init(password);
    });

    it("can set and retrieve a password", async function () {
      const keychain = await Keychain.init(password);
      const url = "www.stanford.edu";
      const pw = "sunetpassword";
      await keychain.set(url, pw);
      expect(await keychain.get(url)).to.equal(pw);
    });

    it("can set and retrieve multiple passwords", async function () {
      const keychain = await Keychain.init(password);
      for (const k in kvs) {
        await keychain.set(k, kvs[k]);
      }
      for (const k in kvs) {
        expect(await keychain.get(k)).to.equal(kvs[k]);
      }
    });

    it("returns null for non-existent passwords", async function () {
      const keychain = await Keychain.init(password);
      for (const k in kvs) {
        await keychain.set(k, kvs[k]);
      }
      expect(await keychain.get("www.stanford.edu")).to.be(null);
    });

    it("can remove a password", async function () {
      const keychain = await Keychain.init(password);
      for (const k in kvs) {
        await keychain.set(k, kvs[k]);
      }
      expect(await keychain.remove("service1")).to.be(true);
      expect(await keychain.get("service1")).to.be(null);
    });

    it("returns false if there is no password for the domain being removed", async function () {
      const keychain = await Keychain.init(password);
      for (const k in kvs) {
        await keychain.set(k, kvs[k]);
      }
      expect(await keychain.remove("www.stanford.edu")).to.be(false);
    });

    it("can dump and restore the database", async function () {
      const keychain = await Keychain.init(password);
      for (const k in kvs) {
        await keychain.set(k, kvs[k]);
      }
      const [contents, checksum] = await keychain.dump();
      const restoredKeychain = await Keychain.load(password, contents, checksum);
      for (const k in kvs) {
        expect(await restoredKeychain.get(k)).to.equal(kvs[k]);
      }
    });

    it("fails to restore the database if checksum is wrong", async function () {
      const keychain = await Keychain.init(password);
      for (const k in kvs) {
        await keychain.set(k, kvs[k]);
      }
      const [contents] = await keychain.dump();
      const fakeChecksum = "3GB6WSm+j+jl8pm4Vo9b9CkO2tZJzChu34VeitrwxXM=";
      await expect(Keychain.load(password, contents, fakeChecksum)).to.be.rejected;
    });

    it("returns false if trying to load with an incorrect password", async function () {
      const keychain = await Keychain.init(password);
      for (const k in kvs) {
        await keychain.set(k, kvs[k]);
      }
      const [contents, checksum] = await keychain.dump();
      await expect(Keychain.load("fakepassword", contents, checksum)).to.be.rejected;
    });
  });

  describe("security", async function () {
    it("doesn't store domain names and passwords in the clear", async function () {
      const keychain = await Keychain.init(password);
      const url = "www.stanford.edu";
      const pw = "sunetpassword";
      await keychain.set(url, pw);
      const [contents] = await keychain.dump();
      expect(contents).not.to.contain(password);
      expect(contents).not.to.contain(url);
      expect(contents).not.to.contain(pw);
    });

    it("includes a kvs object in the serialized dump", async function () {
      const keychain = await Keychain.init(password);
      for (let i = 0; i < 10; i++) {
        await keychain.set(String(i), String(i));
      }
      const [contents] = await keychain.dump();
      const contentsObj = JSON.parse(contents);
      expect(contentsObj).to.have.key("kvs");
      expect(contentsObj.kvs).to.be.an("object");
      expect(Object.getOwnPropertyNames(contentsObj.kvs)).to.have.length(10);
    });
  });
});
