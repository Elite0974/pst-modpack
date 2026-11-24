const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoDir = "D:\\pst-modpack-repo\\pst-modpack";
const serversRootDir = path.join(repoDir, "servers");
const baseFile = path.join(repoDir, "distribution.base.json");
const outFile = path.join(repoDir, "distribution.json");

if (!fs.existsSync(baseFile)) {
  console.error("Error: no se encontró distribution.base.json en:", baseFile);
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
  // Lee siempre desde distribution.base.json como única fuente base
  const rawBase = fs.readFileSync(baseFile, "utf8");
  const dist = JSON.parse(rawBase);

  if (!Array.isArray(dist.servers) || dist.servers.length === 0) {
    console.error("Error: no hay ningún servidor base en distribution.base.json");
    process.exit(1);
  }

  // Clonamos el primer servidor como plantilla limpia para nuevas carpetas
  const baseTemplate = JSON.parse(JSON.stringify(dist.servers[0]));
  baseTemplate.modules = [];

  const folderServers = fs.existsSync(serversRootDir)
    ? fs
        .readdirSync(serversRootDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => d.name)
    : [];

  // Agrega carpetas nuevas de /servers si no están ya definidas en distribution.base.json
  for (const folderId of folderServers) {
    const existsInBase = dist.servers.some((s) => s.id === folderId);
    if (!existsInBase) {
      const newServer = JSON.parse(JSON.stringify(baseTemplate));
      newServer.id = folderId;
      newServer.name = `${folderId} (Minecraft ${baseTemplate.minecraftVersion || "1.20.1"})`;
      newServer.description = `Instancia ${folderId}`;
      newServer.version = "1.0.0";
      newServer.mainServer = false;
      newServer.autoconnect = false;
      dist.servers.push(newServer);
      console.log(`[Nueva instancia] Se agregó "${folderId}" desde distribution.base.json.`);
    }
  }

  // Genera los módulos (mods y archivos) de cada servidor
  for (const server of dist.servers) {
    if (!Array.isArray(server.modules)) {
      server.modules = [];
    }

    const serverId = server.id;
    const serverDir = path.join(serversRootDir, serverId);
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
  console.log("Listo: distribution.json generado exclusivamente desde distribution.base.json.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});