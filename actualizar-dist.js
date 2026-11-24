const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoDir = "D:\\pst-modpack-repo\\pst-modpack";
const serversRootDir = path.join(repoDir, "servers");
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
  const templateServer = dist.servers[0];

  if (!templateServer) {
    console.error("No hay ningún servidor base en distribution.base.json");
    process.exit(1);
  }

  const folderServers = fs.existsSync(serversRootDir)
    ? fs
        .readdirSync(serversRootDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => d.name)
    : [];

  // Asegura que todas las carpetas dentro de /servers existan en dist.servers
  for (const folderId of folderServers) {
    let existing = dist.servers.find((s) => s.id === folderId);
    if (!existing) {
      existing = JSON.parse(JSON.stringify(templateServer));
      existing.id = folderId;
      existing.name = `${folderId} (Minecraft ${templateServer.minecraftVersion || "1.20.1"})`;
      existing.description = `Instancia ${folderId}`;
      existing.version = "1.0.0";
      existing.mainServer = false;
      existing.autoconnect = false;
      dist.servers.push(existing);
      console.log(`[Nueva instancia detectada] Se agregó "${folderId}" automáticamente.`);
    }
  }

  // Completa mods y archivos de cada instancia
  for (const server of dist.servers) {
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
  console.log("Listo: distribution.json generado con todas las instancias y sus mods.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});