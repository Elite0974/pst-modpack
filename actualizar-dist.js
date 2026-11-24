const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoDir = "D:\\pst-modpack-repo\\pst-modpack";
const serversRootDir = path.join(repoDir, "servers");
const baseFile = path.join(repoDir, "distribution.base.json");
const outFile = path.join(repoDir, "distribution.json");

const SINGLE_SERVER_ID = "EventoPST-1.20.1";

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
  const rawBase = fs.readFileSync(baseFile, "utf8");
  const dist = JSON.parse(rawBase);

  if (!Array.isArray(dist.servers) || dist.servers.length === 0) {
    console.error("Error: no hay ningún servidor en distribution.base.json");
    process.exit(1);
  }

  // Mantiene solo la instancia principal indicada
  const targetServer =
    dist.servers.find((s) => s.id === SINGLE_SERVER_ID) || dist.servers[0];
  targetServer.mainServer = true;
  dist.servers = [targetServer];

  // Conserva solo módulos no generados (ej. ForgeHosted) y limpia los generados antes
  targetServer.modules = (targetServer.modules || []).filter(
    (m) =>
      typeof m.id === "string" &&
      !m.id.startsWith("generated.forgemod:") &&
      !m.id.startsWith("generated.file:")
  );

  const serverId = targetServer.id;
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

    targetServer.modules.push({
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

    targetServer.modules.push({
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

  fs.writeFileSync(outFile, JSON.stringify(dist, null, 2), "utf8");
  console.log(
    `Listo [${serverId}]: ${forgeJars.length} mods y ${extraFiles.length} archivos en distribution.json.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
