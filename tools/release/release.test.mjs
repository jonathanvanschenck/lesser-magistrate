// node --test tools/release/release.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compareVersions, nextVersion, readVersion, updateTable, writeVersion } from "./release.mjs";

test("nextVersion bumps each level and takes an exact version", () => {
    assert.equal(nextVersion("1.2.3", "patch"), "1.2.4");
    assert.equal(nextVersion("1.2.3", "minor"), "1.3.0");
    assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
    assert.equal(nextVersion("1.2.3", "1.4.0"), "1.4.0");
    assert.throws(() => nextVersion("1.2.3", "bigger"), /isn't major, minor, patch/);
    assert.throws(() => nextVersion("v1", "patch"), /isn't x.y.z/);
});

test("compareVersions orders numerically, not as text", () => {
    assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
    assert.ok(compareVersions("1.0.0", "1.0.1") < 0);
    assert.equal(compareVersions("2.0.0", "2.0.0"), 0);
});

test("writeVersion changes only VERSION in a real project file", () => {
    const pro = readFileSync(new URL("../../kicad/lm/lm.kicad_pro", import.meta.url), "utf8");
    const out = writeVersion(pro, "9.8.7");
    assert.equal(readVersion(out), "9.8.7");
    assert.equal(out.replace("9.8.7", readVersion(pro)), pro);
    assert.throws(() => writeVersion('{"text_variables": {}}', "1.0.0"), /no VERSION/);
});

test("updateTable replaces one board's row and nothing else", () => {
    const readme = readFileSync(new URL("../../gerber/README.md", import.meta.url), "utf8");
    const out = updateTable(readme, "lmm", "1.0.1", "KiCad (tag `lmm@1.0.1`)");
    const changed = out.split("\n").filter((l, i) => l !== readme.split("\n")[i]);
    assert.deepEqual(changed, ["| LMM | [LMMGerber.zip](./LMMGerber.zip) | 1.0.1 | KiCad (tag `lmm@1.0.1`) |"]);
    assert.throws(() => updateTable("no table", "lm", "1.0.0", "x"), /no <!-- BEGIN releases/);
});
