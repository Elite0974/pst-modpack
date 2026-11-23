const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoDir = "D:\\pst-modpack-repo\\pst-modpack";
const serverDir = path.join(repoDir, "servers", "EventoPST-1.20.1");
const forgeModsDir = path.join(serverDir, "forgemods", "required");
const fabricModsDir = path.join(serverDir, "files", "mods");
const baseFile = path.join(repoDir, "distribution.base.json");
const outFile = path.join(repoDir, "distribution.json");

if (!fs.existsSync(baseFile)) {
  console.error("Falta distribution.base.json en:", baseFile);
  process.exit(1);
}

const dist = JSON.parse(fs.readFileSync(baseFile, "utf8"));
const server = dist.servers.find((s) => s.id === "EventoPST-1.20.1");

if (!server) {
  console.error("No se encontró el servidor EventoPST-1.20.1");
  process.exit(1);
}

// 1. Mods normales de Forge -> van a modstore
const forgeJars = fs.existsSync(forgeModsDir)
  ? fs.readdirSync(forgeModsDir).filter((f) => f.toLowerCase().endsWith(".jar"))
  : [];

for (const file of forgeJars) {
  const buffer = fs.readFileSync(path.join(forgeModsDir, file));
  const md5 = crypto.createHash("md5").update(buffer).digest("hex");
  const baseName = path.basename(file, ".jar");

  server.modules.push({
    id: `generated.forgemod:${baseName}@jar`,
    name: baseName,
    type: "ForgeMod",
    artifact: {
      size: buffer.length,
      url: `https://raw.githubusercontent.com/Elite0974/pst-modpack/main/servers/EventoPST-1.20.1/forgemods/required/${encodeURIComponent(file)}`,
      MD5: md5
    }
  });
}

// 2. Sinytra Connector y mods de Fabric -> van directo a instances/.../mods/
const fabricJars = fs.existsSync(fabricModsDir)
  ? fs.readdirSync(fabricModsDir).filter((f) => f.toLowerCase().endsWith(".jar"))
  : [];

for (const file of fabricJars) {
  const buffer = fs.readFileSync(path.join(fabricModsDir, file));
  const md5 = crypto.createHash("md5").update(buffer).digest("hex");
  const baseName = path.basename(file, ".jar");

  server.modules.push({
    id: `generated.file:${baseName}@jar`,
    name: baseName,
    type: "File",
    artifact: {
      size: buffer.length,
      path: `mods/${file}`,
      url: `https://raw.githubusercontent.com/Elite0974/pst-modpack/main/servers/EventoPST-1.20.1/files/mods/${encodeURIComponent(file)}`,
      MD5: md5
    }
  });
}

fs.writeFileSync(outFile, JSON.stringify(dist, null, 2), "utf8");
console.log(`Listo: ${forgeJars.length} mods de Forge y ${fabricJars.length} archivos en mods/ agregados.`);