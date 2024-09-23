import fs from "node:fs/promises";

const buf = await fs.readFile("./tmp.zip");
const bytes = new Uint8Array(buf);

const hex = await fs.readFile("./tmp.zip", { encoding: "hex" });
const signatures = hex.split("504b");

const endOfCentralDirectory = signatures.find((sig) => sig.startsWith("0506"));

console.log(signatures);
