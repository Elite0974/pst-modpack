const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoDir = "D:\\pst-modpack-repo\\pst-modpack";
const serversRootDir = path.join(repoDir, "servers");
const baseFile = path.join(repoDir, "distribution.base.json");
const outFile = path.join(repoDir, "distribution.json");
const rawBaseUrl =
  "https://raw.githubusercontent.com/Elite0974/pst-modpack/main";

// Valores por defecto cuando se detecta una carpeta nueva en servers/
const DEFAULT_MC_VERSION = "1.20.1";
const DEFAULT_SERVER_VERSION = "1.0.0";
const DEFAULT_ADDRESS = "localhost:25565";

if (!fs.existsSync(baseFile)) {
  console.error("Error: no se encontró distribution.base.json en:", baseFile);
  process.exit(1);
}

if (!fs.existsSync(serversRootDir)) {
  console.error("Error: no se encontró la carpeta servers en:", serversRootDir);
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

function createDefaultServerEntry(folderId, isFirst) {
  return {
    id: folderId,
    name: `${folderId} (Minecraft ${DEFAULT_MC_VERSION})`,
    description: `Instancia ${folderId}`,
    icon: `${rawBaseUrl}/icons/${encodeURIComponent(folderId.toLowerCase())}.png`,
    version: DEFAULT_SERVER_VERSION,
    address: DEFAULT_ADDRESS,
    minecraftVersion: DEFAULT_MC_VERSION,
    mainServer: isFirst,
    autoconnect: false,
    modules: []
  };
}

async function syncServerModules(server) {
  const serverId = server.id;
  const serverDir = path.join(serversRootDir, serverId);
  const forgeModsDir = path.join(serverDir, "forgemods", "required");
  const filesRootDir = path.join(serverDir, "files");

  // Limpia solo módulos generados previamente para este servidor
  server.modules = (server.modules || []).filter(
    (m) =>
      typeof m.id === "string" &&
      !m.id.startsWith(`generated.forgemod:${serverId}:`) &&
      !m.id.startsWith(`generated.file:${serverId}:`)
  );

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
        url: `${rawBaseUrl}/servers/${encodeURIComponent(serverId)}/forgemods/required/${encodeURIComponent(file)}`,
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
        url: `${rawBaseUrl}/servers/${encodeURIComponent(serverId)}/files/${encodedUrlPath}`,
        MD5: md5
      }
    });
  }

  return {
    serverId,
    modsCount: forgeJars.length,
    filesCount: extraFiles.length
  };
}

async function main() {
  const rawBase = fs.readFileSync(baseFile, "utf8");
  const dist = JSON.parse(rawBase);

  if (!Array.isArray(dist.servers)) {
    dist.servers = [];
  }

  // Detecta todas las carpetas dentro de servers/ (excluyendo ocultas)
  const detectedFolders = fs
    .readdirSync(serversRootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);

  if (detectedFolders.length === 0) {
    console.error("Error: no se encontraron carpetas de instancias en:", serversRootDir);
    process.exit(1);
  }

  // Mantiene solo las instancias cuya carpeta existe en servers/
  const existingMap = new Map(dist.servers.map((s) => [s.id, s]));
  const finalServers = [];

  for (let i = 0; i < detectedFolders.length; i++) {
    const folderId = detectedFolders[i];
    if (existingMap.has(folderId)) {
      finalServers.push(existingMap.get(folderId));
    } else {
      finalServers.push(createDefaultServerEntry(folderId, i === 0));
      console.log(`Nueva instancia detectada automáticamente: ${folderId}`);
    }
  }

  dist.servers = finalServers;

  // Asegura exactamente un mainServer
  const mainCount = dist.servers.filter((s) => s.mainServer === true).length;
  if (mainCount === 0) {
    dist.servers[0].mainServer = true;
  } else if (mainCount > 1) {
    let seenMain = false;
    for (const s of dist.servers) {
      if (s.mainServer === true && !seenMain) {
        seenMain = true;
      } else {
        s.mainServer = false;
      }
    }
  }

  const summaries = [];
  for (const server of dist.servers) {
    const summary = await syncServerModules(server);
    summaries.push(summary);
  }

  fs.writeFileSync(outFile, JSON.stringify(dist, null, 2), "utf8");

  for (const s of summaries) {
    console.log(
      `[${s.serverId}]: ${s.modsCount} mods y ${s.filesCount} archivos sincronizados.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});