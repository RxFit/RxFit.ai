import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve hashed assets / files directly. index:false so directory requests
  // fall through to our route handler (which controls status codes); no
  // redirect so /blog and /blog/ resolve identically without an extra hop.
  app.use(express.static(distPath, { index: false, redirect: false }));

  const notFoundFile = path.join(distPath, "404.html");

  // Map every request to its prerendered HTML. Known routes (including blog
  // posts) have a generated <route>/index.html and return 200; anything else
  // (unknown URL, non-existent blog slug) returns the 404 shell with HTTP 404.
  app.use("/{*path}", (req, res) => {
    // Derive the path from originalUrl — under an app.use mount, req.path is
    // stripped to "/".
    const reqPath = (req.originalUrl || "/").split("?")[0];
    const clean = reqPath.replace(/\/+$/, "") || "/";
    const candidate =
      clean === "/"
        ? path.join(distPath, "index.html")
        : path.join(distPath, clean, "index.html");

    if (candidate.startsWith(distPath) && fs.existsSync(candidate)) {
      return res.status(200).sendFile(candidate);
    }

    if (fs.existsSync(notFoundFile)) {
      return res.status(404).sendFile(notFoundFile);
    }
    return res.status(404).send("Not Found");
  });
}
