import path from "path";
import fs from "fs";

function countLines(dir, extensions = [".ts", ".js"]) {
  let totalLines = 0;
  let fileCount = 0;
  const stats = {};

  function walkDir(currentPath) {
    const files = fs.readdirSync(currentPath);

    for (const file of files) {
      const filePath = path.join(currentPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        if (!["node_modules", "dist", ".git"].includes(file)) {
          walkDir(filePath);
        }
      } else {
        const ext = path.extname(file);
        if (extensions.includes(ext)) {
          const content = fs.readFileSync(filePath, "utf8");
          const lines = content.split("\n").length;
          totalLines += lines;
          fileCount++;
          stats[ext] = (stats[ext] || 0) + lines;
          console.log(`${filePath}: ${lines} linhas`);
        }
      }
    }
  }

  walkDir(dir);

  console.log("\n=== RESUMO ===");
  console.log(`Total de arquivos: ${fileCount}`);
  console.log(`Total de linhas: ${totalLines}`);
  console.log("\nPor extensão:");
  Object.entries(stats).forEach(([ext, lines]) => {
    console.log(`${ext}: ${lines} linhas`);
  });
}

countLines(".");
