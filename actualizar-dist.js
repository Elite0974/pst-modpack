const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoDir = "D:\\pst-modpack-repo\\pst-modpack";
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

  for (const server of dist.servers) {
    const serverId = server.id;
    const serverDir = path.join(repoDir, "servers", serverId);
    const forgeModsDir = path.join(serverDir, "forgemods", "required");
    const filesRootDir = path.join(serverDir, "files");

    const forgeJars = fs.existsSync(forgeModsDir)
      ? fs.readdirSync(forgeModsDir).filter((f) => f.toLowerCase().endsWith(".jar"))
      : [];

    for (const file of forgeJars) {
      const fullPath = path.join(forgeModsDir, file);
      const { size, md5 } = await getFileInfo(fullPath);
      const baseName = path.basename(file, ".jar");

      server.modules.push({
        id: `generated.forgemod:${serverId}:${baseName}@jar`,
        name: baseName,
        type: "ForgeMod",
        artifact: {
          size,
          url: `https://raw.githubusercontent.com/Elite0974/pst-modpack/main/servers/${encodeURIComponent(serverId)}/forgemods/required/${encodeURIComponent(file)}`,
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
        id: `generated.file:${serverId}:${relPath}`,
        name: relPath,
        type: "File",
        artifact: {
          size,
          path: relPath,
          url: `https://raw.githubusercontent.com/Elite0974/pst-modpack/main/servers/${encodeURIComponent(serverId)}/files/${encodedUrlPath}`,
          MD5: md5
        }
      });
    }

    console.log(`[${serverId}] ${forgeJars.length} mods de Forge y ${extraFiles.length} archivos en files/.`);
  }

  fs.writeFileSync(outFile, JSON.stringify(dist, null, 2), "utf8");
  console.log("Listo: distribution.json generado con todas las instancias.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});