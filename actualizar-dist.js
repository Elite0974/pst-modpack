const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoDir = "D:\\pst-modpack-repo\\pst-modpack";
const serverDir = path.join(repoDir, "servers", "EventoPST-1.20.1");
const forgeModsDir = path.join(serverDir, "forgemods", "required");
const filesRootDir = path.join(serverDir, "files");
const baseFile = path.join(repoDir, "distribution.base.json");
const outFile = path.join(repoDir, "distribution.json");

if (!fs.existsSync(baseFile)) {
  console.error("Falta distribution.base.json en:", baseFile);
  process.exit(1);
}

function getFileInfo(filePath) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size;
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve({ size, md5: hash.digest("hex") }));
    stream.on("error", reject);
  });
}

function walkFiles(currentDir, acc = []) {
  if (!fs.existsSync(currentDir)) return acc;
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(fullPath);
    }
  }
  return acc;
}

async function main() {
  const dist = JSON.parse(fs.readFileSync(baseFile, "utf8"));
  const server = dist.servers.find((s) => s.id === "EventoPST-1.20.1");

  if (!server) {
    console.error("No se encontró el servidor EventoPST-1.20.1");
    process.exit(1);
  }

  const forgeJars = fs.existsSync(forgeModsDir)
    ? fs.readdirSync(forgeModsDir).filter((f) => f.toLowerCase().endsWith(".jar"))
    : [];

  for (const file of forgeJars) {
    const fullPath = path.join(forgeModsDir, file);
    const { size, md5 } = await getFileInfo(fullPath);
    const baseName = path.basename(file, ".jar");

    server.modules.push({
      id: `generated.forgemod:${baseName}@jar`,
      name: baseName,
      type: "ForgeMod",
      artifact: {
        size,
        url: `https://raw.githubusercontent.com/Elite0974/pst-modpack/main/servers/EventoPST-1.20.1/forgemods/required/${encodeURIComponent(file)}`,
        MD5: md5
      }
    });
  }

  const extraFiles = walkFiles(filesRootDir);

  for (const fullPath of extraFiles) {
    const { size, md5 } = await getFileInfo(fullPath);
    const relPath = path.relative(filesRootDir, fullPath).split(path.sep).join("/");
    const encodedUrlPath = relPath.split("/").map(encodeURIComponent).join("/");

    server.modules.push({
      id: `generated.file:${relPath}`,
      name: relPath,
      type: "File",
      artifact: {
        size,
        path: relPath,
        url: `https://raw.githubusercontent.com/Elite0974/pst-modpack/main/servers/EventoPST-1.20.1/files/${encodedUrlPath}`,
        MD5: md5
      }
    });
  }

  fs.writeFileSync(outFile, JSON.stringify(dist, null, 2), "utf8");
  console.log(`Listo: ${forgeJars.length} mods de Forge y ${extraFiles.length} archivos en files/ agregados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});